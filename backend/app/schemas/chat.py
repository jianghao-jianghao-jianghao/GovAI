"""聊天会话/消息 Pydantic Schema"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class ChatSessionListItem(BaseModel):
    id: UUID
    title: str
    qa_ref_enabled: bool
    kb_collection_ids: List[UUID] = []
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionCreateRequest(BaseModel):
    title: str = Field("新会话", max_length=255)
    kb_collection_ids: List[UUID] = []
    qa_ref_enabled: bool = False


class ChatSessionUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    kb_collection_ids: Optional[List[UUID]] = None
    qa_ref_enabled: Optional[bool] = None


class ChatMessageItem(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    citations: Optional[list] = None
    reasoning: Optional[str] = None
    knowledge_graph_data: Optional[list] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSendRequest(BaseModel):
    content: str = Field(..., min_length=1)
    quote_text: Optional[str] = None
