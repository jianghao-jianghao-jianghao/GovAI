import asyncio
from sqlalchemy import text
from app.core.database import engine as async_engine

async def main():
    fid = "bddad811-cb14-468b-acb1-c38a90b42c56"
    async with async_engine.connect() as conn:
        r = await conn.execute(
            text("SELECT name, graph_status, graph_error, graph_node_count, graph_edge_count FROM kb_files WHERE id = :fid"),
            {"fid": fid}
        )
        row = r.fetchone()
        if row:
            print(f"Name: {row[0]}")
            print(f"Graph Status: {row[1]}")
            print(f"Graph Error: {row[2]}")
            print(f"Nodes: {row[3]}")
            print(f"Edges: {row[4]}")
        else:
            print("File not found")

asyncio.run(main())
