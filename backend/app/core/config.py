"""
GovAI 后端配置

加载优先级（高 → 低）：
  1. 系统环境变量 / docker-compose environment: 注入
  2. .env 文件（自动搜索：/app/.env → backend/.env → 项目根/.env）
  3. 下方 Settings 类中的默认值（仅保留安全的通用默认值）

⚠️  所有地址、密钥、URL 均不硬编码，必须由 .env 或环境变量提供。
"""

import logging
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


def _find_env_file() -> Optional[str]:
    """
    按优先级搜索 .env 文件：
      1. /app/.env          — 容器内（volume 挂载或 env_file 注入）
      2. backend/.env       — 本地开发（相对于 config.py 向上三级）
      3. 项目根/.env        — 本地开发（相对于 config.py 向上四级）
    """
    candidates = [
        Path("/app/.env"),                                              # 容器内
        Path(__file__).resolve().parent.parent.parent / ".env",         # backend/.env
        Path(__file__).resolve().parent.parent.parent.parent / ".env",  # 项目根/.env
    ]
    for p in candidates:
        if p.exists():
            logger.info("📂 加载配置文件: %s", p)
            return str(p)
    logger.warning("⚠️  未找到 .env 文件，将完全依赖系统环境变量")
    return None


class Settings(BaseSettings):
    # ── 数据库（必须由 .env 提供） ──
    DATABASE_URL: str = ""

    # ── Redis ──
    REDIS_URL: str = ""

    # ── JWT ──
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24小时

    # ── 服务 ──
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    APP_DEBUG: bool = True

    # ── 文件存储 ──
    UPLOAD_DIR: str = "/app/uploads"

    # ── CORS ──
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ── Dify（全部由 .env 或 docker-compose 注入，不硬编码地址/密钥） ──
    DIFY_BASE_URL: str = ""
    DIFY_API_KEY: str = ""
    DIFY_DATASET_API_KEY: str = ""
    DIFY_APP_DOC_DRAFT_KEY: str = ""
    DIFY_APP_DOC_CHECK_KEY: str = ""
    DIFY_APP_DOC_OPTIMIZE_KEY: str = ""
    DIFY_APP_CHAT_KEY: str = ""
    DIFY_APP_ENTITY_EXTRACT_KEY: str = ""
    DIFY_MOCK: str = "true"

    model_config = {
        "env_file": _find_env_file(),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

# ── 启动时打印关键配置（脱敏） ──
def _mask(val: str, show: int = 10) -> str:
    """对敏感值脱敏"""
    if not val:
        return "(未设置)"
    return val[:show] + "***" if len(val) > show else val

logger.info(
    "🚀 配置加载完毕  DIFY_MOCK=%s  DIFY_BASE_URL=%s  DATASET_KEY=%s",
    settings.DIFY_MOCK,
    settings.DIFY_BASE_URL or "(未设置)",
    _mask(settings.DIFY_DATASET_API_KEY),
)
