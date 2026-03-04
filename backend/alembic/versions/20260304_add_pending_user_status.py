"""add pending to user_status enum

Revision ID: 20260304_pending
Revises: 20260227_restore
Create Date: 2026-03-04
"""
from alembic import op

# revision identifiers
revision = '20260304_pending'
down_revision = '20260227_restore'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL 不支持在事务中 ALTER TYPE ... ADD VALUE，
    # 需要先提交当前事务
    op.execute("COMMIT")
    op.execute("ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending'")


def downgrade() -> None:
    # PostgreSQL 不支持从 enum 中移除值，降级时无操作
    pass
