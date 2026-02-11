"""素材库 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class MaterialListItem(BaseModel):
    id: UUID
    title: str
    category: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaterialCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: str = "general"
    content: str = Field(..., min_length=1)


class MaterialUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = None
    content: Optional[str] = None
