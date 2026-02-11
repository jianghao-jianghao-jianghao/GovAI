"""敏感词规则管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission, get_current_user
from app.core.audit import log_action
from app.models.user import User
from app.models.sensitive import SensitiveRule
from app.schemas.sensitive import (
    SensitiveRuleCreateRequest, SensitiveRuleUpdateRequest,
    SensitiveRuleListItem, SensitiveCheckRequest, SensitiveCheckResponse,
)
from app.services.sensitive import check_sensitive_text

router = APIRouter(prefix="/rules", tags=["SensitiveRules"])


@router.get("")
async def list_rules(
    action: str = Query(None),
    is_active: bool = Query(None),
    current_user: User = Depends(require_permission("sys:rule:manage")),
    db: AsyncSession = Depends(get_db),
):
    """敏感词规则列表"""
    query = select(SensitiveRule)
    if action:
        query = query.where(SensitiveRule.action == action)
    if is_active is not None:
        query = query.where(SensitiveRule.is_active == is_active)

    query = query.order_by(SensitiveRule.created_at.desc())
    result = await db.execute(query)
    rules = result.scalars().all()

    items = [SensitiveRuleListItem.model_validate(r).model_dump(mode="json") for r in rules]
    return success(data=items)


@router.post("")
async def create_rule(
    body: SensitiveRuleCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:rule:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建敏感词规则"""
    rule = SensitiveRule(
        keyword=body.keyword,
        action=body.action,
        level=body.level,
        note=body.note,
        created_by=current_user.id,
    )
    db.add(rule)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建敏感词规则", module="安全规则",
        detail=f"关键词: {body.keyword}, 动作: {body.action}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(rule.id)}, message="创建成功")


@router.put("/{rule_id}")
async def update_rule(
    rule_id: UUID,
    body: SensitiveRuleUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:rule:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新敏感词规则"""
    result = await db.execute(select(SensitiveRule).where(SensitiveRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return error(ErrorCode.NOT_FOUND, "规则不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新敏感词规则", module="安全规则",
        detail=f"更新规则: {rule.keyword}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("sys:rule:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除敏感词规则"""
    result = await db.execute(select(SensitiveRule).where(SensitiveRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        return error(ErrorCode.NOT_FOUND, "规则不存在")

    keyword = rule.keyword
    await db.delete(rule)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除敏感词规则", module="安全规则",
        detail=f"删除规则: {keyword}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")


@router.post("/check")
async def check_text(
    body: SensitiveCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """敏感词检测（登录即可使用）"""
    result = await check_sensitive_text(db, body.text)

    hits = [
        {
            "keyword": h.keyword,
            "action": h.action,
            "level": h.level,
            "note": h.note,
        }
        for h in result.hits
    ]

    return success(data={"passed": result.passed, "hits": hits})
