"""用户管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password
from app.core.response import success, error, ErrorCode
from app.core.deps import get_current_user, require_permission, AuthError
from app.core.audit import log_action
from app.models.user import User, Role
from app.schemas.user import UserCreateRequest, UserUpdateRequest, UserListItem

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    status: str = Query(None),
    role_id: UUID = Query(None),
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """用户列表（分页+筛选）"""
    query = select(User)

    # 筛选条件
    if keyword:
        query = query.where(
            or_(
                User.username.ilike(f"%{keyword}%"),
                User.display_name.ilike(f"%{keyword}%"),
                User.department.ilike(f"%{keyword}%"),
            )
        )
    if status:
        query = query.where(User.status == status)
    if role_id:
        query = query.where(User.role_id == role_id)

    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # 分页
    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    # 批量查角色名
    role_ids = {u.role_id for u in users if u.role_id}
    role_map = {}
    if role_ids:
        roles_result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        role_map = {r.id: r.name for r in roles_result.scalars().all()}

    items = [
        {
            **UserListItem.model_validate(u).model_dump(mode="json"),
            "role_name": role_map.get(u.role_id, ""),
        }
        for u in users
    ]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("")
async def create_user(
    body: UserCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """创建用户"""
    # 检查用户名唯一
    exists = await db.execute(select(User).where(User.username == body.username))
    if exists.scalar_one_or_none():
        return error(ErrorCode.CONFLICT, f"用户名 '{body.username}' 已存在")

    # 检查角色存在
    role = await db.execute(select(Role).where(Role.id == body.role_id))
    if not role.scalar_one_or_none():
        return error(ErrorCode.NOT_FOUND, "角色不存在")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        department=body.department,
        role_id=body.role_id,
        status=body.status,
        phone=body.phone,
        email=body.email,
    )
    db.add(user)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="创建用户",
        module="用户管理",
        detail=f"创建用户 {body.username}({body.display_name})",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(user.id)}, message="用户创建成功")


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取用户详情"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return error(ErrorCode.NOT_FOUND, "用户不存在")

    role_name = None
    if user.role_id:
        role_result = await db.execute(select(Role.name).where(Role.id == user.role_id))
        role_name = role_result.scalar_one_or_none()

    data = {**UserListItem.model_validate(user).model_dump(mode="json"), "role_name": role_name}
    return success(data=data)


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    body: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return error(ErrorCode.NOT_FOUND, "用户不存在")

    update_data = body.model_dump(exclude_unset=True)

    # 密码特殊处理
    if "password" in update_data:
        pwd = update_data.pop("password")
        if pwd:
            user.password_hash = hash_password(pwd)

    # 角色存在性检查
    if "role_id" in update_data and update_data["role_id"]:
        role = await db.execute(select(Role).where(Role.id == update_data["role_id"]))
        if not role.scalar_one_or_none():
            return error(ErrorCode.NOT_FOUND, "角色不存在")

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="更新用户",
        module="用户管理",
        detail=f"更新用户 {user.username}，字段: {list(update_data.keys())}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="用户更新成功")


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("sys:user:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除用户"""
    if user_id == current_user.id:
        return error(ErrorCode.PARAM_INVALID, "不能删除当前登录用户")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return error(ErrorCode.NOT_FOUND, "用户不存在")

    username = user.username
    display_name = user.display_name
    await db.delete(user)
    await db.flush()

    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="删除用户",
        module="用户管理",
        detail=f"删除用户 {username}({display_name})",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="用户删除成功")
