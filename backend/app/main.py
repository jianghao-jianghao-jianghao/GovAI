"""GovAI 后端 — FastAPI 入口"""

import asyncio
import errno
import fcntl
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.redis import close_redis
from app.core.response import error, ErrorCode
from app.core.deps import AuthError
from app.core.middleware import RequestLoggingMiddleware
from app.api import auth, users, roles, audit, documents, templates, materials, knowledge, chat, qa, sensitive, graph, docformat, llm_models, usage, format_presets

# ---- 日志配置 ----
logging.basicConfig(
    level=logging.DEBUG if settings.APP_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("govai")
_STARTUP_LOCK_PATH = "/tmp/govai_startup_once.lock"
_startup_background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    logger.info("🚀 GovAI 后端启动 (DIFY_MOCK=%s)", settings.DIFY_MOCK)
    startup_lock_fd = _acquire_startup_lock()
    await _run_singleton_startup_tasks(startup_lock_fd)
    yield
    await _cancel_startup_background_tasks()
    # 关闭 Dify httpx 连接池
    try:
        from app.services.dify.factory import get_dify_service
        dify_svc = get_dify_service()
        if hasattr(dify_svc, 'close'):
            await dify_svc.close()
            logger.info("✅ Dify 连接池已关闭")
    except Exception as e:
        logger.warning(f"关闭 Dify 连接池失败: {e}")
    # 关闭 AGE 连接池
    try:
        from app.services.graph_service import _graph_service
        if _graph_service is not None:
            await _graph_service.close()
    except Exception as e:
        logger.warning(f"关闭 AGE 连接池失败: {e}")
    _release_startup_lock(startup_lock_fd)
    await close_redis()
    logger.info("👋 GovAI 后端关闭")


def _acquire_startup_lock() -> int | None:
    """同一容器内只允许一个 worker 执行一次性启动任务。"""
    fd = os.open(_STARTUP_LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except OSError as e:
        os.close(fd)
        if e.errno in (errno.EACCES, errno.EAGAIN):
            return None
        raise


def _release_startup_lock(lock_fd: int | None) -> None:
    if lock_fd is None:
        return
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
    finally:
        os.close(lock_fd)


def _schedule_startup_background_task(coro, task_name: str) -> asyncio.Task:
    """注册启动后的后台任务，避免把远程依赖放在冷启动关键路径。"""
    task = asyncio.create_task(coro, name=f"startup:{task_name}")
    _startup_background_tasks.add(task)

    def _on_done(done_task: asyncio.Task) -> None:
        _startup_background_tasks.discard(done_task)
        try:
            exc = done_task.exception()
        except asyncio.CancelledError:
            logger.info("⏹️  启动后台任务已取消: %s", task_name)
            return
        if exc:
            logger.warning("启动后台任务失败 [%s]: %s", task_name, exc)

    task.add_done_callback(_on_done)
    return task


async def _cancel_startup_background_tasks() -> None:
    if not _startup_background_tasks:
        return

    pending = list(_startup_background_tasks)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    _startup_background_tasks.clear()


async def _run_singleton_startup_tasks(startup_lock_fd: int | None) -> None:
    """仅由拿到启动锁的 worker 执行一次性初始化。"""
    if startup_lock_fd is None:
        logger.info("⏭️  启动锁已被其他 worker 持有，跳过一次性初始化")
        return

    async def _run_step(step_name: str, step_coro) -> None:
        try:
            await step_coro()
        except Exception as e:
            logger.warning("启动阶段失败 [%s]: %s", step_name, e)

    # 补齐历史数据库中缺失的枚举值，避免 review 阶段写入失败
    await _run_step("doc-status-enum", _ensure_document_status_enum)
    # 确保图谱表存在（防止 postgres 卷已初始化但表缺失）
    await _run_step("graph", _ensure_graph_tables)
    # 确保模型管理与用量统计表存在
    await _run_step("model-usage", _ensure_model_usage_tables)
    # 确保排版预设表存在
    await _run_step("format-preset", _ensure_format_preset_table)
    # 知识库同步依赖远程 Dify，放到后台执行，避免阻塞冷启动可用性。
    _schedule_startup_background_task(_sync_kb_on_startup(), "kb-sync")


async def _ensure_document_status_enum():
    """启动时补齐历史数据库缺失的 doc_status 枚举值。"""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'reviewed' AFTER 'optimized'")
            )
            await session.commit()
            logger.info("✅ doc_status 枚举检查完成")
    except Exception as e:
        logger.warning(f"doc_status 枚举检查失败（不影响启动）: {e}")


async def _ensure_graph_tables():
    """启动时确保 graph_entities / graph_relationships 表存在"""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS graph_entities (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name            VARCHAR(255) NOT NULL,
                    entity_type     VARCHAR(100) NOT NULL,
                    group_id        INTEGER      NOT NULL DEFAULT 1,
                    weight          INTEGER      NOT NULL DEFAULT 10,
                    source_doc_id   UUID,
                    properties      JSONB,
                    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                )
            """))
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS graph_relationships (
                    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_entity_id UUID NOT NULL,
                    target_entity_id UUID NOT NULL,
                    relation_type    VARCHAR(100) NOT NULL,
                    relation_desc    VARCHAR(255),
                    weight           NUMERIC(4,2) DEFAULT 1.0,
                    source_doc_id    UUID,
                    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    UNIQUE(source_entity_id, target_entity_id, relation_type)
                )
            """))
            # kb_files 图谱字段
            for col, typ in [
                ("graph_status", "VARCHAR(50)"),
                ("graph_error", "TEXT"),
                ("graph_node_count", "INTEGER DEFAULT 0"),
                ("graph_edge_count", "INTEGER DEFAULT 0"),
            ]:
                await session.execute(text(
                    f"ALTER TABLE kb_files ADD COLUMN IF NOT EXISTS {col} {typ}"
                ))
            # pg_trgm 三字母索引加速 ILIKE 模糊搜索
            try:
                await session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                await session.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_graph_entities_name_trgm "
                    "ON graph_entities USING gin (name gin_trgm_ops)"
                ))
            except Exception:
                logger.debug("pg_trgm 扩展或索引创建跳过（可能权限不足）")
            await session.commit()
            logger.info("✅ 图谱表结构检查完成")
    except Exception as e:
        logger.warning(f"图谱表结构检查失败（不影响启动）: {e}")


