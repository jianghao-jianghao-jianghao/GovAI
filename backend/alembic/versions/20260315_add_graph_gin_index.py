"""add GIN index on graph_entities.name for ILIKE performance

Revision ID: 20260315_gin
Revises: 20260313_verpara
Create Date: 2026-03-15
"""

from alembic import op

revision = "20260315_gin"
down_revision = "20260313_ver_para"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_graph_entities_name_gin "
        "ON graph_entities USING gin (name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_graph_entities_name_gin")
