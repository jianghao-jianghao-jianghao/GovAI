"""公文模板管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.core.audit import log_action
from app.models.user import User
from app.models.document import DocumentTemplate
from app.schemas.template import (
    TemplateCreateRequest, TemplateUpdateRequest,
    TemplateListItem, TemplateDetail,
)

router = APIRouter(prefix="/templates", tags=["DocumentTemplates"])


@router.get("")
async def list_templates(
    template_type: str = Query(None),
    is_active: bool = Query(None),
    current_user: User = Depends(require_permission("res:template:manage")),
    db: AsyncSession = Depends(get_db),
):
    """模板列表"""
    query = select(DocumentTemplate)
    if template_type:
        query = query.where(DocumentTemplate.template_type == template_type)
    if is_active is not None:
        query = query.where(DocumentTemplate.is_active == is_active)

    query = query.order_by(DocumentTemplate.created_at.desc())
    result = await db.execute(query)
    templates = result.scalars().all()

    items = [TemplateListItem.model_validate(t).model_dump(mode="json") for t in templates]
    return success(data=items)


@router.post("")
async def create_template(
    body: TemplateCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:template:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建模板"""
    template = DocumentTemplate(
        name=body.name,
        template_type=body.template_type,
        content=body.content,
        created_by=current_user.id,
    )
    db.add(template)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建公文模板", module="公文模板",
        detail=f"创建模板: {body.name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(template.id)}, message="创建成功")


@router.get("/{template_id}")
async def get_template(
    template_id: UUID,
    current_user: User = Depends(require_permission("res:template:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取模板详情"""
    result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return error(ErrorCode.NOT_FOUND, "模板不存在")

    return success(data=TemplateDetail.model_validate(template).model_dump(mode="json"))


@router.put("/{template_id}")
async def update_template(
    template_id: UUID,
    body: TemplateUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:template:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新模板"""
    result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return error(ErrorCode.NOT_FOUND, "模板不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新公文模板", module="公文模板",
        detail=f"更新模板: {template.name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/{template_id}")
async def delete_template(
    template_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("res:template:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除模板"""
    result = await db.execute(select(DocumentTemplate).where(DocumentTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        return error(ErrorCode.NOT_FOUND, "模板不存在")

    name = template.name
    await db.delete(template)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除公文模板", module="公文模板",
        detail=f"删除模板: {name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")
