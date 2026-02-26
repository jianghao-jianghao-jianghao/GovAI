"""公文、模板、素材 ORM 模型"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, Text, Integer, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(
        SAEnum('doc', 'template', name='doc_category', create_type=False),
        default='doc', nullable=False,
    )
    doc_type: Mapped[str] = mapped_column(
        SAEnum('request', 'report', 'notice', 'briefing', 'ai_generated',
               'official', 'academic', 'legal', 'custom',
               name='doc_type', create_type=False),
        default='official', nullable=False,
    )
    status: Mapped[str] = mapped_column(
        SAEnum('draft', 'checked', 'optimized', 'reviewed', 'formatted', 'unfilled', 'filled', 'archived',
               name='doc_status', create_type=False),
        default='draft', nullable=False,
    )
    content: Mapped[str | None] = mapped_column(Text)
    source_file_path: Mapped[str | None] = mapped_column(String(1024))  # 原始上传文件磁盘路径
    md_file_path: Mapped[str | None] = mapped_column(String(1024))      # 转换后 Markdown 文件路径
    source_format: Mapped[str | None] = mapped_column(String(20))       # 原始文件扩展名 (pdf/docx/xlsx…)
    formatted_paragraphs: Mapped[str | None] = mapped_column(Text)      # JSON 结构化排版段落（持久化 AI 排版结果）
    urgency: Mapped[str] = mapped_column(
        SAEnum('normal', 'urgent', 'very_urgent', name='doc_urgency', create_type=False),
        default='normal', nullable=False,
    )
    security: Mapped[str] = mapped_column(
        SAEnum('public', 'internal', 'secret', 'confidential',
               name='doc_security', create_type=False),
        default='internal', nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    change_type: Mapped[str | None] = mapped_column(
        SAEnum('draft', 'check', 'optimize', 'review', 'format', 'restore',
               name='doc_process_type', create_type=False)
    )
    change_summary: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_type: Mapped[str] = mapped_column(
        SAEnum('request', 'report', 'notice', 'briefing', 'ai_generated',
               'official', 'academic', 'legal', 'custom',
               name='doc_type', create_type=False),
        default='official', nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        SAEnum('opening', 'closing', 'transition', 'policy', 'general',
               name='material_category', create_type=False),
        default='general', nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
