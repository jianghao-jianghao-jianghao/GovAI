"""Add formatted_paragraphs column to documents table."""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='documents' AND column_name='formatted_paragraphs'"
            )
        )
        if result.fetchone():
            print("Column formatted_paragraphs already exists, skipping.")
        else:
            await conn.execute(text("ALTER TABLE documents ADD COLUMN formatted_paragraphs TEXT"))
            print("Column formatted_paragraphs added successfully.")


if __name__ == "__main__":
    asyncio.run(migrate())
