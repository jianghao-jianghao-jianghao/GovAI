"""知识图谱 ORM 模型"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import String, Integer, Numeric, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class GraphEntity(Base):
    __tablename__ = "graph_entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    group_id: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    source_doc_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    properties: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class GraphRelationship(Base):
    __tablename__ = "graph_relationships"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    target_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    relation_desc: Mapped[str | None] = mapped_column(String(255))
    weight: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=1.0)
    source_doc_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
