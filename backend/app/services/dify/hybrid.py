"""
Hybrid Dify 服务实现。
智能混合模式：
  - 知识库操作（KB）→ 走真实 Dify API（RealDifyService）
  - Workflow（公文处理）→ 按 API Key 是否配置决定走 Real 还是 Mock
  - Chat（智能问答）→ 按 API Key 是否配置决定走 Real 还是 Mock
  - Entity Extraction → 必须走真实 Dify，禁止 Mock 降级

配置了对应 DIFY_APP_*_KEY 的功能自动使用真实 Dify，未配置的回退到 Mock。
KB/Workflow/Chat 在 Dify 连接不可达时自动降级到 Mock，避免长时间阻塞。
Entity Extraction 不降级，连接失败直接报错。
"""

import logging
from typing import AsyncGenerator, Callable, Optional, TypeVar

from app.core.config import settings
from app.services.dify.base import (
    DifyServiceBase,
    WorkflowResult,
    ReviewResult,
    SSEEvent,
    DatasetInfo,
    DocumentUploadResult,
    EntityTriple,
)
from app.services.dify.client import RealDifyService
from app.services.dify.mock import MockDifyService

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _key_ready(key: str) -> bool:
    """判断 API Key 是否已配置（非空且非占位符）"""
    return bool(key) and not key.startswith("app-xxx") and key != ""


def _is_connection_error(e: Exception) -> bool:
    """判断异常是否属于网络连接/超时类错误（应降级到 Mock）"""
    err_msg = str(e).lower()
    err_msg_raw = str(e)  # 保留原始大小写用于中文匹配
    return any(kw in err_msg for kw in (
        "connection", "connect", "timeout", "unreachable",
        "refused", "dns", "reset by peer", "readtimeout",
    )) or any(kw in err_msg_raw for kw in (
        "连接失败", "请求超时", "超时",
    ))


