"""用量统计路由"""

import csv
import io
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, cast, Date, String, case, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.models.user import User
from app.models.usage import UsageRecord, UsageAlert

router = APIRouter(prefix="/usage", tags=["UsageStatistics"])

# ── 功能类型映射 ──
FUNCTION_TYPE_MAP = {
    "doc_draft": "公文起草",
    "doc_check": "公文审查",
    "doc_format": "公文排版",
    "doc_optimize": "公文优化",
    "qa_chat": "智能问答",
    "entity_extract": "实体抽取",
    "knowledge_qa": "知识检索",
    "embedding": "文档向量化",
    "sensitive_check": "敏感词检测",
    "other": "其他",
}


# ── 概览统计 ──
@router.get("/overview")
async def usage_overview(
    start_date: str = Query(None, description="起始日期 YYYY-MM-DD"),
    end_date: str = Query(None, description="截止日期 YYYY-MM-DD"),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """用量概览：总调用次数、总Token消耗、成功率、活跃用户数"""
    query = select(UsageRecord)
    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    base = query.subquery()

    # 聚合统计
    stats = await db.execute(
        select(
            func.count().label("total_calls"),
            func.coalesce(func.sum(base.c.tokens_total), 0).label("total_tokens"),
            func.coalesce(func.sum(base.c.tokens_input), 0).label("total_input_tokens"),
            func.coalesce(func.sum(base.c.tokens_output), 0).label("total_output_tokens"),
            func.count(func.distinct(base.c.user_id)).label("active_users"),
            func.coalesce(func.avg(base.c.duration_ms), 0).label("avg_duration"),
            func.sum(case((base.c.status == "success", 1), else_=0)).label("success_count"),
            func.sum(case((base.c.status == "error", 1), else_=0)).label("error_count"),
        ).select_from(base)
    )
    row = stats.one()
    total_calls = row.total_calls or 0
    success_rate = round(row.success_count / total_calls * 100, 1) if total_calls > 0 else 100.0

    return success(data={
        "total_calls": total_calls,
        "total_tokens": int(row.total_tokens),
        "total_input_tokens": int(row.total_input_tokens),
        "total_output_tokens": int(row.total_output_tokens),
        "active_users": row.active_users or 0,
        "avg_duration_ms": round(float(row.avg_duration), 1),
        "success_rate": success_rate,
        "error_count": row.error_count or 0,
    })


# ── 按时间维度统计 ──
@router.get("/by-time")
async def usage_by_time(
    granularity: str = Query("day", description="时间粒度: hour/day/week/month"),
    start_date: str = Query(None),
    end_date: str = Query(None),
    function_type: str = Query(None, description="功能类型筛选"),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """按时间维度统计调用次数和Token消耗"""
    # 使用 PostgreSQL date_trunc
    trunc_map = {"hour": "hour", "day": "day", "week": "week", "month": "month"}
    trunc = trunc_map.get(granularity, "day")

    query = select(
        func.date_trunc(trunc, UsageRecord.created_at).label("time_bucket"),
        func.count().label("call_count"),
        func.coalesce(func.sum(UsageRecord.tokens_total), 0).label("token_count"),
        func.coalesce(func.sum(UsageRecord.tokens_input), 0).label("input_tokens"),
        func.coalesce(func.sum(UsageRecord.tokens_output), 0).label("output_tokens"),
        func.sum(case((UsageRecord.status == "error", 1), else_=0)).label("error_count"),
    )

    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))
    if function_type:
        query = query.where(UsageRecord.function_type == function_type)

    query = query.group_by("time_bucket").order_by("time_bucket")
    result = await db.execute(query)
    rows = result.all()

    items = [
        {
            "time": row.time_bucket.isoformat() if row.time_bucket else None,
            "call_count": row.call_count,
            "token_count": int(row.token_count),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
            "error_count": row.error_count or 0,
        }
        for row in rows
    ]
    return success(data=items)


