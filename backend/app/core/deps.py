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
    """获取用户的权限列表"""
    if not user.role_id:
        return []
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
    """权限检查依赖工厂"""
    async def checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        permissions = await get_user_permissions(user, db)
        for key in required_keys:
            if key not in permissions:
                raise AuthError(ErrorCode.PERMISSION_DENIED, f"缺少权限: {key}")
        return user
    return checker
