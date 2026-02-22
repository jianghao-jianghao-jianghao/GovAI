-- ============================================================
-- GovAI 智政系统 - 完整数据库架构（无外键约束版本）
-- 数据库：PostgreSQL 16+ with Apache AGE 扩展
-- 编码：UTF-8
-- 生成日期：2026-02-10
-- 说明：所有关联由应用层代码逻辑保证一致性，无数据库外键约束
-- ============================================================

-- ############################################################
-- 第一部分：基础设施
-- ############################################################

-- 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- 密码加密
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- 模糊匹配（QA优先匹配用）
CREATE EXTENSION IF NOT EXISTS "age";              -- Apache AGE 图扩展

-- AGE 初始化
LOAD 'age';

-- ############################################################
-- 第二部分：枚举类型定义（幂等：已存在则跳过）
-- ############################################################

DO $$ BEGIN CREATE TYPE user_status AS ENUM ('active', 'disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_category AS ENUM ('doc', 'template'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_status AS ENUM (
    'draft',       -- 草稿（公文）
    'checked',     -- 已检查（公文）
    'optimized',   -- 已优化（公文）
    'unfilled',    -- 未补充（模板）
    'filled',      -- 已补充（模板）
    'archived'     -- 已归档（公文+模板通用）
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_type AS ENUM ('request', 'report', 'notice', 'briefing', 'ai_generated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_security AS ENUM ('public', 'internal', 'secret', 'confidential'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_urgency AS ENUM ('normal', 'urgent', 'very_urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_process_type AS ENUM ('draft', 'check', 'optimize'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE kb_file_status AS ENUM ('uploading', 'indexing', 'indexed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rule_action AS ENUM ('block', 'warn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rule_level AS ENUM ('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE material_category AS ENUM (
    'opening',     -- 开头
    'closing',     -- 结尾
    'transition',  -- 过渡
    'policy',      -- 政策
    'general'      -- 通用
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ############################################################
-- 第三部分：核心业务表（后端A 负责）
-- ############################################################

-- 3.1 角色表
CREATE TABLE IF NOT EXISTS roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500),
    is_system       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS '角色表';

-- 3.2 用户表
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    department      VARCHAR(100),
    role_id         UUID,                              -- 关联 roles.id（无外键，由应用层保证一致性）
    status          user_status  NOT NULL DEFAULT 'active',
    phone           VARCHAR(20),
    email           VARCHAR(255),
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_id  ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_status   ON users(status);

COMMENT ON TABLE  users IS '用户表';
COMMENT ON COLUMN users.role_id IS '关联 roles.id，无外键约束，由应用层代码保证一致性';

-- 3.3 角色权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID         NOT NULL,             -- 关联 roles.id（无外键，由应用层保证）
    permission_key  VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_perms_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_key     ON role_permissions(permission_key);

COMMENT ON TABLE  role_permissions IS '角色权限关联表（无外键约束）';
COMMENT ON COLUMN role_permissions.role_id IS '关联 roles.id，无外键，由应用层保证一致性';

-- 3.4 公文表
CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id      UUID         NOT NULL,             -- 关联 users.id（无外键，由应用层保证）
    title           VARCHAR(500) NOT NULL,
    category        doc_category NOT NULL DEFAULT 'doc',
    doc_type        doc_type     NOT NULL DEFAULT 'report',
    status          doc_status   NOT NULL DEFAULT 'draft',
    content         TEXT,
    source_file_path VARCHAR(1024),                     -- 原始上传文件磁盘路径
    md_file_path     VARCHAR(1024),                     -- 转换后 Markdown 文件路径
    source_format    VARCHAR(20),                       -- 原始文件扩展名 (pdf/docx/xlsx…)
    urgency         doc_urgency  NOT NULL DEFAULT 'normal',
    security        doc_security NOT NULL DEFAULT 'internal',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_creator    ON documents(creator_id);
CREATE INDEX IF NOT EXISTS idx_documents_category   ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_status     ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_list_filter ON documents(category, status, doc_type, security);

COMMENT ON TABLE  documents IS '公文/模板表（无外键约束）';
COMMENT ON COLUMN documents.creator_id IS '关联 users.id，无外键，由应用层保证一致性';

-- 3.5 公文版本历史表
CREATE TABLE IF NOT EXISTS document_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID             NOT NULL,            -- 关联 documents.id（无外键，由应用层保证）
    version_number  INTEGER          NOT NULL,
    content         TEXT             NOT NULL,
    change_type     doc_process_type,
    change_summary  VARCHAR(500),
    created_by      UUID             NOT NULL,            -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id ON document_versions(document_id, version_number DESC);

COMMENT ON TABLE  document_versions IS '公文版本历史表（无外键约束）';
COMMENT ON COLUMN document_versions.document_id IS '关联 documents.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN document_versions.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- 3.6 公文模板表
CREATE TABLE IF NOT EXISTS document_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255)  NOT NULL,
    template_type   doc_type      NOT NULL DEFAULT 'notice',
    content         TEXT          NOT NULL,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by      UUID,                                 -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  document_templates IS '公文格式模板表（无外键约束）';
COMMENT ON COLUMN document_templates.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- 3.7 素材库表
CREATE TABLE IF NOT EXISTS materials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255)      NOT NULL,
    category        material_category NOT NULL DEFAULT 'general',
    content         TEXT              NOT NULL,
    created_by      UUID,                                 -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);

COMMENT ON TABLE  materials IS '素材库表（无外键约束）';
COMMENT ON COLUMN materials.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- 3.8 敏感词规则表
CREATE TABLE IF NOT EXISTS sensitive_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword         VARCHAR(255) NOT NULL,
    action          rule_action  NOT NULL,
    level           rule_level   NOT NULL DEFAULT 'medium',
    note            VARCHAR(500),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by      UUID,                                 -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_rules_keyword ON sensitive_rules(keyword);
CREATE INDEX IF NOT EXISTS idx_sensitive_rules_action  ON sensitive_rules(action);

COMMENT ON TABLE  sensitive_rules IS '敏感词规则表（无外键约束）';
COMMENT ON COLUMN sensitive_rules.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- 3.9 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID,                              -- 关联 users.id（无外键，由应用层保证）
    user_display_name   VARCHAR(100) NOT NULL,
    action              VARCHAR(100) NOT NULL,
    module              VARCHAR(100) NOT NULL,
    detail              TEXT,
    ip_address          INET,
    user_agent          VARCHAR(500),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module     ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_name_trgm ON audit_logs USING gin(user_display_name gin_trgm_ops);

COMMENT ON TABLE  audit_logs IS '审计日志表（无外键约束，只增不改不删）';
COMMENT ON COLUMN audit_logs.user_id IS '关联 users.id，无外键，由应用层保证一致性';

-- ############################################################
-- 第四部分：知识库相关表（后端A + 后端B 协作）
-- ############################################################

-- 4.1 知识库集合表
CREATE TABLE IF NOT EXISTS kb_collections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID,                                  -- 关联 kb_collections.id（无外键，由应用层保证）
    description     TEXT,
    dify_dataset_id VARCHAR(255) UNIQUE,
    created_by      UUID,                                 -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_collections_parent   ON kb_collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_kb_collections_dify_id  ON kb_collections(dify_dataset_id);

COMMENT ON TABLE  kb_collections IS '知识库集合表（无外键约束）';
COMMENT ON COLUMN kb_collections.parent_id IS '关联 kb_collections.id（自引用），无外键，由应用层保证一致性';
COMMENT ON COLUMN kb_collections.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- 4.2 知识库文件表
CREATE TABLE IF NOT EXISTS kb_files (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id     UUID         NOT NULL,             -- 关联 kb_collections.id（无外键，由应用层保证）
    name              VARCHAR(512) NOT NULL,
    file_type         VARCHAR(50),
    file_size         BIGINT,
    file_path         VARCHAR(1024),
    md_file_path      VARCHAR(1024),                     -- Markdown 转换后的文件路径
    status            kb_file_status NOT NULL DEFAULT 'uploading',
    dify_document_id  VARCHAR(255),
    dify_batch_id     VARCHAR(255),
    error_message     TEXT,
    uploaded_by       UUID,                               -- 关联 users.id（无外键，由应用层保证）
    uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    graph_status      VARCHAR(50),                        -- 知识图谱抽取状态: pending/extracting/completed/failed/skipped
    graph_error       TEXT,                               -- 知识图谱抽取错误信息
    graph_node_count  INTEGER      DEFAULT 0,             -- 抽取的图谱节点数
    graph_edge_count  INTEGER      DEFAULT 0              -- 抽取的图谱边数
);

CREATE INDEX IF NOT EXISTS idx_kb_files_collection   ON kb_files(collection_id);
CREATE INDEX IF NOT EXISTS idx_kb_files_dify_doc     ON kb_files(dify_document_id);
CREATE INDEX IF NOT EXISTS idx_kb_files_status       ON kb_files(status);
CREATE INDEX IF NOT EXISTS idx_kb_files_graph_status ON kb_files(graph_status);

COMMENT ON TABLE  kb_files IS '知识库文件表（无外键约束）';
COMMENT ON COLUMN kb_files.collection_id IS '关联 kb_collections.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN kb_files.uploaded_by IS '关联 users.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN kb_files.graph_status IS '知识图谱抽取状态: pending/extracting/completed/failed/skipped';

-- ############################################################
-- 第五部分：聊天/问答相关表（后端A 负责）
-- ############################################################

-- 5.1 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL,             -- 关联 users.id（无外键，由应用层保证）
    title           VARCHAR(255) NOT NULL DEFAULT '新会话',
    qa_ref_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
    dify_conversation_id VARCHAR(255),                 -- Dify 对话 ID
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id    ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);

