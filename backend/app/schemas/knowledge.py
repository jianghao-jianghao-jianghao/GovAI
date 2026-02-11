"""知识库 Pydantic Schema"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class KBCollectionListItem(BaseModel):
    id: UUID
    name: str
    parent_id: Optional[UUID] = None
    description: Optional[str] = None
    dify_dataset_id: Optional[str] = None
    file_count: int = 0
    can_manage: bool = False
    can_ref: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class KBCollectionCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[UUID] = None
    description: Optional[str] = Field(None, max_length=1000)


class KBCollectionUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)


class KBFileRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class KBFileBatchExportRequest(BaseModel):
    file_ids: list[UUID] = Field(..., min_length=1, description="要导出的文件ID列表")


class KBFileListItem(BaseModel):
    id: UUID
    collection_id: UUID
    name: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    status: str
    md_file_path: Optional[str] = None
    dify_document_id: Optional[str] = None
    uploaded_by: Optional[UUID] = None
    uploader_name: Optional[str] = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}
