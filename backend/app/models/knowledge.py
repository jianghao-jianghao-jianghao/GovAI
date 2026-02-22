"""知识库 ORM 模型"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, BigInteger, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class KBCollection(Base):
    __tablename__ = "kb_collections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    description: Mapped[str | None] = mapped_column(Text)
    dify_dataset_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class KBFile(Base):
    __tablename__ = "kb_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    md_file_path: Mapped[str | None] = mapped_column(String(1024))  # Markdown 转换后的文件路径
    status: Mapped[str] = mapped_column(
        SAEnum('uploading', 'indexing', 'indexed', 'failed',
               name='kb_file_status', create_type=False),
        default='uploading', nullable=False,
    )
    dify_document_id: Mapped[str | None] = mapped_column(String(255))
    dify_batch_id: Mapped[str | None] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # 知识图谱抽取状态
    graph_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    graph_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    graph_node_count: Mapped[int | None] = mapped_column(Integer, default=0)
    graph_edge_count: Mapped[int | None] = mapped_column(Integer, default=0)
