"""素材库管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.core.audit import log_action
from app.models.user import User
from app.models.document import Material
from app.schemas.material import MaterialCreateRequest, MaterialUpdateRequest, MaterialListItem

router = APIRouter(prefix="/materials", tags=["Materials"])


@router.get("")
async def list_materials(
    category: str = Query(None),
    keyword: str = Query(None),
    current_user: User = Depends(require_permission("res:material:manage")),
    db: AsyncSession = Depends(get_db),
):
    """素材列表"""
    query = select(Material)
    if category:
        query = query.where(Material.category == category)
    if keyword:
        query = query.where(Material.title.ilike(f"%{keyword}%"))

    query = query.order_by(Material.created_at.desc())
    result = await db.execute(query)
    materials = result.scalars().all()

    items = [MaterialListItem.model_validate(m).model_dump(mode="json") for m in materials]
    return success(data=items)


@router.post("")
async def create_material(
    body: MaterialCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:material:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建素材"""
    material = Material(
        title=body.title,
        category=body.category,
        content=body.content,
        created_by=current_user.id,
    )
    db.add(material)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建素材", module="素材库",
        detail=f"创建素材: {body.title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(material.id)}, message="创建成功")


@router.put("/{material_id}")
async def update_material(
    material_id: UUID,
    body: MaterialUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:material:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新素材"""
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        return error(ErrorCode.NOT_FOUND, "素材不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(material, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新素材", module="素材库",
        detail=f"更新素材: {material.title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/{material_id}")
async def delete_material(
    material_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("res:material:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除素材"""
    result = await db.execute(select(Material).where(Material.id == material_id))
    material = result.scalar_one_or_none()
    if not material:
        return error(ErrorCode.NOT_FOUND, "素材不存在")

    title = material.title
    await db.delete(material)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除素材", module="素材库",
        detail=f"删除素材: {title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")
