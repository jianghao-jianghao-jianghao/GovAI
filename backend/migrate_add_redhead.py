"""Add school_notice_redhead, proposal, lab_fund to doc_type enum."""
import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(host='postgres', port=5432, user='govai_user', password='govai_password', database='govai_db')
    for val in ['school_notice_redhead', 'proposal', 'lab_fund']:
        try:
            await conn.execute(f"ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '{val}'")
            print(f'Added {val}')
        except Exception as e:
            print(f'{val}: {e}')
    rows = await conn.fetch("SELECT unnest(enum_range(NULL::doc_type))::text AS val")
    print(f'Current: {[r["val"] for r in rows]}')
    await conn.close()

asyncio.run(main())
