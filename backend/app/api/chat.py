"""聊天会话 & 消息路由"""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission, get_current_user
from app.core.audit import log_action
from app.models.user import User
from app.models.chat import ChatSession, ChatSessionKBRef, ChatMessage, QAPair
from app.models.knowledge import KBCollection
from app.schemas.chat import (
    ChatSessionCreateRequest, ChatSessionUpdateRequest,
    ChatSessionListItem, ChatMessageItem, ChatSendRequest,
)
from app.services.dify.factory import get_dify_service
from app.services.sensitive import check_sensitive_text

router = APIRouter(prefix="/chat", tags=["ChatSessions", "ChatMessages"])


# ── Sessions ──


@router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """会话列表"""
    query = select(ChatSession).where(ChatSession.user_id == current_user.id)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(ChatSession.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    sessions = result.scalars().all()

    # 批量查消息数
    session_ids = [s.id for s in sessions]
    msg_counts = {}
    if session_ids:
        mc_result = await db.execute(
            select(ChatMessage.session_id, func.count(ChatMessage.id))
            .where(ChatMessage.session_id.in_(session_ids))
            .group_by(ChatMessage.session_id)
        )
        msg_counts = {row[0]: row[1] for row in mc_result.all()}

    # 批量查 KB refs
    kb_refs_map: dict[UUID, list[UUID]] = {}
    if session_ids:
        refs_result = await db.execute(
            select(ChatSessionKBRef).where(ChatSessionKBRef.session_id.in_(session_ids))
        )
        for ref in refs_result.scalars().all():
            kb_refs_map.setdefault(ref.session_id, []).append(ref.collection_id)

    items = [
        {
            **ChatSessionListItem.model_validate(s).model_dump(mode="json"),
            "message_count": msg_counts.get(s.id, 0),
            "kb_collection_ids": [str(cid) for cid in kb_refs_map.get(s.id, [])],
        }
        for s in sessions
    ]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("/sessions")
async def create_session(
    body: ChatSessionCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """创建会话"""
    session = ChatSession(
        user_id=current_user.id,
        title=body.title,
        qa_ref_enabled=body.qa_ref_enabled,
    )
    db.add(session)
    await db.flush()

    # 写入 KB refs
    for cid in body.kb_collection_ids:
        db.add(ChatSessionKBRef(session_id=session.id, collection_id=cid))
    await db.flush()

    return success(data={"id": str(session.id)}, message="会话创建成功")


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: UUID,
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """获取会话详情（含消息）"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return error(ErrorCode.NOT_FOUND, "会话不存在")

    # 消息列表
    msgs_result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
    )
    messages = [
        ChatMessageItem.model_validate(m).model_dump(mode="json")
        for m in msgs_result.scalars().all()
    ]

    # KB refs
    refs_result = await db.execute(
        select(ChatSessionKBRef.collection_id).where(ChatSessionKBRef.session_id == session_id)
    )
    kb_ids = [str(row[0]) for row in refs_result.all()]

    data = {
        **ChatSessionListItem.model_validate(session).model_dump(mode="json"),
        "kb_collection_ids": kb_ids,
        "message_count": len(messages),
        "messages": messages,
    }

    return success(data=data)


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: UUID,
    body: ChatSessionUpdateRequest,
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """更新会话设置"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return error(ErrorCode.NOT_FOUND, "会话不存在")

    if body.title is not None:
        session.title = body.title
    if body.qa_ref_enabled is not None:
        session.qa_ref_enabled = body.qa_ref_enabled

    # 全量覆盖 KB refs
    if body.kb_collection_ids is not None:
        await db.execute(
            sa_delete(ChatSessionKBRef).where(ChatSessionKBRef.session_id == session_id)
        )
        for cid in body.kb_collection_ids:
            db.add(ChatSessionKBRef(session_id=session_id, collection_id=cid))

    await db.flush()
    return success(message="会话更新成功")


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """删除会话"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return error(ErrorCode.NOT_FOUND, "会话不存在")

    # 删除消息
    await db.execute(sa_delete(ChatMessage).where(ChatMessage.session_id == session_id))
    # 删除 KB refs
    await db.execute(sa_delete(ChatSessionKBRef).where(ChatSessionKBRef.session_id == session_id))
    # 删除会话
    await db.delete(session)
    await db.flush()

    return success(message="会话删除成功")


# ── Messages ──


@router.get("/sessions/{session_id}/messages")
async def list_messages(
    session_id: UUID,
    before: str = Query(None, description="加载此时间之前的消息"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """获取消息列表"""
    # 验证会话归属
    sess_result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    if not sess_result.scalar_one_or_none():
        return error(ErrorCode.NOT_FOUND, "会话不存在")

    query = select(ChatMessage).where(ChatMessage.session_id == session_id)
    if before:
        query = query.where(ChatMessage.created_at < before)
    query = query.order_by(ChatMessage.created_at.asc()).limit(limit)

    result = await db.execute(query)
    messages = [
        ChatMessageItem.model_validate(m).model_dump(mode="json")
        for m in result.scalars().all()
    ]

    return success(data=messages)


@router.post("/sessions/{session_id}/send")
async def send_message(
    session_id: UUID,
    body: ChatSendRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:qa:chat")),
    db: AsyncSession = Depends(get_db),
):
    """发送消息（SSE 流式响应）"""
    # 1. 验证会话
    sess_result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        return error(ErrorCode.NOT_FOUND, "会话不存在")

    # 2. 敏感词检测
    sensitive_result = await check_sensitive_text(db, body.content)
    if not sensitive_result.passed:
        block_words = [h.keyword for h in sensitive_result.hits if h.action == "block"]
        return error(ErrorCode.SENSITIVE_BLOCK, f"包含违禁词: {', '.join(block_words)}")

    # 3. 保存用户消息
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.flush()

    # 4. QA 优先匹配
    if session.qa_ref_enabled:
        qa_result = await db.execute(
            select(QAPair).where(
                func.similarity(QAPair.question, body.content) > 0.3
            ).order_by(func.similarity(QAPair.question, body.content).desc()).limit(1)
        )
        qa_hit = qa_result.scalar_one_or_none()
        if qa_hit:
            # 直接返回 QA 标准答案（非流式）
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=qa_hit.answer,
                qa_pair_id=qa_hit.id,
                citations=[{"title": "QA问答库", "type": "qa", "quote": qa_hit.question}],
            )
            db.add(ai_msg)
            await db.flush()

            return success(data={
                "type": "qa_match",
                "message": ChatMessageItem.model_validate(ai_msg).model_dump(mode="json"),
            })

    # 5. 获取关联的知识库 dataset_ids
    refs_result = await db.execute(
        select(ChatSessionKBRef.collection_id).where(ChatSessionKBRef.session_id == session_id)
    )
    collection_ids = [row[0] for row in refs_result.all()]

    dataset_ids = []
    if collection_ids:
        coll_result = await db.execute(
            select(KBCollection.dify_dataset_id)
            .where(KBCollection.id.in_(collection_ids), KBCollection.dify_dataset_id.isnot(None))
        )
        dataset_ids = [row[0] for row in coll_result.all()]

    # 6. 构建 SSE 响应
    warn_hits = [h for h in sensitive_result.hits if h.action == "warn"]

    async def event_generator():
        dify = get_dify_service()

        # 敏感词警告事件
        if warn_hits:
            yield f"event: warning\ndata: {json.dumps({'keywords': [h.keyword for h in warn_hits]}, ensure_ascii=False)}\n\n"

        full_text = ""
        conversation_id = session.dify_conversation_id
        message_id = None

        try:
            async for sse_event in dify.chat_stream(
                query=body.content,
                user_id=str(current_user.id),
                conversation_id=conversation_id,
                dataset_ids=dataset_ids,
            ):
                event_data = json.dumps(sse_event.data, ensure_ascii=False)
                yield f"event: {sse_event.event}\ndata: {event_data}\n\n"

                if sse_event.event == "text_chunk":
                    full_text += sse_event.data.get("text", "")
                elif sse_event.event == "message_start":
                    message_id = sse_event.data.get("message_id")
                    new_conv_id = sse_event.data.get("conversation_id")
                    if new_conv_id and not session.dify_conversation_id:
                        session.dify_conversation_id = new_conv_id
                elif sse_event.event == "message_end":
                    # 保存 AI 消息
                    ai_msg = ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=full_text,
                        dify_message_id=message_id,
                        token_count=sse_event.data.get("token_count"),
                    )
                    db.add(ai_msg)
                    await db.flush()
                    await db.commit()

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'code': ErrorCode.SSE_ERROR, 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
