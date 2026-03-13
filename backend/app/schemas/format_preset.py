"""格式排版预设 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class FormatPresetCreate(BaseModel):
    name: str = Field(..., max_length=200)
    category: str = Field("公文写作", max_length=100)
    description: str = Field("", max_length=500)
    instruction: str = ""
    system_prompt: str = ""


class FormatPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    instruction: Optional[str] = None
    system_prompt: Optional[str] = None


class FormatPresetOut(BaseModel):
    id: UUID
    name: str
    category: str
    description: str
    instruction: str
    system_prompt: str
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
