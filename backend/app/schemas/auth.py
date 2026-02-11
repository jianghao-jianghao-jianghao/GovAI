"""认证相关 Pydantic Schema"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


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
