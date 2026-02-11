"""角色管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.core.audit import log_action
from app.models.user import User, Role, RolePermission
from app.schemas.role import RoleCreateRequest, RoleUpdateRequest

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("")
async def list_roles(
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """角色列表"""
    # 查所有角色
    result = await db.execute(select(Role).order_by(Role.created_at))
    roles = result.scalars().all()

    # 批量查权限
    all_perms = await db.execute(select(RolePermission))
    perms_map: dict[UUID, list[str]] = {}
    for rp in all_perms.scalars().all():
        perms_map.setdefault(rp.role_id, []).append(rp.permission_key)

    # 批量查用户数
    user_counts_result = await db.execute(
        select(User.role_id, func.count(User.id)).group_by(User.role_id)
    )
    user_count_map = {row[0]: row[1] for row in user_counts_result.all()}

    items = [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "is_system": r.is_system,
            "permissions": perms_map.get(r.id, []),
            "user_count": user_count_map.get(r.id, 0),
            "created_at": r.created_at.isoformat(),
        }
        for r in roles
    ]

    return success(data=items)


@router.post("")
async def create_role(
    body: RoleCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建角色"""
    # 检查名称唯一
    exists = await db.execute(select(Role).where(Role.name == body.name))
    if exists.scalar_one_or_none():
        return error(ErrorCode.CONFLICT, f"角色名 '{body.name}' 已存在")

    role = Role(name=body.name, description=body.description)
    db.add(role)
    await db.flush()

    # 写入权限
    for key in body.permissions:
        db.add(RolePermission(role_id=role.id, permission_key=key))
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="创建角色",
        module="角色管理",
        detail=f"创建角色 {body.name}，权限数: {len(body.permissions)}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(role.id)}, message="角色创建成功")


@router.get("/{role_id}")
async def get_role(
    role_id: UUID,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取角色详情"""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        return error(ErrorCode.NOT_FOUND, "角色不存在")

    # 查权限
    perms_result = await db.execute(
        select(RolePermission.permission_key).where(RolePermission.role_id == role_id)
    )
    permissions = [row[0] for row in perms_result.all()]

    # 查用户数
    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.role_id == role_id)
    )
    user_count = user_count_result.scalar() or 0

    return success(data={
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        "permissions": permissions,
        "user_count": user_count,
        "created_at": role.created_at.isoformat(),
    })


@router.put("/{role_id}")
async def update_role(
    role_id: UUID,
    body: RoleUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新角色"""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        return error(ErrorCode.NOT_FOUND, "角色不存在")

    if role.is_system:
        return error(ErrorCode.PARAM_INVALID, "系统内置角色不允许修改")

    # 更新基本信息
    if body.name is not None:
        # 检查名称唯一
        exists = await db.execute(
            select(Role).where(Role.name == body.name, Role.id != role_id)
        )
        if exists.scalar_one_or_none():
            return error(ErrorCode.CONFLICT, f"角色名 '{body.name}' 已存在")
        role.name = body.name

    if body.description is not None:
        role.description = body.description

    # 全量覆盖权限
    if body.permissions is not None:
        await db.execute(
            sa_delete(RolePermission).where(RolePermission.role_id == role_id)
        )
        for key in body.permissions:
            db.add(RolePermission(role_id=role_id, permission_key=key))

    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="更新角色",
        module="角色管理",
        detail=f"更新角色 {role.name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="角色更新成功")


@router.delete("/{role_id}")
async def delete_role(
    role_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除角色"""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        return error(ErrorCode.NOT_FOUND, "角色不存在")

    if role.is_system:
        return error(ErrorCode.PARAM_INVALID, "系统内置角色不允许删除")

    # 检查是否有用户关联
    user_count = await db.execute(
        select(func.count(User.id)).where(User.role_id == role_id)
    )
    if (user_count.scalar() or 0) > 0:
        return error(ErrorCode.CONFLICT, "该角色下仍有用户，请先移除关联用户")

    # 删除权限
    await db.execute(sa_delete(RolePermission).where(RolePermission.role_id == role_id))
    # 删除角色
    await db.delete(role)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="删除角色",
        module="角色管理",
        detail=f"删除角色 {role.name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="角色删除成功")
