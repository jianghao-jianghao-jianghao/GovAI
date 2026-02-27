#!/bin/bash
# 查询文档及 formatted_paragraphs 状态
echo "SELECT id, title, CASE WHEN formatted_paragraphs IS NOT NULL THEN LEFT(formatted_paragraphs, 80) ELSE 'NULL' END as fp_preview FROM documents ORDER BY updated_at DESC;" | docker exec -i govai-postgres psql -U govai_user -d govai_db
