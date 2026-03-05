"""add model management and usage statistics tables

Revision ID: 20260305_models_usage
Revises: 20260305_visibility
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa

revision = '20260305_models_usage'
down_revision = '20260305_visibility'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 全部使用原始 SQL，避免 SQLAlchemy Enum 自动 CREATE TYPE 冲突
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE llm_model_type AS ENUM ('text_generation', 'semantic_understanding', 'knowledge_qa', 'embedding', 'other');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE llm_deployment AS ENUM ('local', 'remote');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS llm_models (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name            VARCHAR(200) NOT NULL,
            provider        VARCHAR(100) NOT NULL,
            model_id        VARCHAR(200) NOT NULL,
            model_type      llm_model_type NOT NULL,
            deployment      llm_deployment NOT NULL DEFAULT 'remote',
            endpoint_url    VARCHAR(500) NOT NULL,
            api_key         VARCHAR(500),
            temperature     FLOAT DEFAULT 0.7,
            max_tokens      INTEGER DEFAULT 2048,
            top_p           FLOAT DEFAULT 0.9,
            top_k           INTEGER DEFAULT 50,
            frequency_penalty FLOAT DEFAULT 0.0,
            presence_penalty  FLOAT DEFAULT 0.0,
            extra_params    JSONB,
            is_active       BOOLEAN DEFAULT true,
            is_default      BOOLEAN DEFAULT false,
            description     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS usage_records (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id           UUID,
            user_display_name VARCHAR(100) NOT NULL,
            model_id          UUID,
            model_name        VARCHAR(200),
            function_type     VARCHAR(50) NOT NULL,
            tokens_input      INTEGER DEFAULT 0,
            tokens_output     INTEGER DEFAULT 0,
            tokens_total      INTEGER DEFAULT 0,
            duration_ms       INTEGER DEFAULT 0,
            status            VARCHAR(20) DEFAULT 'success',
            error_message     TEXT,
            extra             JSONB,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS usage_alerts (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            alert_type        VARCHAR(50) NOT NULL,
            severity          VARCHAR(20) DEFAULT 'warning',
            user_id           UUID,
            user_display_name VARCHAR(100),
            title             VARCHAR(200) NOT NULL,
            detail            TEXT,
            is_read           BOOLEAN DEFAULT false,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # 索引（IF NOT EXISTS）
    op.execute("CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_usage_records_function_type ON usage_records(function_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_usage_alerts_is_read ON usage_alerts(is_read)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_llm_models_type_active ON llm_models(model_type, is_active)")


def downgrade() -> None:
    op.drop_table('usage_alerts')
    op.drop_table('usage_records')
    op.drop_table('llm_models')
    op.execute("DROP TYPE IF EXISTS llm_model_type")
    op.execute("DROP TYPE IF EXISTS llm_deployment")
