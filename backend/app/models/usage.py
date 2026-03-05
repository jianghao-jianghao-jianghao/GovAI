"""用量统计 ORM 模型"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, DateTime, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class UsageRecord(Base):
    """API 调用用量记录表"""
    __tablename__ = "usage_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), comment="调用用户ID")
    user_display_name: Mapped[str] = mapped_column(String(100), nullable=False, comment="用户显示名")
    model_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), comment="使用的模型ID")
    model_name: Mapped[str | None] = mapped_column(String(200), comment="模型名称(冗余)")
    function_type: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="功能类型: doc_draft/doc_check/doc_format/qa_chat/entity_extract/knowledge_qa"
    )
    tokens_input: Mapped[int] = mapped_column(Integer, default=0, comment="输入 Token 数")
    tokens_output: Mapped[int] = mapped_column(Integer, default=0, comment="输出 Token 数")
    tokens_total: Mapped[int] = mapped_column(Integer, default=0, comment="总 Token 数")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, comment="耗时(毫秒)")
    status: Mapped[str] = mapped_column(String(20), default="success", comment="调用状态: success/error")
    error_message: Mapped[str | None] = mapped_column(Text, comment="错误信息")
    extra: Mapped[dict | None] = mapped_column(JSONB, comment="额外信息")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UsageAlert(Base):
    """用量异常告警表"""
    __tablename__ = "usage_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False, comment="告警类型: high_frequency/high_token/error_rate")
    severity: Mapped[str] = mapped_column(String(20), default="warning", comment="严重程度: info/warning/critical")
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), comment="相关用户")
    user_display_name: Mapped[str | None] = mapped_column(String(100), comment="用户名")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="告警标题")
    detail: Mapped[str | None] = mapped_column(Text, comment="告警详情")
    is_read: Mapped[bool] = mapped_column(default=False, comment="是否已读")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
