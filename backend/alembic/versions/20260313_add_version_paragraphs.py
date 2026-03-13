"""add formatted_paragraphs column to document_versions

Revision ID: 20260313_ver_para
Revises: 20260305_models_usage
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa

revision = '20260313_ver_para'
down_revision = '20260305_models_usage'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'document_versions',
        sa.Column('formatted_paragraphs', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('document_versions', 'formatted_paragraphs')
