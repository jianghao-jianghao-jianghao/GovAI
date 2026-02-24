"""公文管理相关 Pydantic Schema"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class DocumentListItem(BaseModel):
    id: UUID
    title: str
    category: str
    doc_type: str
    status: str
    urgency: str
    security: str
    source_format: Optional[str] = None
    creator_id: UUID
    creator_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentListItem):
    content: Optional[str] = None
    formatted_paragraphs: Optional[str] = None
    has_source_file: bool = False
    has_markdown_file: bool = False


class DocumentCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    category: str = "doc"
    doc_type: str = "report"
    content: Optional[str] = None
    urgency: str = "normal"
    security: str = "internal"


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    formatted_paragraphs: Optional[str] = None
    doc_type: Optional[str] = None
    status: Optional[str] = None
    urgency: Optional[str] = None
    security: Optional[str] = None


class DocumentImportRequest(BaseModel):
    """导入公文/模板时的表单字段"""
    category: str = "doc"
    doc_type: str = "report"
    security: str = "internal"


class DocumentExportRequest(BaseModel):
    """导出公文"""
    ids: Optional[List[UUID]] = None
    format: str = Field("zip", description="zip 压缩包")


class DocProcessRequest(BaseModel):
    process_type: str = Field(..., description="draft / check / optimize")
    kb_collection_ids: Optional[List[UUID]] = None


class DocProcessResponse(BaseModel):
    document_id: UUID
    process_type: str
    content: Optional[str] = None
    new_status: str
    review_result: Optional[dict] = None


class DocumentVersionItem(BaseModel):
    id: UUID
    version_number: int
    change_type: Optional[str] = None
    change_summary: Optional[str] = None
    created_by: UUID
    created_by_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionDetail(DocumentVersionItem):
    content: str
