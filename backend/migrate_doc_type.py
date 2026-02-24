"""
数据库迁移脚本：为 doc_type 枚举添加格式类型分类值
添加: official, academic, legal, custom

使用 asyncpg 直接执行（容器内无 psycopg2）
"""
import asyncio
import asyncpg


async def migrate():
    conn = await asyncpg.connect(
        host='localhost', port=5432,
        user='govai', password='govai123',
        database='govai',
    )

    new_values = ['official', 'academic', 'legal', 'custom']

    for val in new_values:
        try:
            await conn.execute(
                f"ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '{val}'"
            )
            print(f"✅ Added '{val}' to doc_type enum")
        except Exception as e:
            print(f"⚠️  '{val}': {e}")

    # 验证
    rows = await conn.fetch(
        "SELECT unnest(enum_range(NULL::doc_type))::text AS val"
    )
    print(f"\n当前 doc_type 枚举值: {[r['val'] for r in rows]}")

    await conn.close()
    print("\n迁移完成!")


if __name__ == '__main__':
    asyncio.run(migrate())
