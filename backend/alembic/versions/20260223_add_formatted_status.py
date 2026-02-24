"""add formatted status to doc_status enum and format to doc_process_type

Revision ID: add_formatted_status
Revises: 20260212_add_document_file_columns
Create Date: 2026-02-23
"""
from alembic import op

revision = "add_formatted_status"
down_revision = "20260212_add_document_file_columns"
branch_labels = None
depends_on = None


def upgrade():
    # Add 'formatted' to doc_status enum
    op.execute("ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'formatted' AFTER 'optimized'")
    # Add 'format' to doc_process_type enum
    op.execute("ALTER TYPE doc_process_type ADD VALUE IF NOT EXISTS 'format' AFTER 'optimize'")


def downgrade():
    # PostgreSQL doesn't support removing enum values easily
    pass