# ── 按功能维度统计 ──
@router.get("/by-function")
async def usage_by_function(
    start_date: str = Query(None),
    end_date: str = Query(None),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """按功能维度统计"""
    query = select(
        UsageRecord.function_type,
        func.count().label("call_count"),
        func.coalesce(func.sum(UsageRecord.tokens_total), 0).label("token_count"),
        func.coalesce(func.avg(UsageRecord.duration_ms), 0).label("avg_duration"),
        func.sum(case((UsageRecord.status == "error", 1), else_=0)).label("error_count"),
    )

    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    query = query.group_by(UsageRecord.function_type).order_by(func.count().desc())
    result = await db.execute(query)
    rows = result.all()

    items = [
        {
            "function_type": row.function_type,
            "function_label": FUNCTION_TYPE_MAP.get(row.function_type, row.function_type),
            "call_count": row.call_count,
            "token_count": int(row.token_count),
            "avg_duration_ms": round(float(row.avg_duration), 1),
            "error_count": row.error_count or 0,
        }
        for row in rows
    ]
    return success(data=items)


# ── 按用户维度统计 ──
@router.get("/by-user")
async def usage_by_user(
    start_date: str = Query(None),
    end_date: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """按用户维度统计"""
    query = select(
        UsageRecord.user_id,
        UsageRecord.user_display_name,
        func.count().label("call_count"),
        func.coalesce(func.sum(UsageRecord.tokens_total), 0).label("token_count"),
        func.coalesce(func.avg(UsageRecord.duration_ms), 0).label("avg_duration"),
        func.sum(case((UsageRecord.status == "error", 1), else_=0)).label("error_count"),
    )

    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    query = query.group_by(UsageRecord.user_id, UsageRecord.user_display_name)

    # 总数
    count_sub = query.subquery()
    total = (await db.execute(select(func.count()).select_from(count_sub))).scalar() or 0

    query = query.order_by(func.count().desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    items = [
        {
            "user_id": str(row.user_id) if row.user_id else None,
            "user_display_name": row.user_display_name,
            "call_count": row.call_count,
            "token_count": int(row.token_count),
            "avg_duration_ms": round(float(row.avg_duration), 1),
            "error_count": row.error_count or 0,
        }
        for row in rows
    ]
    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


# ── 调用明细列表 ──
@router.get("/records")
async def list_usage_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_keyword: str = Query(None),
    function_type: str = Query(None),
    status: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """调用记录明细"""
    query = select(UsageRecord)
    if user_keyword:
        query = query.where(UsageRecord.user_display_name.ilike(f"%{user_keyword}%"))
    if function_type:
        query = query.where(UsageRecord.function_type == function_type)
    if status:
        query = query.where(UsageRecord.status == status)
    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(UsageRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    records = result.scalars().all()

    items = [
        {
            "id": str(r.id),
            "user_id": str(r.user_id) if r.user_id else None,
            "user_display_name": r.user_display_name,
            "model_name": r.model_name,
            "function_type": r.function_type,
            "function_label": FUNCTION_TYPE_MAP.get(r.function_type, r.function_type),
            "tokens_input": r.tokens_input,
            "tokens_output": r.tokens_output,
            "tokens_total": r.tokens_total,
            "duration_ms": r.duration_ms,
            "status": r.status,
            "error_message": r.error_message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]
    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


# ── 数据导出 ──
@router.post("/export")
async def export_usage(
    start_date: str = Query(None),
    end_date: str = Query(None),
    function_type: str = Query(None),
    user_keyword: str = Query(None),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """导出用量数据为 CSV"""
    query = select(UsageRecord)
    if user_keyword:
        query = query.where(UsageRecord.user_display_name.ilike(f"%{user_keyword}%"))
    if function_type:
        query = query.where(UsageRecord.function_type == function_type)
    if start_date:
        query = query.where(UsageRecord.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
    if end_date:
        query = query.where(UsageRecord.created_at <= datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S"))

    query = query.order_by(UsageRecord.created_at.desc()).limit(50000)
    result = await db.execute(query)
    records = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["时间", "用户", "功能", "模型", "输入Token", "输出Token", "总Token", "耗时(ms)", "状态", "错误信息"])
    for r in records:
        writer.writerow([
            r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            r.user_display_name or "",
            FUNCTION_TYPE_MAP.get(r.function_type, r.function_type),
            r.model_name or "",
            r.tokens_input,
            r.tokens_output,
            r.tokens_total,
            r.duration_ms,
            r.status,
            r.error_message or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=usage_records.csv"},
    )


# ── 异常告警列表 ──
@router.get("/alerts")
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_read: bool = Query(None),
    severity: str = Query(None),
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """异常使用告警列表"""
    query = select(UsageAlert)
    if is_read is not None:
        query = query.where(UsageAlert.is_read == is_read)
    if severity:
        query = query.where(UsageAlert.severity == severity)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(UsageAlert.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    alerts = result.scalars().all()

    items = [
        {
            "id": str(a.id),
            "alert_type": a.alert_type,
            "severity": a.severity,
            "user_id": str(a.user_id) if a.user_id else None,
            "user_display_name": a.user_display_name,
            "title": a.title,
            "detail": a.detail,
            "is_read": a.is_read,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]
    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


# ── 标记告警已读 ──
@router.put("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """标记告警已读"""
    result = await db.execute(select(UsageAlert).where(UsageAlert.id == UUID(alert_id)))
    alert = result.scalar_one_or_none()
    if not alert:
        return error(ErrorCode.NOT_FOUND, "告警不存在")
    alert.is_read = True
    await db.flush()
    return success(message="已标记为已读")


# ── 全部标记已读 ──
@router.put("/alerts/read-all")
async def mark_all_alerts_read(
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """全部标记已读"""
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(UsageAlert).where(UsageAlert.is_read == False).values(is_read=True)
    )
    await db.flush()
    return success(message="全部已读")


# ── 未读告警数 ──
@router.get("/alerts/unread-count")
async def unread_alert_count(
    current_user: User = Depends(require_permission("sys:usage:view")),
    db: AsyncSession = Depends(get_db),
):
    """获取未读告警数"""
    count = (await db.execute(
        select(func.count()).where(UsageAlert.is_read == False)
    )).scalar() or 0
    return success(data={"count": count})
