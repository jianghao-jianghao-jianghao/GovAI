"""add restore to doc_process_type enum

Revision ID: 20260227_restore
Revises: 20260224_fmt_para
Create Date: 2026-02-27
"""
from alembic import op

# revision identifiers
revision = '20260227_restore'
down_revision = '20260224_fmt_para'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL 不支持在事务中 ALTER TYPE ... ADD VALUE，
    # 需要先提交当前事务
    op.execute("COMMIT")
    op.execute("ALTER TYPE doc_process_type ADD VALUE IF NOT EXISTS 'restore'")


def downgrade() -> None:
    # PostgreSQL 不支持从 enum 中移除值，降级时无操作
    pass