COMMENT ON TABLE  chat_sessions IS '聊天会话表（无外键约束）';
COMMENT ON COLUMN chat_sessions.user_id IS '关联 users.id，无外键，由应用层保证一致性';

-- 5.2 会话-知识库引用关联表
CREATE TABLE IF NOT EXISTS chat_session_kb_refs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL,                     -- 关联 chat_sessions.id（无外键，由应用层保证）
    collection_id   UUID NOT NULL,                     -- 关联 kb_collections.id（无外键，由应用层保证）
    UNIQUE(session_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_session_kb_refs_session ON chat_session_kb_refs(session_id);

COMMENT ON TABLE  chat_session_kb_refs IS '会话-知识库关联表（无外键约束）';
COMMENT ON COLUMN chat_session_kb_refs.session_id IS '关联 chat_sessions.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN chat_session_kb_refs.collection_id IS '关联 kb_collections.id，无外键，由应用层保证一致性';

-- 5.3 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id           UUID         NOT NULL,             -- 关联 chat_sessions.id（无外键，由应用层保证）
    role                 message_role NOT NULL,
    content              TEXT         NOT NULL,
    citations            JSONB,
    reasoning            TEXT,
    knowledge_graph_data JSONB,
    qa_pair_id           UUID,                              -- 关联 qa_pairs.id（无外键，由应用层保证）
    dify_message_id      VARCHAR(255),
    token_count          INTEGER,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

COMMENT ON TABLE  chat_messages IS '聊天消息表（无外键约束）';
COMMENT ON COLUMN chat_messages.session_id IS '关联 chat_sessions.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN chat_messages.qa_pair_id IS '关联 qa_pairs.id，无外键，由应用层保证一致性';

-- 5.4 QA 问答对表
CREATE TABLE IF NOT EXISTS qa_pairs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question        TEXT         NOT NULL,
    answer          TEXT         NOT NULL,
    category        VARCHAR(100) NOT NULL DEFAULT '通用',
    source_type     VARCHAR(50)  DEFAULT 'manual',
    source_session_id UUID,                                 -- 关联 chat_sessions.id（无外键，由应用层保证）
    created_by      UUID,                                 -- 关联 users.id（无外键，由应用层保证）
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_pairs_question_trgm ON qa_pairs USING gin(question gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_qa_pairs_answer_trgm   ON qa_pairs USING gin(answer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_qa_pairs_category      ON qa_pairs(category);

COMMENT ON TABLE  qa_pairs IS 'QA问答对表（无外键约束）';
COMMENT ON COLUMN qa_pairs.source_session_id IS '关联 chat_sessions.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN qa_pairs.created_by IS '关联 users.id，无外键，由应用层保证一致性';

-- ############################################################
-- 第六部分：Apache AGE 知识图谱（后端B 负责）
-- ############################################################

-- 确保 search_path 包含 ag_catalog 以使用 AGE 函数
SET search_path = ag_catalog, "$user", public;

DO $$ BEGIN
    PERFORM create_graph('knowledge_graph');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6.1 图谱元数据辅助表
CREATE TABLE IF NOT EXISTS graph_entities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,
    group_id        INTEGER      NOT NULL DEFAULT 1,
    weight          INTEGER      NOT NULL DEFAULT 10,
    source_doc_id   UUID,                                  -- 关联 kb_files.id（无外键，由应用层保证）
    properties      JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_name_trgm ON graph_entities USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type      ON graph_entities(entity_type);

COMMENT ON TABLE  graph_entities IS '图谱实体表（与AGE双写，无外键约束）';
COMMENT ON COLUMN graph_entities.source_doc_id IS '关联 kb_files.id，无外键，由应用层保证一致性';

-- 6.2 图谱关系表
CREATE TABLE IF NOT EXISTS graph_relationships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_entity_id UUID NOT NULL,                     -- 关联 graph_entities.id（无外键，由应用层保证）
    target_entity_id UUID NOT NULL,                     -- 关联 graph_entities.id（无外键，由应用层保证）
    relation_type    VARCHAR(100) NOT NULL,
    relation_desc    VARCHAR(255),
    weight           NUMERIC(4,2) DEFAULT 1.0,
    source_doc_id    UUID,                                 -- 关联 kb_files.id（无外键，由应用层保证）
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_rels_source ON graph_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_rels_target ON graph_relationships(target_entity_id);

COMMENT ON TABLE  graph_relationships IS '图谱关系表（与AGE双写，无外键约束）';
COMMENT ON COLUMN graph_relationships.source_entity_id IS '关联 graph_entities.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN graph_relationships.target_entity_id IS '关联 graph_entities.id，无外键，由应用层保证一致性';
COMMENT ON COLUMN graph_relationships.source_doc_id IS '关联 kb_files.id，无外键，由应用层保证一致性';

-- ############################################################
-- 第七部分：初始化数据（对应原型 db.ts seed()）
-- ############################################################

-- 7.1 初始化角色
INSERT INTO roles (id, name, description, is_system) VALUES
    ('a0000000-0000-0000-0000-000000000001', '超级管理员', '拥有系统所有权限', TRUE),
    ('a0000000-0000-0000-0000-000000000002', '业务科员',   '可查看所有文档，不可管理', FALSE),
    ('a0000000-0000-0000-0000-000000000003', '人事专员',   '仅管理和引用部门规章制度', FALSE),
    ('a0000000-0000-0000-0000-000000000004', '审计专员',   '负责合规审计与日志查看', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 7.2 初始化用户
INSERT INTO users (id, username, password_hash, display_name, department, role_id, status, phone, email) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'admin',   '$2b$12$dZMAbyuML1m6An2m3GPm2OP0AwXuG.SM2CWYVvwKexuXruxuNn1oq', '系统管理员', '信息化办', 'a0000000-0000-0000-0000-000000000001', 'active', '13800000001', 'admin@gov.cn'),
    ('b0000000-0000-0000-0000-000000000002', 'user',    '$2b$12$dZMAbyuML1m6An2m3GPm2OP0AwXuG.SM2CWYVvwKexuXruxuNn1oq', '王科员',     '综合处',   'a0000000-0000-0000-0000-000000000002', 'active', '13800000002', 'wang@gov.cn'),
    ('b0000000-0000-0000-0000-000000000003', 'auditor', '$2b$12$dZMAbyuML1m6An2m3GPm2OP0AwXuG.SM2CWYVvwKexuXruxuNn1oq', '李审计',     '审计处',   'a0000000-0000-0000-0000-000000000004', 'active', '13800000003', 'audit@gov.cn'),
    ('b0000000-0000-0000-0000-000000000004', 'hr',      '$2b$12$dZMAbyuML1m6An2m3GPm2OP0AwXuG.SM2CWYVvwKexuXruxuNn1oq', '赵人事',     '人事处',   'a0000000-0000-0000-0000-000000000003', 'active', '13800000004', 'hr@gov.cn')
ON CONFLICT (id) DO NOTHING;

-- 7.3 初始化知识库集合
INSERT INTO kb_collections (id, name, parent_id, created_by) VALUES
    ('c0000000-0000-0000-0000-000000000001', '国家政策法规', NULL, 'b0000000-0000-0000-0000-000000000001'),
    ('c0000000-0000-0000-0000-000000000002', '部门规章制度', NULL, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 7.4 初始化角色权限
INSERT INTO role_permissions (role_id, permission_key) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'sys:user:manage'),
    ('a0000000-0000-0000-0000-000000000001', 'sys:rule:manage'),
    ('a0000000-0000-0000-0000-000000000001', 'res:kb:view_module'),
    ('a0000000-0000-0000-0000-000000000001', 'res:kb:manage_all'),
    ('a0000000-0000-0000-0000-000000000001', 'res:kb:ref_all'),
    ('a0000000-0000-0000-0000-000000000001', 'res:qa:manage'),
    ('a0000000-0000-0000-0000-000000000001', 'res:qa:ref'),
    ('a0000000-0000-0000-0000-000000000001', 'res:qa:feedback'),
    ('a0000000-0000-0000-0000-000000000001', 'res:material:manage'),
    ('a0000000-0000-0000-0000-000000000001', 'res:template:manage'),
    ('a0000000-0000-0000-0000-000000000001', 'res:graph:view'),
    ('a0000000-0000-0000-0000-000000000001', 'app:doc:write'),
    ('a0000000-0000-0000-0000-000000000001', 'app:qa:chat'),
    ('a0000000-0000-0000-0000-000000000001', 'sys:audit:view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key) VALUES
    ('a0000000-0000-0000-0000-000000000002', 'app:doc:write'),
    ('a0000000-0000-0000-0000-000000000002', 'app:qa:chat'),
    ('a0000000-0000-0000-0000-000000000002', 'res:kb:view_module'),
    ('a0000000-0000-0000-0000-000000000002', 'res:kb:ref_all'),
    ('a0000000-0000-0000-0000-000000000002', 'res:qa:ref'),
    ('a0000000-0000-0000-0000-000000000002', 'res:qa:feedback'),
    ('a0000000-0000-0000-0000-000000000002', 'res:graph:view'),
    ('a0000000-0000-0000-0000-000000000002', 'res:material:manage')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key) VALUES
    ('a0000000-0000-0000-0000-000000000003', 'app:qa:chat'),
    ('a0000000-0000-0000-0000-000000000003', 'res:kb:view_module'),
    ('a0000000-0000-0000-0000-000000000003', 'res:kb:manage:c0000000-0000-0000-0000-000000000002'),
    ('a0000000-0000-0000-0000-000000000003', 'res:kb:ref:c0000000-0000-0000-0000-000000000002'),
    ('a0000000-0000-0000-0000-000000000003', 'res:qa:ref')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key) VALUES
    ('a0000000-0000-0000-0000-000000000004', 'sys:audit:view'),
    ('a0000000-0000-0000-0000-000000000004', 'app:qa:chat')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 7.5 初始化公文模板
-- 用 DO 块防止重复插入模板
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM document_templates LIMIT 1) THEN
        INSERT INTO document_templates (name, template_type, content, created_by) VALUES
            ('通用通知模板', 'notice', '关于[事项]的通知

各相关单位：

[正文]

特此通知。', 'b0000000-0000-0000-0000-000000000001');
    END IF;
END $$;

-- 7.6 初始化素材库
-- 用 DO 块防止重复插入素材
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM materials LIMIT 1) THEN
        INSERT INTO materials (title, category, content, created_by) VALUES
            ('常用开头(强调意义)', 'opening',    '近年来，随着......的深入推进，......已成为推动高质量发展的重要引擎。为进一步贯彻落实......精神，现就有关事项通知如下：', 'b0000000-0000-0000-0000-000000000001'),
            ('常用开头(根据规定)', 'opening',    '根据《......管理办法》及相关规定，结合我单位实际，制定本方案。', 'b0000000-0000-0000-0000-000000000001'),
            ('常用结尾(请示)',     'closing',    '以上请示当否，请批示。', 'b0000000-0000-0000-0000-000000000001'),
            ('常用结尾(报告)',     'closing',    '特此报告。', 'b0000000-0000-0000-0000-000000000001'),
            ('过渡句(分析问题)',   'transition', '当前，工作中还存在一些不容忽视的问题，主要表现在：', 'b0000000-0000-0000-0000-000000000001'),
            ('政策术语(新质生产力)', 'policy',   '加快发展新质生产力，扎实推进高质量发展。', 'b0000000-0000-0000-0000-000000000001'),
            ('政策术语(数字化)',     'policy',   '充分发挥数据要素乘数效应，赋能经济社会发展。', 'b0000000-0000-0000-0000-000000000001');
    END IF;
END $$;

-- 7.7 初始化敏感词规则
-- 用 DO 块防止重复插入敏感词
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM sensitive_rules LIMIT 1) THEN
        INSERT INTO sensitive_rules (keyword, action, level, note, created_by) VALUES
            ('绝密', 'block', 'high',   '禁止查询涉密信息', 'b0000000-0000-0000-0000-000000000001'),
            ('薪资', 'warn',  'medium', '敏感人事信息',     'b0000000-0000-0000-0000-000000000001');
    END IF;
