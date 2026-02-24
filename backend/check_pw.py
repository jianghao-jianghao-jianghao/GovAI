import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.security import verify_password

async def check():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT username, password_hash FROM users WHERE username='admin'"))
        row = result.first()
        if row:
            h = row[1]
            print(f"User: {row[0]}")
            for pw in ['admin123', 'Admin123', 'admin', '123456', 'govai123', 'Govai@2025', 'GovAI@2025', 'Admin@123']:
                ok = verify_password(pw, h)
                if ok:
                    print(f"MATCH: {pw}")
                    break
                else:
                    print(f"NO: {pw}")
            else:
                print(f"Hash: {h}")
        else:
            print("admin user not found, listing all:")
            result2 = await session.execute(text("SELECT username FROM users"))
            for r in result2:
                print(f"  Found: {r[0]}")

asyncio.run(check())
