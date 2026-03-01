"""QA 问答对管理路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission, get_current_user, get_user_permissions
from app.core.audit import log_action
from app.models.user import User
from app.models.chat import QAPair
from app.schemas.qa import QAPairCreateRequest, QAPairUpdateRequest, QAPairListItem

router = APIRouter(prefix="/qa-pairs", tags=["QAPairs"])

# 预设分类（兜底列表，确保即使数据库为空也有基础分类）
QA_PRESET_CATEGORIES = [
    "通用",
    "公文规范",
    "政策法规",
    "业务流程",
    "系统操作",
    "对话反馈",
]


@router.get("/categories")
async def list_qa_categories(
    current_user: User = Depends(require_permission("res:qa:manage")),
    db: AsyncSession = Depends(get_db),
):
    """获取所有 QA 分类（预设 + 数据库中已有的自定义分类）"""
    result = await db.execute(
        select(QAPair.category).distinct().order_by(QAPair.category)
    )
    db_categories = [row[0] for row in result.all() if row[0]]
    # 合并预设和数据库中的分类，保持预设顺序在前
    all_categories = list(QA_PRESET_CATEGORIES)
    for c in db_categories:
        if c not in all_categories:
            all_categories.append(c)
    return success(data=all_categories)


@router.get("")
async def list_qa_pairs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    category: str = Query(None),
    current_user: User = Depends(require_permission("res:qa:manage")),
    db: AsyncSession = Depends(get_db),
):
    """QA问答对列表（keyword 支持模糊搜索问题、答案和分类）"""
    query = select(QAPair)

    if keyword:
        query = query.where(
            or_(
                QAPair.question.ilike(f"%{keyword}%"),
                QAPair.answer.ilike(f"%{keyword}%"),
                QAPair.category.ilike(f"%{keyword}%"),
            )
        )
    if category:
        query = query.where(QAPair.category == category)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(QAPair.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    pairs = result.scalars().all()

    items = [QAPairListItem.model_validate(p).model_dump(mode="json") for p in pairs]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("")
async def create_qa_pair(
    body: QAPairCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建QA问答对"""
    # 允许 res:qa:manage 或 res:qa:feedback
    permissions = await get_user_permissions(current_user, db)
    if "res:qa:manage" not in permissions and "res:qa:feedback" not in permissions:
        return error(ErrorCode.PERMISSION_DENIED, "无权创建QA问答对")

    pair = QAPair(
        question=body.question,
        answer=body.answer,
        category=body.category,
        source_type=body.source_type,
        source_session_id=body.source_session_id,
        created_by=current_user.id,
    )
    db.add(pair)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建QA问答对", module="QA问答",
        detail=f"问题: {body.question[:50]}...",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(pair.id)}, message="创建成功")


@router.put("/{pair_id}")
async def update_qa_pair(
    pair_id: UUID,
    body: QAPairUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:qa:manage")),
    db: AsyncSession = Depends(get_db),
):
    """更新QA问答对"""
    result = await db.execute(select(QAPair).where(QAPair.id == pair_id))
    pair = result.scalar_one_or_none()
    if not pair:
        return error(ErrorCode.NOT_FOUND, "QA问答对不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pair, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新QA问答对", module="QA问答",
        detail=f"更新QA: {pair.question[:50]}...",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/{pair_id}")
async def delete_qa_pair(
    pair_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("res:qa:manage")),
    db: AsyncSession = Depends(get_db),
):
    """删除QA问答对"""
    result = await db.execute(select(QAPair).where(QAPair.id == pair_id))
    pair = result.scalar_one_or_none()
    if not pair:
        return error(ErrorCode.NOT_FOUND, "QA问答对不存在")

    question = pair.question[:50]
    await db.delete(pair)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除QA问答对", module="QA问答",
        detail=f"删除QA: {question}...",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")
