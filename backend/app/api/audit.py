"""审计日志路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success
from app.core.deps import require_permission
from app.models.user import User, AuditLog

router = APIRouter(prefix="/audit", tags=["AuditLogs"])


@router.get("/logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None, description="搜索关键词（匹配用户名、操作、模块）"),
    module: str = Query(None, description="按模块过滤"),
    current_user: User = Depends(require_permission("sys:audit:view")),
    db: AsyncSession = Depends(get_db),
):
    """审计日志列表"""
    query = select(AuditLog)

    if keyword:
        query = query.where(
            or_(
                AuditLog.user_display_name.ilike(f"%{keyword}%"),
                AuditLog.action.ilike(f"%{keyword}%"),
                AuditLog.module.ilike(f"%{keyword}%"),
                AuditLog.detail.ilike(f"%{keyword}%"),
            )
        )
    if module:
        query = query.where(AuditLog.module == module)

    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 分页
    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "user_display_name": log.user_display_name,
            "action": log.action,
            "module": log.module,
            "detail": log.detail,
            "ip_address": str(log.ip_address) if log.ip_address else None,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})
