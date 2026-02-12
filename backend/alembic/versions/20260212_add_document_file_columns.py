"""add source_file_path, md_file_path, source_format to documents

Revision ID: 20260212_docfile
Revises:
Create Date: 2026-02-12
"""

from alembic import op
import sqlalchemy as sa

revision = "20260212_docfile"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_file_path", sa.String(1024), nullable=True))
    op.add_column("documents", sa.Column("md_file_path", sa.String(1024), nullable=True))
    op.add_column("documents", sa.Column("source_format", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "source_format")
    op.drop_column("documents", "md_file_path")
    op.drop_column("documents", "source_file_path")
