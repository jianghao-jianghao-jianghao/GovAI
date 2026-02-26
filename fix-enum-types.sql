-- ========================================
-- 修复枚举类型，添加缺失的值
-- ========================================

-- 1. 添加 'format' 到 doc_process_type（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'format' 
        AND enumtypid = 'doc_process_type'::regtype
    ) THEN
        ALTER TYPE doc_process_type ADD VALUE 'format';
        RAISE NOTICE 'Added format to doc_process_type';
    ELSE
        RAISE NOTICE 'format already exists in doc_process_type';
    END IF;
END $$;

-- 2. 添加 'formatted' 到 doc_status（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'formatted' 
        AND enumtypid = 'doc_status'::regtype
    ) THEN
        ALTER TYPE doc_status ADD VALUE 'formatted';
        RAISE NOTICE 'Added formatted to doc_status';
    ELSE
        RAISE NOTICE 'formatted already exists in doc_status';
    END IF;
END $$;

-- 3. 验证枚举值
SELECT 'doc_process_type values:' as info;
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'doc_process_type'::regtype ORDER BY enumsortorder;

SELECT 'doc_status values:' as info;
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'doc_status'::regtype ORDER BY enumsortorder;
