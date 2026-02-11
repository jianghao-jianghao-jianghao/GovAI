"""GovAI 后端 — FastAPI 入口"""

import logging
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
from app.api import auth, users, roles, audit, documents, templates, materials, knowledge, chat, qa, sensitive, graph

# ---- 日志配置 ----
logging.basicConfig(
    level=logging.DEBUG if settings.APP_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("govai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    logger.info("🚀 GovAI 后端启动 (DIFY_MOCK=%s)", settings.DIFY_MOCK)
    yield
    await close_redis()
    logger.info("👋 GovAI 后端关闭")


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
    logger.exception("未捕获异常: %s", str(exc))
    return JSONResponse(
        status_code=500,
        content=error(ErrorCode.INTERNAL_ERROR, f"服务器内部错误: {str(exc)}"),
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


# ---- 健康检查 ----
@app.get("/health")
async def health():
    return {"status": "ok"}
