"""LLM 模型管理 ORM 模型"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, Text, Integer, Float, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class LLMModel(Base):
    """AI 模型配置表"""
    __tablename__ = "llm_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="模型显示名称")
    provider: Mapped[str] = mapped_column(String(100), nullable=False, comment="模型供应商 (openai / azure / local / ollama / custom)")
    model_id: Mapped[str] = mapped_column(String(200), nullable=False, comment="模型标识符 (如 gpt-4, qwen-72b)")
    model_type: Mapped[str] = mapped_column(
        SAEnum('text_generation', 'semantic_understanding', 'knowledge_qa', 'embedding', 'other',
               name='llm_model_type', create_type=False),
        nullable=False,
        comment="模型用途分类"
    )
    deployment: Mapped[str] = mapped_column(
        SAEnum('local', 'remote', name='llm_deployment', create_type=False),
        nullable=False,
        default='remote',
        comment="部署方式: local=本地部署, remote=远端服务"
    )
    endpoint_url: Mapped[str] = mapped_column(String(500), nullable=False, comment="API 端点地址")
    api_key: Mapped[str | None] = mapped_column(String(500), comment="API 密钥 (加密存储)")

    # 模型参数默认值
    temperature: Mapped[float] = mapped_column(Float, default=0.7, comment="温度参数 (0-2)")
    max_tokens: Mapped[int] = mapped_column(Integer, default=2048, comment="最大生成长度")
    top_p: Mapped[float] = mapped_column(Float, default=0.9, comment="Top-P 采样")
    top_k: Mapped[int] = mapped_column(Integer, default=50, comment="Top-K 采样")
    frequency_penalty: Mapped[float] = mapped_column(Float, default=0.0, comment="频率惩罚 (-2 ~ 2)")
    presence_penalty: Mapped[float] = mapped_column(Float, default=0.0, comment="存在惩罚 (-2 ~ 2)")

    # 额外参数 (JSON 扩展)
    extra_params: Mapped[dict | None] = mapped_column(JSONB, comment="其他自定义参数")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否启用")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否为该类型默认模型")
    description: Mapped[str | None] = mapped_column(Text, comment="模型描述/备注")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                                                   onupdate=lambda: datetime.now(timezone.utc))
