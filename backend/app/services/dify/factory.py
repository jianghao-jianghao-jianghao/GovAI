"""
Dify 服务工厂 — 根据配置返回 Mock 或真实实现。
"""

from functools import lru_cache
from app.core.config import settings
from app.services.dify.base import DifyServiceBase


@lru_cache(maxsize=1)
def get_dify_service() -> DifyServiceBase:
    """
    获取 Dify 服务单例。
    DIFY_MOCK=true  → MockDifyService（开发/测试用）
    DIFY_MOCK=false → RealDifyService（Dify 就绪后切换）
    """
    if settings.DIFY_MOCK:
        from app.services.dify.mock import MockDifyService
        return MockDifyService()
    else:
        from app.services.dify.client import RealDifyService
        return RealDifyService()
