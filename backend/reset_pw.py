import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password

async def reset():
    new_hash = hash_password('admin123')
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE users SET password_hash = :h WHERE username = 'admin'"),
            {"h": new_hash}
        )
        await session.commit()
        print(f"admin password reset to 'admin123', hash: {new_hash[:30]}...")

asyncio.run(reset())
