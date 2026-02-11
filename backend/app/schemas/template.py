"""公文模板 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class TemplateListItem(BaseModel):
    id: UUID
    name: str
    template_type: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplateDetail(TemplateListItem):
    content: str


class TemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    template_type: str = "notice"
    content: str = Field(..., min_length=1)


class TemplateUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    template_type: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None
