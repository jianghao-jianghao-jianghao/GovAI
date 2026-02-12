"""
Hybrid Dify 服务实现。
在部分 Dify 功能就绪时使用：
  - 知识库操作（KB）→ 走真实 Dify API（RealDifyService）
  - Workflow / Chat / Entity → 走 Mock 数据（MockDifyService）

随着 Dify 功能逐步上线，可将对应方法切换至 RealDifyService。
"""

import logging
from typing import AsyncGenerator, Optional

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


class HybridDifyService(DifyServiceBase):
    """
    混合模式 Dify 服务。

    已对接真实 Dify 的功能走 Real，尚未搭建的走 Mock。
    生产环境推荐使用此模式，直到所有 Dify 功能完全就绪。
    """

    def __init__(self):
        self._real = RealDifyService()
        self._mock = MockDifyService()
        logger.info(
            "HybridDifyService 初始化: KB 操作 → Real Dify, Workflow/Chat/Entity → Mock"
        )

    # ── Knowledge Base — 走真实 Dify ──

    async def create_dataset(self, name: str) -> DatasetInfo:
        return await self._real.create_dataset(name)

    async def delete_dataset(self, dataset_id: str) -> None:
        return await self._real.delete_dataset(dataset_id)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        return await self._real.upload_document(dataset_id, file_name, file_content, file_type)

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        return await self._real.delete_document(dataset_id, document_id)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        return await self._real.get_indexing_status(dataset_id, batch_id)

    # ── Workflow — 暂走 Mock（Dify Workflow 搭建后切换） ──

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        logger.debug("run_doc_draft → Mock (Workflow 尚未对接)")
        return await self._mock.run_doc_draft(title, outline, doc_type, template_content, kb_texts)

    async def run_doc_check(self, content: str) -> ReviewResult:
        logger.debug("run_doc_check → Mock (Workflow 尚未对接)")
        return await self._mock.run_doc_check(content)

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        logger.debug("run_doc_optimize → Mock (Workflow 尚未对接)")
        return await self._mock.run_doc_optimize(content, kb_texts)

    # ── Chat — 暂走 Mock（Dify Chat App 搭建后切换） ──

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
    ) -> AsyncGenerator[SSEEvent, None]:
        logger.debug("chat_stream → Mock (Chat 尚未对接)")
        async for event in self._mock.chat_stream(query, user_id, conversation_id, dataset_ids):
            yield event

    # ── Entity Extraction — 暂走 Mock ──

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        logger.debug("extract_entities → Mock (实体抽取尚未对接)")
        return await self._mock.extract_entities(text)
