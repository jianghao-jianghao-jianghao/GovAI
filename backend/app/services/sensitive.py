"""敏感词检测服务"""

from dataclasses import dataclass
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sensitive import SensitiveRule


@dataclass
class SensitiveHit:
    keyword: str
    action: str  # 'block' | 'warn'
    level: str
    note: str | None = None


@dataclass
class SensitiveCheckResult:
    passed: bool  # True=无 block 命中
    hits: list[SensitiveHit]


async def check_sensitive_text(db: AsyncSession, text: str) -> SensitiveCheckResult:
    """
    检测文本中的敏感词。
    返回 passed=True 表示无 block 类命中（可能有 warn）。
    """
    result = await db.execute(
        select(SensitiveRule).where(SensitiveRule.is_active == True)  # noqa: E712
    )
    rules = result.scalars().all()

    hits: list[SensitiveHit] = []
    has_block = False

    for rule in rules:
        if rule.keyword in text:
            hit = SensitiveHit(
                keyword=rule.keyword,
                action=rule.action,
                level=rule.level,
                note=rule.note,
            )
            hits.append(hit)
            if rule.action == "block":
                has_block = True

    return SensitiveCheckResult(passed=not has_block, hits=hits)
