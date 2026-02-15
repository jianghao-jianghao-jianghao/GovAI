"""
GovAI 后端配置

加载优先级（高 → 低）：
  1. 系统环境变量（docker-compose environment: 注入）
  2. backend/.env 文件（本地开发 / 容器内 /app/.env）
  3. 下方 Settings 类中的默认值
"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


# backend/.env 路径（向上三级: core → app → backend）
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    # 数据库
    DATABASE_URL: str = "postgresql+asyncpg://govai_user:govai_password@localhost:5432/govai_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "govai-dev-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24小时

    # 服务
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    APP_DEBUG: bool = True

    # 文件存储
    UPLOAD_DIR: str = "/app/uploads"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Dify
    DIFY_BASE_URL: str = "http://host.docker.internal:19090/v1"
    DIFY_API_KEY: str = ""
    DIFY_DATASET_API_KEY: str = ""
    DIFY_APP_DOC_DRAFT_KEY: str = ""
    DIFY_APP_DOC_CHECK_KEY: str = ""
    DIFY_APP_DOC_OPTIMIZE_KEY: str = ""
    DIFY_APP_CHAT_KEY: str = ""
    DIFY_APP_ENTITY_EXTRACT_KEY: str = ""
    DIFY_MOCK: str = "true"

    model_config = {
        "env_file": str(_ENV_FILE) if _ENV_FILE.exists() else None,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
