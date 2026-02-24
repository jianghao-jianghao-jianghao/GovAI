import asyncio
import asyncpg

async def migrate():
    conn = await asyncpg.connect(
        host="postgres", port=5432,
        user="govai_user", password="govai_password",
        database="govai_db",
    )
    new_values = ["official", "academic", "legal", "custom"]
    for val in new_values:
        try:
            await conn.execute(
                "ALTER TYPE doc_type ADD VALUE IF NOT EXISTS '" + val + "'"
            )
            print("Added: " + val)
        except Exception as e:
            print(val + " -> " + str(e))
    rows = await conn.fetch(
        "SELECT unnest(enum_range(NULL::doc_type))::text AS val"
    )
    vals = [r["val"] for r in rows]
    print("Current doc_type values: " + str(vals))
    await conn.close()
    print("Done!")

asyncio.run(migrate())