END $$;

-- 7.8 初始化 QA 问答对
-- 用 DO 块防止重复插入 QA
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM qa_pairs LIMIT 1) THEN
        INSERT INTO qa_pairs (question, answer, category, source_type, created_by) VALUES
            ('什么是“一网通办”？',
             '“一网通办”是指依托一体化在线政务服务平台，通过规范网上办事标准、优化网上办事流程、搭建统一的互联网政务服务总门户、整合政府服务数据资源、完善配套制度等措施，推行线上线下标准一致、服务一体、渠道同源的政务服务模式。',
             '通用概念', 'manual', 'b0000000-0000-0000-0000-000000000001');
    END IF;
END $$;

-- ############################################################
-- 第八部分：通用函数和触发器
-- ############################################################

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON document_templates;
CREATE TRIGGER trg_document_templates_updated_at
    BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_materials_updated_at ON materials;
CREATE TRIGGER trg_materials_updated_at
    BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_sensitive_rules_updated_at ON sensitive_rules;
CREATE TRIGGER trg_sensitive_rules_updated_at
    BEFORE UPDATE ON sensitive_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_kb_collections_updated_at ON kb_collections;
CREATE TRIGGER trg_kb_collections_updated_at
    BEFORE UPDATE ON kb_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_qa_pairs_updated_at ON qa_pairs;
