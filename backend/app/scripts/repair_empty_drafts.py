"""修复历史空正文文档状态。"""

import asyncio

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.document import Document


def _is_blank(column):
    return func.coalesce(func.length(func.btrim(column)), 0) == 0


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Document)
            .where(Document.category == "doc")
            .where(_is_blank(Document.content))
            .where(_is_blank(Document.formatted_paragraphs))
            .where(Document.status != "unfilled")
            .order_by(Document.created_at.asc())
        )
        docs = result.scalars().all()

        if not docs:
            print("no empty drafts to repair")
            return

        for doc in docs:
            print(f"repair {doc.id} {doc.title!r} {doc.status} -> unfilled")
            doc.status = "unfilled"

        await db.commit()
        print(f"repaired {len(docs)} documents")


if __name__ == "__main__":
    asyncio.run(main())
