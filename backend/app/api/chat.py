"""聊天会话 & 消息路由（后端检索版）"""

import json
import logging
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete as sa_delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission, get_current_user
from app.core.audit import log_action
from app.core.config import settings
from app.models.user import User
from app.models.chat import ChatSession, ChatSessionKBRef, ChatMessage, QAPair
from app.models.knowledge import KBCollection
from app.models.graph import GraphEntity, GraphRelationship
from app.schemas.chat import (
    ChatSessionCreateRequest, ChatSessionUpdateRequest,
    ChatSessionListItem, ChatMessageItem, ChatSendRequest,
)
from app.services.dify.factory import get_dify_service
from app.services.sensitive import check_sensitive_text

logger = logging.getLogger(__name__)

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
    """
    发送消息（SSE 流式响应 — 后端检索版）

    推理步骤：
      Step 1: 敏感词检测
      Step 2: QA 库检索（pg_trgm 本地匹配）
      Step 3: 知识库文档检索（Dify Retrieve API — 仅选定集合）
      Step 4: 知识图谱关系查询
      Step 5: 组装上下文 → 调用 LLM 工作流生成回答
    """
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

    # 预先获取会话关联数据
    refs_result = await db.execute(
        select(ChatSessionKBRef.collection_id).where(ChatSessionKBRef.session_id == session_id)
    )
    collection_ids = [row[0] for row in refs_result.all()]

    # 获取集合信息（含 dify_dataset_id 和名称）
    kb_info_map: dict[str, dict] = {}  # dataset_id -> {name, collection_id}
    if collection_ids:
        coll_result = await db.execute(
            select(KBCollection)
            .where(KBCollection.id.in_(collection_ids), KBCollection.dify_dataset_id.isnot(None))
        )
        for coll in coll_result.scalars().all():
            kb_info_map[coll.dify_dataset_id] = {
                "name": coll.name,
                "collection_id": str(coll.id),
            }

    dataset_ids = list(kb_info_map.keys())
    warn_hits = [h for h in sensitive_result.hits if h.action == "warn"]

    async def event_generator():
        t0 = time.time()

        def _sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        # ── 敏感词警告 ──
        if warn_hits:
            yield _sse("warning", {"keywords": [h.keyword for h in warn_hits]})

        all_citations = []
        all_reasoning_steps = []
        graph_triples = []
        kb_context_text = ""
        graph_context_text = ""
        qa_hit = False
        qa_answer = ""
        top_score = 0.0

        # ═══ Step 1: 敏感词检测 ═══
        step1 = {
            "step": 1,
            "title": "敏感词检测",
            "status": "completed",
            "detail": "通过" if not warn_hits else f"发现 {len(warn_hits)} 个警告词",
            "elapsed": round(time.time() - t0, 2),
        }
        all_reasoning_steps.append(step1)
        yield _sse("reasoning_step", step1)

        # ═══ Step 2: QA 库检索 ═══
        t_qa = time.time()
        qa_records = []
        if session.qa_ref_enabled:
            yield _sse("reasoning_step", {
                "step": 2, "title": "QA 知识库检索", "status": "running",
                "detail": "正在从 QA 问答库中检索匹配的标准答案...",
            })

            try:
                qa_db_result = await db.execute(
                    select(QAPair).where(
                        func.similarity(QAPair.question, body.content) > 0.3
                    ).order_by(func.similarity(QAPair.question, body.content).desc()).limit(3)
                )
                local_qa_hits = qa_db_result.scalars().all()
                for qa in local_qa_hits:
                    qa_records.append({
                        "content": qa.question,
                        "answer": qa.answer,
                        "document_name": "QA 问答库",
                        "segment_id": str(qa.id),
                        "score": 0.9,
                        "source_type": "qa_local",
                        "category": qa.category,
                    })
            except Exception as e:
                logger.warning(f"本地 QA 查询失败: {e}")

        if qa_records:
            best_qa = qa_records[0]
            top_score = best_qa["score"]
            if top_score >= 0.6 and best_qa.get("answer"):
                qa_hit = True
                qa_answer = best_qa["answer"]
                all_citations.append({
                    "title": "QA 问答库",
                    "type": "qa",
                    "quote": best_qa["content"],
                    "answer": best_qa["answer"],
                    "score": top_score,
                    "segment_id": best_qa["segment_id"],
                    "category": best_qa.get("category", ""),
                })

        step2 = {
            "step": 2, "title": "QA 知识库检索", "status": "completed",
            "detail": f"命中 {len(qa_records)} 条 QA 记录" + (f"，最高相似度 {top_score:.0%}" if qa_records else ""),
            "hit": qa_hit,
            "elapsed": round(time.time() - t_qa, 2),
        }
        all_reasoning_steps.append(step2)
        yield _sse("reasoning_step", step2)

        # ═══ Step 3: 知识库文档检索（仅选定集合，通过 Dify Retrieve API） ═══
        t_kb = time.time()
        kb_records = []
        if dataset_ids:
            yield _sse("reasoning_step", {
                "step": 3, "title": "知识库文档检索", "status": "running",
                "detail": f"正在检索 {len(dataset_ids)} 个知识库集合...",
            })

            for ds_id in dataset_ids:
                try:
                    records = await _retrieve_from_dify(ds_id, body.content, top_k=5, score_threshold=0.1)
                    ds_info = kb_info_map.get(ds_id, {})
                    for r in records:
                        r["collection_name"] = ds_info.get("name", "")
                        r["collection_id"] = ds_info.get("collection_id", "")
                    kb_records.extend(records)
                except Exception as e:
                    logger.warning(f"知识库 {ds_id} 检索失败: {e}")

            # 按 score 排序取 top
            kb_records.sort(key=lambda x: x.get("score", 0), reverse=True)
            kb_records = kb_records[:8]

            # 构建 kb_context 与 citations
            context_parts = []
            for i, rec in enumerate(kb_records, 1):
                all_citations.append({
                    "title": rec["document_name"],
                    "type": "kb",
                    "quote": rec["content"][:500],
                    "score": rec.get("score"),
                    "document_id": rec.get("document_id"),
                    "dataset_id": rec.get("dataset_id"),
                    "dataset_name": rec.get("collection_name", ""),
                    "segment_id": rec.get("segment_id"),
                    "position": rec.get("position"),
                    "collection_id": rec.get("collection_id"),
                })
                context_parts.append(
                    f"[{i}] 来源: {rec['document_name']} "
                    f"(集合: {rec.get('collection_name', '未知')}, 相关度: {rec.get('score', 0):.2f})\n"
                    f"{rec['content']}"
                )
            kb_context_text = "\n\n".join(context_parts)
            if kb_records:
                top_score = max(top_score, kb_records[0].get("score", 0))

        step3 = {
            "step": 3, "title": "知识库文档检索", "status": "completed",
            "detail": (
                f"从 {len(dataset_ids)} 个集合中检索到 {len(kb_records)} 个相关段落"
                if dataset_ids else "未选择知识库，跳过文档检索"
            ) + (f"，最高分 {kb_records[0]['score']:.2f}" if kb_records else ""),
            "records_count": len(kb_records),
            "elapsed": round(time.time() - t_kb, 2),
        }
        all_reasoning_steps.append(step3)
        yield _sse("reasoning_step", step3)

        # ═══ Step 4: 知识图谱查询 ═══
        t_graph = time.time()
        yield _sse("reasoning_step", {
            "step": 4, "title": "知识图谱关系查询", "status": "running",
            "detail": "正在从知识图谱中查询相关实体和关系...",
        })

        graph_data = {"entities": [], "triples": [], "context_text": ""}
        try:
            graph_data = await _query_knowledge_graph(db, body.content, top_k=15)
            graph_triples = graph_data["triples"]
            graph_context_text = graph_data["context_text"]
        except Exception as e:
            logger.warning(f"知识图谱查询失败: {e}")

        step4 = {
            "step": 4, "title": "知识图谱关系查询", "status": "completed",
            "detail": f"找到 {len(graph_data['entities'])} 个相关实体，{len(graph_triples)} 条关系",
            "entities_count": len(graph_data["entities"]),
            "triples_count": len(graph_triples),
            "elapsed": round(time.time() - t_graph, 2),
        }
        all_reasoning_steps.append(step4)
        yield _sse("reasoning_step", step4)

        # 推送 knowledge_graph 事件 + 加入引文列表
        if graph_triples:
            yield _sse("knowledge_graph", {"triples": graph_triples})
            # 将图谱关系加入 citations，使前端参考文献区可展示
            for gi, gt in enumerate(graph_triples, 1):
                all_citations.append({
                    "title": f"[G{gi}] {gt['source']} → {gt['relation']} → {gt['target']}",
                    "type": "graph",
                    "quote": f"{gt['source']}({gt.get('source_type','')}) 与 "
                             f"{gt['target']}({gt.get('target_type','')}) "
                             f"存在 [{gt['relation']}] 关系",
                    "source_name": gt["source"],
                    "target_name": gt["target"],
                    "source_type": gt.get("source_type", ""),
                    "target_type": gt.get("target_type", ""),
                    "source_id": gt.get("source_id"),
                    "target_id": gt.get("target_id"),
                    "relation": gt["relation"],
                    "score": None,
                })

        # ═══ Step 5: LLM 推理生成回答 ═══
        t_llm = time.time()
        yield _sse("reasoning_step", {
            "step": 5, "title": "AI 综合推理", "status": "running",
            "detail": "正在基于检索结果调用大语言模型生成回答...",
        })

        # QA 强命中 → 将 QA 答案注入 context
        if qa_hit and qa_answer:
            kb_context_text = (
                f"[QA标准答案] (来自QA问答库，相似度: {top_score:.2f})\n{qa_answer}\n\n"
                + kb_context_text
            )

        full_text = ""
        message_id = None
        conversation_id = session.dify_conversation_id

        try:
            dify = get_dify_service()
            async for sse_event in dify.chat_stream(
                query=body.content,
                user_id=str(current_user.id),
                conversation_id=conversation_id,
                dataset_ids=dataset_ids,
                kb_context=kb_context_text,
                graph_context=graph_context_text,
                kb_top_score=top_score,
            ):
                if sse_event.event == "text_chunk":
                    yield _sse("text_chunk", sse_event.data)
                    full_text += sse_event.data.get("text", "")
                elif sse_event.event == "message_start":
                    yield _sse("message_start", sse_event.data)
                    message_id = sse_event.data.get("message_id")
                    new_conv_id = sse_event.data.get("conversation_id")
                    if new_conv_id and not session.dify_conversation_id:
                        session.dify_conversation_id = new_conv_id
                elif sse_event.event == "message_replace":
                    yield _sse("message_replace", sse_event.data)
                    full_text = sse_event.data.get("text", full_text)
                elif sse_event.event == "message_end":
                    pass  # 使用后端检索结果的 citations，不用 Dify 的
                elif sse_event.event == "error":
                    yield _sse("error", sse_event.data)

        except Exception as e:
            logger.error(f"Dify chat_stream 异常: {e}")
            if qa_hit and qa_answer:
                full_text = qa_answer
                yield _sse("text_chunk", {"text": qa_answer})
            else:
                full_text = f"⚠️ AI 推理服务暂时不可用: {str(e)}"
                yield _sse("text_chunk", {"text": full_text})

        step5 = {
            "step": 5, "title": "AI 综合推理", "status": "completed",
            "detail": f"回答生成完成，共 {len(full_text)} 字",
            "elapsed": round(time.time() - t_llm, 2),
        }
        all_reasoning_steps.append(step5)
        yield _sse("reasoning_step", step5)

        # ── 推送引文和结束事件 ──
        if all_citations:
            yield _sse("citations", {"citations": all_citations})

        # 构建完整推理摘要
        reasoning_summary = "\n".join([
            f"Step {s['step']}: {s['title']} — {s.get('detail', '')} ({s.get('elapsed', 0)}s)"
            for s in all_reasoning_steps
        ])

        yield _sse("reasoning", {"text": reasoning_summary, "steps": all_reasoning_steps})

        # message_end
        yield _sse("message_end", {
            "message_id": message_id or "",
            "conversation_id": session.dify_conversation_id or "",
            "token_count": 0,
            "total_elapsed": round(time.time() - t0, 2),
        })

        # ── 持久化 AI 消息 ──
        try:
            ai_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=full_text,
                dify_message_id=message_id,
                citations=all_citations if all_citations else None,
                reasoning=reasoning_summary,
                knowledge_graph_data=graph_triples if graph_triples else None,
            )
            db.add(ai_msg)
            await db.flush()
            await db.commit()
        except Exception as e:
            logger.error(f"持久化 AI 消息失败: {e}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ══════════════════════════════════════════════════════════
# 后端检索辅助函数
# ══════════════════════════════════════════════════════════


async def _retrieve_from_dify(dataset_id: str, query: str, top_k: int = 5,
                              score_threshold: float = 0.0) -> list[dict]:
    """
    调用 Dify Dataset Retrieve API 检索知识库。
    返回 [{ content, document_name, document_id, segment_id, score, position }]
    """
    import httpx

    url = f"{settings.DIFY_BASE_URL}/datasets/{dataset_id}/retrieve"
    headers = {"Authorization": f"Bearer {settings.DIFY_DATASET_API_KEY}"}

    retrieval_model = {
        "search_method": "hybrid_search",
        "reranking_enable": True,
        "reranking_mode": "reranking_model",
        "reranking_model": {
            "reranking_provider_name": "langgenius/tongyi/tongyi",
            "reranking_model_name": "gte-rerank",
        },
        "top_k": top_k,
        "score_threshold_enabled": score_threshold > 0,
        "score_threshold": score_threshold,
    }

    body = {"query": query, "retrieval_model": retrieval_model}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                logger.warning(f"Dify retrieve 失败 ({resp.status_code}): {resp.text[:200]}")
                return []
            data = resp.json()

        records = []
        for r in data.get("records", []):
            seg = r.get("segment", {})
            doc = seg.get("document", {})
            records.append({
                "content": seg.get("content", ""),
                "answer": seg.get("answer"),
                "document_name": doc.get("name", ""),
                "document_id": doc.get("id", ""),
                "dataset_id": dataset_id,
                "segment_id": seg.get("id", ""),
                "score": r.get("score", 0),
                "position": seg.get("position"),
                "word_count": seg.get("word_count", 0),
            })
        return records
    except Exception as e:
        logger.warning(f"Dify retrieve 异常: {e}")
        return []


def _extract_chinese_keywords(text: str) -> list[str]:
    """
    从中文文本中提取搜索关键词（不依赖分词库）。
    策略：去除常见虚词/标点 → 滑窗提取 2~6 字 n-gram → 去重
    """
    import re
    # 去标点
    text = re.sub(r'[？?！!。，,、；;：:（）()\[\]【】""\'\'"\s]+', ' ', text)
    # 常见中文虚词/停用词
    stop_words = {
        '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
        '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
        '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
        '那', '些', '什么', '怎么', '如何', '为什么', '哪些', '哪个',
        '吗', '吧', '呢', '啊', '呀', '嗯', '哦', '哈', '么', '把', '被',
        '让', '给', '从', '向', '对', '以', '及', '等', '而', '或', '与',
        '还', '但', '虽然', '因为', '所以', '如果', '那么', '可以',
        '能', '应该', '需要', '请问', '请', '谢谢', '关于',
    }
    segments = text.split()
    words = [w for w in segments if w and w not in stop_words]
    clean = ''.join(words)
    if not clean:
        return [text[:10]] if text else []

    keywords = set()
    # 整段作为一个模糊搜索项（截短）
    if len(clean) <= 15:
        keywords.add(clean)
    # 提取 2~6 字 n-gram
    for n in range(2, min(7, len(clean) + 1)):
        for i in range(len(clean) - n + 1):
            gram = clean[i:i+n]
            if gram not in stop_words:
                keywords.add(gram)
    # 也保留各个独立片段
    for w in words:
        if len(w) >= 2:
            keywords.add(w)
    return list(keywords)


async def _query_knowledge_graph(db: AsyncSession, query: str, top_k: int = 10) -> dict:
    """
    从 PostgreSQL 知识图谱中查询与问题相关的实体和关系。
    返回 { entities: [...], triples: [...], context_text: str }
    """
    # 中文关键词提取
    keywords = _extract_chinese_keywords(query)
    if not keywords:
        keywords = [query[:20]]

    conditions = [GraphEntity.name.ilike(f"%{kw}%") for kw in keywords]

    result = await db.execute(
        select(GraphEntity)
        .where(or_(*conditions))
        .limit(top_k)
    )
    entities = result.scalars().all()

    if not entities:
        return {"entities": [], "triples": [], "context_text": ""}

    entity_ids = [e.id for e in entities]
    entity_map = {e.id: e for e in entities}

    # 查关联关系（1 跳）
    rels_result = await db.execute(
        select(GraphRelationship).where(
            or_(
                GraphRelationship.source_entity_id.in_(entity_ids),
                GraphRelationship.target_entity_id.in_(entity_ids),
            )
        )
    )
    rels = rels_result.scalars().all()

    # 补全关系中涉及但未在初始集合中的实体
    extra_ids = set()
    for r in rels:
        if r.source_entity_id not in entity_map:
            extra_ids.add(r.source_entity_id)
        if r.target_entity_id not in entity_map:
            extra_ids.add(r.target_entity_id)

    if extra_ids:
        extra_result = await db.execute(
            select(GraphEntity).where(GraphEntity.id.in_(extra_ids))
        )
        for e in extra_result.scalars().all():
            entity_map[e.id] = e

    # 构建输出
    triples = []
    for r in rels:
        src = entity_map.get(r.source_entity_id)
        tgt = entity_map.get(r.target_entity_id)
        if src and tgt:
            triples.append({
                "source": src.name,
                "source_type": src.entity_type,
                "source_id": str(src.id),
                "target": tgt.name,
                "target_type": tgt.entity_type,
                "target_id": str(tgt.id),
                "relation": r.relation_type,
            })

    entity_list = [
        {"id": str(e.id), "name": e.name, "type": e.entity_type}
        for e in entity_map.values()
    ]

    # 构建可读文本供 LLM 使用
    lines = []
    for i, t in enumerate(triples, 1):
        lines.append(f"[G{i}] {t['source']}({t['source_type']}) --[{t['relation']}]--> {t['target']}({t['target_type']})")

    return {
        "entities": entity_list,
        "triples": triples,
        "context_text": "\n".join(lines) if lines else "",
    }
