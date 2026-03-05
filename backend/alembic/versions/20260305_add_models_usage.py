"""add model management and usage statistics tables

Revision ID: 20260305_models_usage
Revises: 20260305_visibility
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '20260305_models_usage'
down_revision = '20260305_visibility'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 创建模型类型和部署方式枚举 ──
    op.execute("CREATE TYPE llm_model_type AS ENUM ('text_generation', 'semantic_understanding', 'knowledge_qa', 'embedding', 'other')")
    op.execute("CREATE TYPE llm_deployment AS ENUM ('local', 'remote')")

    # ── 模型管理表 ──
    op.create_table(
        'llm_models',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(200), nullable=False, comment='模型显示名称'),
        sa.Column('provider', sa.String(100), nullable=False, comment='模型供应商'),
        sa.Column('model_id', sa.String(200), nullable=False, comment='模型标识符'),
        sa.Column('model_type', sa.Enum('text_generation', 'semantic_understanding', 'knowledge_qa', 'embedding', 'other', name='llm_model_type', create_type=False), nullable=False, comment='模型用途分类'),
        sa.Column('deployment', sa.Enum('local', 'remote', name='llm_deployment', create_type=False), nullable=False, server_default='remote', comment='部署方式'),
        sa.Column('endpoint_url', sa.String(500), nullable=False, comment='API端点地址'),
        sa.Column('api_key', sa.String(500), comment='API密钥'),
        sa.Column('temperature', sa.Float, server_default='0.7', comment='温度参数'),
        sa.Column('max_tokens', sa.Integer, server_default='2048', comment='最大生成长度'),
        sa.Column('top_p', sa.Float, server_default='0.9', comment='Top-P采样'),
        sa.Column('top_k', sa.Integer, server_default='50', comment='Top-K采样'),
        sa.Column('frequency_penalty', sa.Float, server_default='0.0', comment='频率惩罚'),
        sa.Column('presence_penalty', sa.Float, server_default='0.0', comment='存在惩罚'),
        sa.Column('extra_params', JSONB, comment='其他参数'),
        sa.Column('is_active', sa.Boolean, server_default='true', comment='是否启用'),
        sa.Column('is_default', sa.Boolean, server_default='false', comment='是否默认'),
        sa.Column('description', sa.Text, comment='描述'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    # ── 用量记录表 ──
    op.create_table(
        'usage_records',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), comment='调用用户ID'),
        sa.Column('user_display_name', sa.String(100), nullable=False, comment='用户显示名'),
        sa.Column('model_id', UUID(as_uuid=True), comment='使用的模型ID'),
        sa.Column('model_name', sa.String(200), comment='模型名称'),
        sa.Column('function_type', sa.String(50), nullable=False, comment='功能类型'),
        sa.Column('tokens_input', sa.Integer, server_default='0', comment='输入Token数'),
        sa.Column('tokens_output', sa.Integer, server_default='0', comment='输出Token数'),
        sa.Column('tokens_total', sa.Integer, server_default='0', comment='总Token数'),
        sa.Column('duration_ms', sa.Integer, server_default='0', comment='耗时毫秒'),
        sa.Column('status', sa.String(20), server_default='success', comment='调用状态'),
        sa.Column('error_message', sa.Text, comment='错误信息'),
        sa.Column('extra', JSONB, comment='额外信息'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    # ── 用量告警表 ──
    op.create_table(
        'usage_alerts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('alert_type', sa.String(50), nullable=False, comment='告警类型'),
        sa.Column('severity', sa.String(20), server_default='warning', comment='严重程度'),
        sa.Column('user_id', UUID(as_uuid=True), comment='相关用户'),
        sa.Column('user_display_name', sa.String(100), comment='用户名'),
        sa.Column('title', sa.String(200), nullable=False, comment='告警标题'),
        sa.Column('detail', sa.Text, comment='告警详情'),
        sa.Column('is_read', sa.Boolean, server_default='false', comment='是否已读'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )

    # 索引优化
    op.create_index('idx_usage_records_created_at', 'usage_records', ['created_at'])
    op.create_index('idx_usage_records_user_id', 'usage_records', ['user_id'])
    op.create_index('idx_usage_records_function_type', 'usage_records', ['function_type'])
    op.create_index('idx_usage_alerts_is_read', 'usage_alerts', ['is_read'])
    op.create_index('idx_llm_models_type_active', 'llm_models', ['model_type', 'is_active'])


def downgrade() -> None:
    op.drop_table('usage_alerts')
    op.drop_table('usage_records')
    op.drop_table('llm_models')
    op.execute("DROP TYPE IF EXISTS llm_model_type")
    op.execute("DROP TYPE IF EXISTS llm_deployment")
