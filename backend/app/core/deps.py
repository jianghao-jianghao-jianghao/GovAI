"""FastAPI 依赖注入 — 认证与权限"""

from uuid import UUID
from typing import List

from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.response import ErrorCode, error
from app.core.redis import get_redis
from app.models.user import User, Role, RolePermission

security_scheme = HTTPBearer(auto_error=False)

# ── 全量权限键（与前端 constants.ts PERMISSIONS 保持一致） ──
ALL_PERMISSIONS = [
    "sys:user:manage",
    "sys:rule:manage",
    "sys:audit:view",
    "res:kb:view_module",
    "res:kb:manage_all",
    "res:kb:ref_all",
    "res:qa:manage",
    "res:qa:ref",
    "res:qa:feedback",
    "res:graph:view",
    "res:graph:edit",
    "res:material:manage",
    "res:template:manage",
    "app:doc:write",
    "app:qa:chat",
]


class AuthError(Exception):
    """认证异常"""
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """从 JWT 解析当前用户"""
    if not credentials:
        raise AuthError(ErrorCode.TOKEN_INVALID, "未提供认证令牌")

    token = credentials.credentials

    # 检查 Token 是否在黑名单（Redis）
    r = await get_redis()
    if await r.get(f"token_blacklist:{token}"):
        raise AuthError(ErrorCode.TOKEN_INVALID, "令牌已失效")

    # 解码 JWT
    user_id = decode_access_token(token)
    if not user_id:
        raise AuthError(ErrorCode.TOKEN_EXPIRED, "令牌已过期或无效")

    # 查询用户
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise AuthError(ErrorCode.TOKEN_INVALID, "用户不存在")
    if user.status != "active":
        raise AuthError(ErrorCode.ACCOUNT_DISABLED, "账号已被禁用")

    return user


async def get_user_permissions(user: User, db: AsyncSession) -> List[str]:
    """获取用户的权限列表（系统内置角色自动拥有全部权限）"""
    if not user.role_id:
        return []
    # 检查是否为系统内置角色（如超级管理员）
    role_result = await db.execute(select(Role.is_system).where(Role.id == user.role_id))
    is_system = role_result.scalar_one_or_none()
    if is_system:
        return list(ALL_PERMISSIONS)
    result = await db.execute(
        select(RolePermission.permission_key).where(RolePermission.role_id == user.role_id)
    )
    return [row[0] for row in result.all()]


from typing import Optional
...
async def get_user_role_name(user: User, db: AsyncSession) -> Optional[str]:
    """获取用户角色名"""
    if not user.role_id:
        return None
    result = await db.execute(select(Role.name).where(Role.id == user.role_id))
    row = result.scalar_one_or_none()
    return row


def require_permission(*required_keys: str):
    """权限检查依赖工厂（系统内置角色自动通过所有权限检查）"""
    async def checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        # 快速路径：系统内置角色直接通过
        if user.role_id:
            role_result = await db.execute(select(Role.is_system).where(Role.id == user.role_id))
            if role_result.scalar_one_or_none():
                return user
        permissions = await get_user_permissions(user, db)
        for key in required_keys:
            if key not in permissions:
                raise AuthError(ErrorCode.PERMISSION_DENIED, f"缺少权限: {key}")
        return user
    return checker
