"""GovAI 后端 — FastAPI 入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.redis import close_redis
from app.core.response import error, ErrorCode
from app.core.deps import AuthError
from app.api import auth, users, roles, audit


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    yield
    await close_redis()


app = FastAPI(
    title="GovAI 智政系统 API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- 全局异常处理 ----
@app.exception_handler(AuthError)
async def auth_error_handler(request: Request, exc: AuthError):
    status_code = 401 if exc.code in (ErrorCode.AUTH_FAILED, ErrorCode.TOKEN_EXPIRED, ErrorCode.TOKEN_INVALID) else 403
    return JSONResponse(
        status_code=status_code,
        content=error(exc.code, exc.message),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=error(ErrorCode.INTERNAL_ERROR, f"服务器内部错误: {str(exc)}"),
    )


# ---- 注册路由 ----
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(roles.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")


# ---- 健康检查 ----
@app.get("/health")
async def health():
    return {"status": "ok"}
