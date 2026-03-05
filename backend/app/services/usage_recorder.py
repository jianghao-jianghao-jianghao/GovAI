"""
用量记录工具 — 在每次 Dify 调用后写入 usage_records 表。

使用方式（fire-and-forget，不阻塞业务）：
    import asyncio
    asyncio.create_task(record_usage(...))

或同步调用:
    await record_usage(...)
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.usage import UsageRecord

logger = logging.getLogger(__name__)


async def record_usage(
    *,
    user_id: Optional[uuid.UUID] = None,
    user_display_name: str = "system",
    function_type: str,
    tokens_input: int = 0,
    tokens_output: int = 0,
    tokens_total: int = 0,
    duration_ms: int = 0,
    status: str = "success",
    error_message: Optional[str] = None,
    model_name: Optional[str] = None,
    extra: Optional[dict] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    写入一条用量记录。

    如果传了 db，则使用调用方的 session（调用方自行 commit）。
    如果没传 db，则自己创建独立 session 提交（fire-and-forget 场景）。
    """
    try:
        record = UsageRecord(
            user_id=user_id,
            user_display_name=user_display_name,
            function_type=function_type,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            tokens_total=tokens_total or (tokens_input + tokens_output),
            duration_ms=duration_ms,
            status=status,
            error_message=error_message,
            model_name=model_name,
            extra=extra,
        )

        if db is not None:
            db.add(record)
            await db.flush()
        else:
            async with AsyncSessionLocal() as session:
                session.add(record)
                await session.commit()

        logger.debug(
            f"[UsageRecorder] {function_type} user={user_display_name} "
            f"tokens={tokens_total} status={status}"
        )
    except Exception as e:
        # 用量记录失败不应阻塞业务
        logger.warning(f"[UsageRecorder] 写入失败: {e}")


def extract_usage_from_dify_metadata(metadata: dict) -> dict:
    """
    从 Dify 的 message_end metadata 中提取 usage 信息。

    Dify 典型返回:
    {
        "usage": {
            "prompt_tokens": 123,
            "completion_tokens": 456,
            "total_tokens": 579,
            "prompt_unit_price": "0.001",
            "total_price": "0.003",
            "currency": "USD",
            "latency": 1.234
        }
    }
    """
    usage = metadata.get("usage", {})
    return {
        "tokens_input": usage.get("prompt_tokens", 0) or 0,
        "tokens_output": usage.get("completion_tokens", 0) or 0,
        "tokens_total": usage.get("total_tokens", 0) or 0,
        "duration_ms": int((usage.get("latency", 0) or 0) * 1000),
        "model_name": usage.get("model", None),
        "extra": {
            k: v for k, v in usage.items()
            if k not in ("prompt_tokens", "completion_tokens", "total_tokens", "latency")
        } or None,
    }
