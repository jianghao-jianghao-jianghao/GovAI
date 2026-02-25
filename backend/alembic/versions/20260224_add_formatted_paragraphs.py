"""add formatted_paragraphs column to documents

Revision ID: 20260224_fmt_para
Revises: 20260223_add_formatted_status
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa

revision = "20260224_fmt_para"
down_revision = "add_formatted_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("formatted_paragraphs", sa.Text(), nullable=True,
                  comment="JSON 结构化排版段落数据，用于持久化 AI 排版结果"),
    )


def downgrade() -> None:
    op.drop_column("documents", "formatted_paragraphs")
