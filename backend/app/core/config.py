"""GovAI 后端配置"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


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
    UPLOAD_DIR: str = "/app/uploads"  # 知识库文件本地存储目录

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Dify
    DIFY_BASE_URL: str = "http://localhost/v1"
    DIFY_API_KEY: str = ""
    DIFY_DATASET_API_KEY: str = ""               # 知识库 Dataset API Key
    DIFY_APP_DOC_DRAFT_KEY: str = ""             # 公文起草 Workflow App Key
    DIFY_APP_DOC_CHECK_KEY: str = ""             # 公文检查 Workflow App Key
    DIFY_APP_DOC_OPTIMIZE_KEY: str = ""          # 公文优化 Workflow App Key
    DIFY_APP_QA_CHAT_KEY: str = ""               # 智能问答 Chat App Key
    DIFY_APP_ENTITY_EXTRACT_KEY: str = ""        # 实体抽取 Workflow App Key
    DIFY_MOCK: bool = True  # True=使用 Mock 服务, False=连接真实 Dify

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }


settings = Settings()
