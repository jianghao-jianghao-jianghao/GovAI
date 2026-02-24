"""
Dify 服务工厂 — 根据配置返回 Mock 或真实实现。
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

    DIFY_MOCK=true   → MockDifyService   （纯模拟，仅开发调试用）
    DIFY_MOCK=false   → HybridDifyService （默认，全部走真实 Dify API）
    DIFY_MOCK=full    → RealDifyService   （全部走真实 Dify，无 Key 检查）

    默认使用 DIFY_MOCK=false（真实接口模式）：
    - 已配置 API Key 的功能直接调用真实 Dify
    - 未配置 Key 的功能抛出明确错误，不再降级到 Mock
    - 所有异常直接传播，不静默降级
    """
    mode = str(settings.DIFY_MOCK).lower().strip()

    if mode in ("true", "1", "yes"):
        from app.services.dify.mock import MockDifyService
        logger.info("Dify 服务模式: Mock（全部模拟，仅开发调试）")
        return MockDifyService()
    elif mode in ("full",):
        from app.services.dify.client import RealDifyService
        logger.info("Dify 服务模式: Full Real（全部走真实 Dify）")
        return RealDifyService()
    else:
        # false / 0 / no / hybrid → 真实接口模式
        from app.services.dify.hybrid import HybridDifyService
        logger.info("Dify 服务模式: 真实接口（按 API Key 配置，无 Mock 降级）")
        return HybridDifyService()
