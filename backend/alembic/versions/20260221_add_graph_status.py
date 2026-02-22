"""add graph_status to kb_files

Revision ID: 20260221_graph_status
Revises: 20260212_docfile
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260221_graph_status"
down_revision = "20260212_docfile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 添加 graph_status 字段，记录知识图谱抽取状态
    op.add_column(
        "kb_files",
        sa.Column(
            "graph_status",
            sa.String(50),
            nullable=True,
            server_default=None,
            comment="知识图谱抽取状态: pending / extracting / completed / failed / skipped",
        ),
    )
    # 添加 graph_error 字段，记录抽取失败原因
    op.add_column(
        "kb_files",
        sa.Column(
            "graph_error",
            sa.Text(),
            nullable=True,
            comment="知识图谱抽取错误信息",
        ),
    )
    # 添加 graph_node_count / graph_edge_count 字段
    op.add_column(
        "kb_files",
        sa.Column(
            "graph_node_count",
            sa.Integer(),
            nullable=True,
            server_default="0",
            comment="抽取的图谱节点数",
        ),
    )
    op.add_column(
        "kb_files",
        sa.Column(
            "graph_edge_count",
            sa.Integer(),
            nullable=True,
            server_default="0",
            comment="抽取的图谱边数",
        ),
    )


def downgrade() -> None:
    op.drop_column("kb_files", "graph_edge_count")
    op.drop_column("kb_files", "graph_node_count")
    op.drop_column("kb_files", "graph_error")
    op.drop_column("kb_files", "graph_status")
