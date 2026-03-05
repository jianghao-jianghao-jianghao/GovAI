"""add document visibility column

Revision ID: 20260305_visibility
Revises: 20260304_pending
Create Date: 2025-06-05

"""
from alembic import op
import sqlalchemy as sa

revision = '20260305_visibility'
down_revision = '20260304_pending'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('visibility', sa.String(20), server_default='private', nullable=False),
    )
    # Migrate old security='public' rows to visibility='public'
    op.execute("UPDATE documents SET visibility = 'public' WHERE security = '公开'")


def downgrade() -> None:
    op.drop_column('documents', 'visibility')
