import asyncio
import asyncpg
import os

async def migrate():
    db_url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres:5432/govai")
    # Convert to asyncpg format
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql://", "")
    parts = db_url.split("@")
    user_pass = parts[0].split(":")
    host_db = parts[1].split("/")
    host_port = host_db[0].split(":")
    
    conn = await asyncpg.connect(
        user=user_pass[0], password=user_pass[1],
        host=host_port[0], port=int(host_port[1]) if len(host_port) > 1 else 5432,
        database=host_db[1]
    )
    
    try:
        await conn.execute("ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'formatted' AFTER 'optimized'")
        print("Added 'formatted' to doc_status")
    except Exception as e:
        print(f"doc_status: {e}")
    
    try:
        await conn.execute("ALTER TYPE doc_process_type ADD VALUE IF NOT EXISTS 'format' AFTER 'optimize'")
        print("Added 'format' to doc_process_type")
    except Exception as e:
        print(f"doc_process_type: {e}")
    
    await conn.close()
    print("Done")

asyncio.run(migrate())
