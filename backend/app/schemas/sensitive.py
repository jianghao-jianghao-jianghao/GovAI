"""敏感词规则 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class SensitiveRuleListItem(BaseModel):
    id: UUID
    keyword: str
    action: str
    level: str
    note: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SensitiveRuleCreateRequest(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=255)
    action: str
    level: str = "medium"
    note: Optional[str] = Field(None, max_length=500)


class SensitiveRuleUpdateRequest(BaseModel):
    keyword: Optional[str] = Field(None, max_length=255)
    action: Optional[str] = None
    level: Optional[str] = None
    note: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class SensitiveCheckRequest(BaseModel):
    text: str = Field(..., min_length=1)


class SensitiveCheckResponse(BaseModel):
    passed: bool
    hits: list = []
