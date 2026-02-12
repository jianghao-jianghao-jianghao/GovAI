"""
Dify 服务工厂 — 根据配置返回 Mock、Hybrid 或真实实现。
"""

import logging
from functools import lru_cache
from app.core.config import settings
from app.services.dify.base import DifyServiceBase

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_dify_service() -> DifyServiceBase:
    """
    获取 Dify 服务单例。

    DIFY_MOCK=true   → MockDifyService  （纯模拟，开发/无 Dify 环境）
    DIFY_MOCK=false   → HybridDifyService（KB→真实Dify，Workflow/Chat→Mock）
    DIFY_MOCK=full    → RealDifyService  （全部走真实 Dify，所有功能就绪后使用）

    当前推荐使用 DIFY_MOCK=false（Hybrid 模式），
    知识库操作走真实 Dify，其余功能保持 Mock，不影响现有功能。
    """
    mode = str(settings.DIFY_MOCK).lower().strip()

    if mode in ("true", "1", "yes"):
        from app.services.dify.mock import MockDifyService
        logger.info("Dify 服务模式: Mock（全部模拟）")
        return MockDifyService()
    elif mode in ("full",):
        from app.services.dify.client import RealDifyService
        logger.info("Dify 服务模式: Full Real（全部走真实 Dify）")
        return RealDifyService()
    else:
        # false / 0 / no / hybrid → Hybrid 模式
        from app.services.dify.hybrid import HybridDifyService
        logger.info("Dify 服务模式: Hybrid（KB→Real, Workflow/Chat→Mock）")
        return HybridDifyService()
