"""认证相关 Pydantic Schema"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    """用户自助注册请求（离线环境，无需邮箱/手机验证）"""
    username: str = Field(..., min_length=2, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, max_length=128, description="密码")
    display_name: str = Field(..., min_length=1, max_length=100, description="姓名")
    department: Optional[str] = Field(None, max_length=100, description="部门")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserProfile"


class UserProfile(BaseModel):
    id: UUID
    username: str
    display_name: str
    department: Optional[str] = None
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    status: str
    phone: Optional[str] = None
    email: Optional[str] = None
    permissions: List[str] = []
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