class HybridDifyService(DifyServiceBase):
    """
    混合模式 Dify 服务。

    已对接真实 Dify 的功能走 Real，API Key 未配置的走 Mock。
    自动检测每个 API Key 的配置状态，无需手动切换。
    所有操作在 Dify 不可达时自动降级到 Mock 模式。
    """

    def __init__(self):
        self._real = RealDifyService()
        self._mock = MockDifyService()

        # 检测各功能的 API Key 就绪状态
        self._kb_ready = _key_ready(settings.DIFY_DATASET_API_KEY)
        self._draft_ready = _key_ready(settings.DIFY_APP_DOC_DRAFT_KEY)
        self._check_ready = _key_ready(settings.DIFY_APP_DOC_CHECK_KEY)
        self._optimize_ready = _key_ready(settings.DIFY_APP_DOC_OPTIMIZE_KEY)
        self._chat_ready = _key_ready(settings.DIFY_APP_CHAT_KEY)
        self._entity_ready = _key_ready(settings.DIFY_APP_ENTITY_EXTRACT_KEY)

        status_parts = [
            f"KB={'Real' if self._kb_ready else 'Mock'}",
            f"Draft={'Real' if self._draft_ready else 'Mock'}",
            f"Check={'Real' if self._check_ready else 'Mock'}",
            f"Optimize={'Real' if self._optimize_ready else 'Mock'}",
            f"Chat={'Real' if self._chat_ready else 'Mock'}",
            f"Entity={'Real' if self._entity_ready else 'Mock'}",
        ]
        logger.info(f"HybridDifyService 初始化: {', '.join(status_parts)}")

    # ── 连接降级辅助 ──

    async def _with_fallback(
        self,
        label: str,
        real_fn,
        mock_fn,
    ):
        """
        执行 Real Dify 调用，连接类错误时自动降级到 Mock。
        非连接类错误（认证、参数等）原样抛出。
        """
        try:
            return await real_fn()
        except Exception as e:
            if _is_connection_error(e):
                logger.warning(f"[{label}] Dify 连接失败，自动降级到 Mock: {e}")
                return await mock_fn()
            raise

    # ── Knowledge Base — 连接失败时降级到 Mock ──

    async def create_dataset(self, name: str) -> DatasetInfo:
        if self._kb_ready:
            return await self._with_fallback(
                "create_dataset",
                lambda: self._real.create_dataset(name),
                lambda: self._mock.create_dataset(name),
            )
        return await self._mock.create_dataset(name)

    async def delete_dataset(self, dataset_id: str) -> None:
        if self._kb_ready:
            return await self._with_fallback(
                "delete_dataset",
                lambda: self._real.delete_dataset(dataset_id),
                lambda: self._mock.delete_dataset(dataset_id),
            )
        return await self._mock.delete_dataset(dataset_id)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        if self._kb_ready:
            return await self._with_fallback(
                "upload_document",
                lambda: self._real.upload_document(dataset_id, file_name, file_content, file_type),
                lambda: self._mock.upload_document(dataset_id, file_name, file_content, file_type),
            )
        return await self._mock.upload_document(dataset_id, file_name, file_content, file_type)

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        if self._kb_ready:
            return await self._with_fallback(
                "delete_document",
                lambda: self._real.delete_document(dataset_id, document_id),
                lambda: self._mock.delete_document(dataset_id, document_id),
            )
        return await self._mock.delete_document(dataset_id, document_id)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        if self._kb_ready:
            return await self._with_fallback(
                "get_indexing_status",
                lambda: self._real.get_indexing_status(dataset_id, batch_id),
                lambda: self._mock.get_indexing_status(dataset_id, batch_id),
            )
        return await self._mock.get_indexing_status(dataset_id, batch_id)

    # ── Workflow — 连接失败时降级到 Mock ──

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        if self._draft_ready:
            return await self._with_fallback(
                "run_doc_draft",
                lambda: self._real.run_doc_draft(title, outline, doc_type, template_content, kb_texts),
                lambda: self._mock.run_doc_draft(title, outline, doc_type, template_content, kb_texts),
            )
        return await self._mock.run_doc_draft(title, outline, doc_type, template_content, kb_texts)

    async def run_doc_check(self, content: str) -> ReviewResult:
        if self._check_ready:
            return await self._with_fallback(
                "run_doc_check",
                lambda: self._real.run_doc_check(content),
                lambda: self._mock.run_doc_check(content),
            )
        return await self._mock.run_doc_check(content)

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        if self._optimize_ready:
            return await self._with_fallback(
                "run_doc_optimize",
                lambda: self._real.run_doc_optimize(content, kb_texts),
                lambda: self._mock.run_doc_optimize(content, kb_texts),
            )
        return await self._mock.run_doc_optimize(content, kb_texts)

    # ── Chat — 连接失败时降级到 Mock ──

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
        kb_context: str = "",
        graph_context: str = "",
        kb_top_score: float = 0.0,
    ) -> AsyncGenerator[SSEEvent, None]:
        if self._chat_ready:
            try:
                async for event in self._real.chat_stream(
                    query, user_id, conversation_id, dataset_ids,
                    kb_context=kb_context, graph_context=graph_context,
                    kb_top_score=kb_top_score,
                ):
                    yield event
                return
            except Exception as e:
                if _is_connection_error(e):
                    logger.warning(f"[chat_stream] Dify 连接失败，自动降级到 Mock: {e}")
                else:
                    raise
        # Mock fallback
        async for event in self._mock.chat_stream(
            query, user_id, conversation_id, dataset_ids,
            kb_context=kb_context, graph_context=graph_context,
            kb_top_score=kb_top_score,
        ):
            yield event

    # ── Entity Extraction — 禁止 Mock，必须走真实 Dify ──

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        if not self._entity_ready:
            raise RuntimeError(
                "实体抽取 API Key 未配置 (DIFY_APP_ENTITY_EXTRACT_KEY)，"
                "无法执行知识图谱抽取"
            )
        # 不使用 _with_fallback，连接失败直接抛异常
        return await self._real.extract_entities(text)
