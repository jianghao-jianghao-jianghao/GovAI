"""认证路由 — 登录/登出/获取资料/刷新Token"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.response import success, error, ErrorCode
from app.core.config import settings
from app.core.redis import get_redis
from app.core.deps import get_current_user, get_user_permissions, get_user_role_name, AuthError
from app.core.audit import log_action
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserProfile, RegisterRequest

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    # 查询用户
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        return error(ErrorCode.AUTH_FAILED, "用户名或密码错误")

    if user.status == "pending":
        return error(ErrorCode.ACCOUNT_DISABLED, "账号正在等待管理员审批，请联系管理员")
    if user.status != "active":
        return error(ErrorCode.ACCOUNT_DISABLED, "账号已被禁用")

    # 生成 Token
    token = create_access_token(user.id)

    # 更新最后登录时间
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()

    # 获取权限和角色名
    permissions = await get_user_permissions(user, db)
    role_name = await get_user_role_name(user, db)

    # 审计日志
    await log_action(
        db,
        user_id=user.id,
        user_display_name=user.display_name,
        action="登录",
        module="认证",
        detail=f"用户 {user.username} 登录成功",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return success(
        data={
            "access_token": token,
            "token_type": "bearer",
            "expires_in": settings.JWT_EXPIRE_MINUTES * 60,
            "user": UserProfile(
                id=user.id,
                username=user.username,
                display_name=user.display_name,
                department=user.department,
                role_id=user.role_id,
                role_name=role_name,
                status=user.status,
                phone=user.phone,
                email=user.email,
                permissions=permissions,
                last_login_at=user.last_login_at,
            ).model_dump(mode="json"),
        }
    )


@router.post("/register")
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """用户自助注册（离线环境，无需验证码/邮件确认）

    - 默认角色：业务科员（最低权限普通角色）
    - 默认状态：pending（待管理员审批后激活）
    - 超级管理员可在用户管理中审批并调整角色权限
    """
    from app.core.security import hash_password

    # 检查用户名是否已存在
    exists = await db.execute(select(User).where(User.username == body.username))
    if exists.scalar_one_or_none():
        return error(ErrorCode.CONFLICT, f"用户名 '{body.username}' 已存在")

    # 查找默认角色「业务科员」
    from app.models.user import Role
    role_result = await db.execute(select(Role).where(Role.name == "业务科员"))
    default_role = role_result.scalar_one_or_none()
    default_role_id = default_role.id if default_role else None

    # 创建用户 — 状态为 pending，需管理员审批激活
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        department=body.department or "",
        role_id=default_role_id,
        status="pending",
    )
    db.add(user)
    await db.flush()

    # 审计日志
    await log_action(
        db,
        user_id=user.id,
        user_display_name=user.display_name,
        action="注册",
        module="认证",
        detail=f"用户 {user.username}（{user.display_name}）自助注册，待审批",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return success(message="注册成功！账号需要管理员审批后才能登录，请联系管理员。")


@router.post("/logout")
async def logout(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """退出登录 — 将 Token 加入黑名单"""
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").replace("bearer ", "")

    if token:
        r = await get_redis()
        # Token 黑名单，TTL 与 JWT 有效期一致
        await r.setex(f"token_blacklist:{token}", settings.JWT_EXPIRE_MINUTES * 60, "1")

    await log_action(
        db,
        user_id=user.id,
        user_display_name=user.display_name,
        action="登出",
        module="认证",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="已退出登录")


@router.get("/profile")
async def get_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户信息"""
    permissions = await get_user_permissions(user, db)
    role_name = await get_user_role_name(user, db)

    return success(
        data=UserProfile(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            department=user.department,
            role_id=user.role_id,
            role_name=role_name,
            status=user.status,
            phone=user.phone,
            email=user.email,
            permissions=permissions,
            last_login_at=user.last_login_at,
        ).model_dump(mode="json")
    )


@router.post("/refresh")
async def refresh_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """刷新 Token — 签发新 Token 并将旧 Token 加入黑名单"""
    # 将旧 Token 加入黑名单，防止被窃取后继续使用
    auth_header = request.headers.get("authorization", "")
    old_token = auth_header.replace("Bearer ", "").replace("bearer ", "")
    if old_token:
        r = await get_redis()
        await r.setex(f"token_blacklist:{old_token}", settings.JWT_EXPIRE_MINUTES * 60, "1")

    new_token = create_access_token(user.id)
    return success(
        data={
            "access_token": new_token,
            "expires_in": settings.JWT_EXPIRE_MINUTES * 60,
        }
    )
