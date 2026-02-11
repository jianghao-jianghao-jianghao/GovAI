"""审计日志工具"""

from uuid import UUID
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id: Optional[UUID],
    user_display_name: str,
    action: str,
    module: str,
    detail: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    """写入审计日志"""
    entry = AuditLog(
        user_id=user_id,
        user_display_name=user_display_name,
        action=action,
        module=module,
        detail=detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    await db.flush()
