"""
Dify 真实服务实现（占位）。
当 DIFY_MOCK=false 且 Dify 已搭建完成时使用。
当前为骨架代码，待 Dify 就绪后补全。
"""

import httpx
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


class RealDifyService(DifyServiceBase):
    """
    真实 Dify API 客户端。
    TODO: Dify 搭建完成后补全所有方法实现。
    """

    def __init__(self):
        self.base_url = settings.DIFY_BASE_URL
        self.dataset_api_key = settings.DIFY_DATASET_API_KEY
        self.timeout = httpx.Timeout(timeout=60.0, connect=10.0)

    async def create_dataset(self, name: str) -> DatasetInfo:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def delete_dataset(self, dataset_id: str) -> None:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def run_doc_check(self, content: str) -> ReviewResult:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
    ) -> AsyncGenerator[SSEEvent, None]:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")
        # 需要 yield 使其成为 async generator
        yield  # type: ignore  # noqa: unreachable

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        raise NotImplementedError("Dify 尚未搭建，请使用 DIFY_MOCK=true")