CREATE TRIGGER trg_qa_pairs_updated_at
    BEFORE UPDATE ON qa_pairs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ############################################################
-- 第九部分：常用查询视图（可选）
-- ############################################################

CREATE OR REPLACE VIEW v_user_detail AS
SELECT
    u.id,
    u.username,
    u.display_name,
    u.department,
    u.status,
    u.phone,
    u.email,
    u.last_login_at,
    u.created_at,
    r.id   AS role_id,
    r.name AS role_name,
    r.description AS role_description
FROM users u
LEFT JOIN roles r ON u.role_id = r.id;

CREATE OR REPLACE VIEW v_user_permissions AS
SELECT
    u.id AS user_id,
    u.username,
    rp.permission_key
FROM users u
JOIN roles r ON u.role_id = r.id
JOIN role_permissions rp ON r.id = rp.role_id
WHERE u.status = 'active';

CREATE OR REPLACE VIEW v_kb_file_detail AS
SELECT
    f.id,
    f.collection_id,
    c.name AS collection_name,
    f.name AS file_name,
    f.file_type,
    f.file_size,
    f.status,
    f.dify_document_id,
    f.uploaded_by,
    u.display_name AS uploader_name,
    f.uploaded_at
FROM kb_files f
JOIN kb_collections c ON f.collection_id = c.id
LEFT JOIN users u ON f.uploaded_by = u.id;

-- ############################################################
-- 完成
-- ############################################################
-- 架构说明：
-- 1. 所有UUID关联字段保留，但移除数据库约束（REFERENCES ... ON DELETE）
-- 2. 由应用层代码逻辑（后端A/B）负责：
--    - 创建时验证关联ID存在
--    - 删除时级联处理或软删除
--    - 数据一致性维护
-- 3. 优点：
--    - 更灵活的业务逻辑控制
--    - 避免外键约束冲突
--    - 便于复杂的级联操作
-- 4. 注意：应用层必须实现以下检查
--    - role_id 存在检查（插入/更新 users 时）
--    - creator_id 存在检查（插入 documents 时）
--    - collection_id 存在检查（插入 kb_files 时）
--    - session_id 存在检查（插入 chat_messages 时）
--    - 删除时的级联处理逻辑
