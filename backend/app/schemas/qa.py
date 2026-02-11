"""QA 问答对 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class QAPairListItem(BaseModel):
    id: UUID
    question: str
    answer: str
    category: str
    source_type: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QAPairCreateRequest(BaseModel):
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)
    category: str = "通用"
    source_type: str = "manual"
    source_session_id: Optional[UUID] = None


class QAPairUpdateRequest(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
