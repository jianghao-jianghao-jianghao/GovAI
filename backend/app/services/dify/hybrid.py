"""
Hybrid Dify 服务实现。
智能混合模式：
  - 知识库操作（KB）→ 走真实 Dify API（RealDifyService）
  - Workflow（公文处理）→ 按 API Key 是否配置决定走 Real 还是 Mock
  - Chat（智能问答）→ 按 API Key 是否配置决定走 Real 还是 Mock
  - Entity Extraction → 按 API Key 是否配置决定走 Real 还是 Mock

配置了对应 DIFY_APP_*_KEY 的功能自动使用真实 Dify，未配置的回退到 Mock。
"""

import logging
from typing import AsyncGenerator, Optional

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


def _key_ready(key: str) -> bool:
    """判断 API Key 是否已配置（非空且非占位符）"""
    return bool(key) and not key.startswith("app-xxx") and key != ""


class HybridDifyService(DifyServiceBase):
    """
    混合模式 Dify 服务。

    已对接真实 Dify 的功能走 Real，API Key 未配置的走 Mock。
    自动检测每个 API Key 的配置状态，无需手动切换。
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

    # ── Knowledge Base — 走真实 Dify ──

    async def create_dataset(self, name: str) -> DatasetInfo:
        if self._kb_ready:
            return await self._real.create_dataset(name)
        return await self._mock.create_dataset(name)

    async def delete_dataset(self, dataset_id: str) -> None:
        if self._kb_ready:
            return await self._real.delete_dataset(dataset_id)
        return await self._mock.delete_dataset(dataset_id)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        if self._kb_ready:
            return await self._real.upload_document(dataset_id, file_name, file_content, file_type)
        return await self._mock.upload_document(dataset_id, file_name, file_content, file_type)

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        if self._kb_ready:
            return await self._real.delete_document(dataset_id, document_id)
        return await self._mock.delete_document(dataset_id, document_id)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        if self._kb_ready:
            return await self._real.get_indexing_status(dataset_id, batch_id)
        return await self._mock.get_indexing_status(dataset_id, batch_id)

    # ── Workflow — 按 Key 就绪状态自动切换 ──

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        if self._draft_ready:
            logger.debug("run_doc_draft → Real Dify Workflow")
            return await self._real.run_doc_draft(title, outline, doc_type, template_content, kb_texts)
        logger.debug("run_doc_draft → Mock (DIFY_APP_DOC_DRAFT_KEY 未配置)")
        return await self._mock.run_doc_draft(title, outline, doc_type, template_content, kb_texts)

    async def run_doc_check(self, content: str) -> ReviewResult:
        if self._check_ready:
            logger.debug("run_doc_check → Real Dify Workflow")
            return await self._real.run_doc_check(content)
        logger.debug("run_doc_check → Mock (DIFY_APP_DOC_CHECK_KEY 未配置)")
        return await self._mock.run_doc_check(content)

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        if self._optimize_ready:
            logger.debug("run_doc_optimize → Real Dify Workflow")
            return await self._real.run_doc_optimize(content, kb_texts)
        logger.debug("run_doc_optimize → Mock (DIFY_APP_DOC_OPTIMIZE_KEY 未配置)")
        return await self._mock.run_doc_optimize(content, kb_texts)

    # ── Chat — 按 Key 就绪状态自动切换 ──

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
    ) -> AsyncGenerator[SSEEvent, None]:
        if self._chat_ready:
            logger.debug("chat_stream → Real Dify Chat")
            async for event in self._real.chat_stream(query, user_id, conversation_id, dataset_ids):
                yield event
        else:
            logger.debug("chat_stream → Mock (DIFY_APP_CHAT_KEY 未配置)")
            async for event in self._mock.chat_stream(query, user_id, conversation_id, dataset_ids):
                yield event

    # ── Entity Extraction — 按 Key 就绪状态自动切换 ──

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        if self._entity_ready:
            logger.debug("extract_entities → Real Dify Workflow")
            return await self._real.extract_entities(text)
        logger.debug("extract_entities → Mock (DIFY_APP_ENTITY_EXTRACT_KEY 未配置)")
        return await self._mock.extract_entities(text)