async def _sync_kb_on_startup():
    """启动时同步本地知识库与 Dify，确保强一致性"""
    if settings.DIFY_MOCK == "true":
        logger.info("⏭️  DIFY_MOCK=true，跳过知识库同步")
        return
    try:
        from app.services.kb_sync import sync_kb_with_dify
        await sync_kb_with_dify()
    except Exception as e:
        logger.warning(f"知识库同步失败（不影响启动）: {e}")


async def _ensure_format_preset_table():
    """启动时确保 format_presets 表存在"""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS format_presets (
                    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name        VARCHAR(200) NOT NULL,
                    category    VARCHAR(100) NOT NULL DEFAULT '公文写作',
                    description VARCHAR(500) DEFAULT '',
                    instruction TEXT DEFAULT '',
                    system_prompt TEXT DEFAULT '',
                    user_id     UUID NOT NULL,
                    created_at  TIMESTAMPTZ DEFAULT now(),
                    updated_at  TIMESTAMPTZ DEFAULT now()
                )
            """))
            await session.commit()
            logger.info("✅ format_presets 表就绪")
    except Exception as e:
        logger.warning(f"format_presets 表检查失败（不影响启动）: {e}")


async def _ensure_model_usage_tables():
    """启动时确保 llm_models / usage_records / usage_alerts 表存在"""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text
    try:
        async with AsyncSessionLocal() as session:
            # 创建枚举类型（如果不存在）
            await session.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE llm_model_type AS ENUM ('text_generation', 'semantic_understanding', 'knowledge_qa', 'embedding', 'other');
                EXCEPTION WHEN duplicate_object THEN null;
                END $$
            """))
            await session.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE llm_deployment AS ENUM ('local', 'remote');
                EXCEPTION WHEN duplicate_object THEN null;
                END $$
            """))

            # 模型管理表
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS llm_models (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name            VARCHAR(200) NOT NULL,
                    provider        VARCHAR(100) NOT NULL,
                    model_id        VARCHAR(200) NOT NULL,
                    model_type      llm_model_type NOT NULL,
                    deployment      llm_deployment NOT NULL DEFAULT 'remote',
                    endpoint_url    VARCHAR(500) NOT NULL,
                    api_key         VARCHAR(500),
                    temperature     FLOAT DEFAULT 0.7,
                    max_tokens      INTEGER DEFAULT 2048,
                    top_p           FLOAT DEFAULT 0.9,
                    top_k           INTEGER DEFAULT 50,
                    frequency_penalty FLOAT DEFAULT 0.0,
                    presence_penalty  FLOAT DEFAULT 0.0,
                    extra_params    JSONB,
                    is_active       BOOLEAN DEFAULT true,
                    is_default      BOOLEAN DEFAULT false,
                    description     TEXT,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))

            # 用量记录表
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS usage_records (
                    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id           UUID,
                    user_display_name VARCHAR(100) NOT NULL,
                    model_id          UUID,
                    model_name        VARCHAR(200),
                    function_type     VARCHAR(50) NOT NULL,
                    tokens_input      INTEGER DEFAULT 0,
                    tokens_output     INTEGER DEFAULT 0,
                    tokens_total      INTEGER DEFAULT 0,
                    duration_ms       INTEGER DEFAULT 0,
                    status            VARCHAR(20) DEFAULT 'success',
                    error_message     TEXT,
                    extra             JSONB,
                    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))

            # 用量告警表
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS usage_alerts (
                    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    alert_type        VARCHAR(50) NOT NULL,
                    severity          VARCHAR(20) DEFAULT 'warning',
                    user_id           UUID,
                    user_display_name VARCHAR(100),
                    title             VARCHAR(200) NOT NULL,
                    detail            TEXT,
                    is_read           BOOLEAN DEFAULT false,
                    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))

            # 索引
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_records_function_type ON usage_records(function_type)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_usage_alerts_is_read ON usage_alerts(is_read)"))
            await session.execute(text("CREATE INDEX IF NOT EXISTS idx_llm_models_type_active ON llm_models(model_type, is_active)"))

            await session.commit()
            logger.info("✅ 模型管理与用量统计表结构检查完成")
    except Exception as e:
        logger.warning(f"模型/用量表结构检查失败（不影响启动）: {e}")


app = FastAPI(
    title="GovAI 智政系统 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---- 中间件 (注意：后添加的先执行) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


# ---- 全局异常处理 ----
@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    status_code = 401 if exc.code in (ErrorCode.AUTH_FAILED, ErrorCode.TOKEN_EXPIRED, ErrorCode.TOKEN_INVALID) else 403
    return JSONResponse(
        status_code=status_code,
        content=error(exc.code, exc.message),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Pydantic 参数校验失败 → 统一 1001 错误码"""
    details = []
    for err in exc.errors():
        loc = " → ".join(str(l) for l in err["loc"])
        details.append(f"{loc}: {err['msg']}")
    return JSONResponse(
        status_code=422,
        content=error(ErrorCode.PARAM_INVALID, "参数校验失败: " + "; ".join(details)),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("未捕获异常: %s", str(exc), exc_info=exc)
    message = "服务器内部错误"
    if settings.APP_DEBUG:
        message = f"{message}: {exc}"
    return JSONResponse(
        status_code=500,
        content=error(ErrorCode.INTERNAL_ERROR, message),
    )


# ---- 注册路由 ----
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(roles.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(materials.router, prefix="/api/v1")
app.include_router(knowledge.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(qa.router, prefix="/api/v1")
app.include_router(sensitive.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(docformat.router, prefix="/api/v1")
app.include_router(llm_models.router, prefix="/api/v1")
app.include_router(usage.router, prefix="/api/v1")
app.include_router(format_presets.router, prefix="/api/v1")


# ---- 健康检查 ----
@app.get("/health")
async def health():
    return {"status": "ok"}
