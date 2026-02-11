"""审计日志路由"""

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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
    user_keyword: str = Query(None, description="用户名/姓名模糊搜索"),
    module: str = Query(None, description="按模块过滤"),
    action: str = Query(None, description="按动作过滤"),
    start_date: str = Query(None, description="日期起始 (YYYY-MM-DD)"),
    end_date: str = Query(None, description="日期截止 (YYYY-MM-DD)"),
    current_user: User = Depends(require_permission("sys:audit:view")),
    db: AsyncSession = Depends(get_db),
):
    """审计日志列表"""
    query = _build_audit_query(user_keyword, module, action, start_date, end_date)

    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 分页
    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = [_log_to_dict(log) for log in logs]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("/logs/export")
async def export_audit_logs(
    user_keyword: str = Query(None),
    module: str = Query(None),
    action: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    current_user: User = Depends(require_permission("sys:audit:view")),
    db: AsyncSession = Depends(get_db),
):
    """导出审计日志为 CSV"""
    query = _build_audit_query(user_keyword, module, action, start_date, end_date)
    query = query.order_by(AuditLog.created_at.desc()).limit(10000)  # 最大导出 1 万条
    result = await db.execute(query)
    logs = result.scalars().all()

    # 生成 CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["时间", "用户", "模块", "操作", "详情", "IP地址"])
    for log in logs:
        writer.writerow([
            log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else "",
            log.user_display_name or "",
            log.module or "",
            log.action or "",
            log.detail or "",
            str(log.ip_address) if log.ip_address else "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM 头让 Excel 正确识别中文
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


# ── 辅助函数 ──

def _build_audit_query(user_keyword, module, action, start_date, end_date):
    """构建审计日志查询（复用于列表和导出）"""
    query = select(AuditLog)

    if user_keyword:
        query = query.where(
            or_(
                AuditLog.user_display_name.ilike(f"%{user_keyword}%"),
            )
        )
    if module:
        query = query.where(AuditLog.module == module)
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if start_date:
        query = query.where(AuditLog.created_at >= start_date)
    if end_date:
        query = query.where(AuditLog.created_at <= end_date + " 23:59:59")

    return query


def _log_to_dict(log: AuditLog) -> dict:
    """审计日志 → 字典"""
    return {
        "id": str(log.id),
        "user_id": str(log.user_id) if log.user_id else None,
        "user_display_name": log.user_display_name,
        "action": log.action,
        "module": log.module,
        "detail": log.detail,
        "ip_address": str(log.ip_address) if log.ip_address else None,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }
