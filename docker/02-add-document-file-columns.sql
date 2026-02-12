-- 给已有表追加文件路径字段（幂等，可重复执行）

DO $$
BEGIN
    -- ========== documents 表 ==========
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'documents' AND column_name = 'source_file_path') THEN
        ALTER TABLE documents ADD COLUMN source_file_path VARCHAR(1024);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'documents' AND column_name = 'md_file_path') THEN
        ALTER TABLE documents ADD COLUMN md_file_path VARCHAR(1024);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'documents' AND column_name = 'source_format') THEN
        ALTER TABLE documents ADD COLUMN source_format VARCHAR(20);
    END IF;

    -- ========== kb_files 表 ==========
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'kb_files' AND column_name = 'md_file_path') THEN
        ALTER TABLE kb_files ADD COLUMN md_file_path VARCHAR(1024);
    END IF;
END $$;