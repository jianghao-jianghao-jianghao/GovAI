"""
Hybrid Dify 服务实现 — 纯真实接口模式。

按 API Key 配置状态决定各功能是否可用：
  - API Key 已配置 → 直接调用 RealDifyService，失败时抛出异常
  - API Key 未配置 → 抛出 RuntimeError，提示配置对应 Key

不再有任何 Mock 降级行为，所有调用走真实 Dify API。
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
    DifyDatasetItem,
    DifyDocumentItem,
)
from app.services.dify.client import RealDifyService

logger = logging.getLogger(__name__)


def _key_ready(key: str) -> bool:
    """判断 API Key 是否已配置（非空且非占位符）"""
    return bool(key) and not key.startswith("app-xxx") and key != ""


# API Key 名称映射（用于生成友好的错误提示）
_KEY_NAMES = {
    "kb": ("DIFY_DATASET_API_KEY", "知识库"),
    "draft": ("DIFY_APP_DOC_DRAFT_KEY", "公文起草"),
    "check": ("DIFY_APP_DOC_CHECK_KEY", "公文审查"),
    "optimize": ("DIFY_APP_DOC_OPTIMIZE_KEY", "公文优化"),
    "chat": ("DIFY_APP_CHAT_KEY", "智能问答"),
    "entity": ("DIFY_APP_ENTITY_EXTRACT_KEY", "实体抽取"),
    "format": ("DIFY_APP_DOC_FORMAT_KEY", "智能排版"),
    "diagnose": ("DIFY_APP_DOC_DIAGNOSE_KEY", "格式诊断"),
    "punct_fix": ("DIFY_APP_PUNCT_FIX_KEY", "标点修复"),
}


def _require_key(feature: str, ready: bool):
    """断言 API Key 已配置，否则抛出明确的错误"""
    if not ready:
        env_var, label = _KEY_NAMES.get(feature, (feature, feature))
        raise RuntimeError(
            f"{label}功能的 API Key 未配置 ({env_var})，请在 .env 或 docker-compose 中设置"
        )


class HybridDifyService(DifyServiceBase):
    """
    真实接口模式 Dify 服务。

    自动检测每个 API Key 的配置状态：
      - 已配置 → 调用真实 Dify API
      - 未配置 → 直接报错，不降级到 Mock

    所有调用失败（网络、认证、参数等）均直接抛出异常。
    """

    def __init__(self):
        self._real = RealDifyService()

        # 检测各功能的 API Key 就绪状态
        self._kb_ready = _key_ready(settings.DIFY_DATASET_API_KEY)
        self._draft_ready = _key_ready(settings.DIFY_APP_DOC_DRAFT_KEY)
        self._check_ready = _key_ready(settings.DIFY_APP_DOC_CHECK_KEY)
        self._optimize_ready = _key_ready(settings.DIFY_APP_DOC_OPTIMIZE_KEY)
        self._chat_ready = _key_ready(settings.DIFY_APP_CHAT_KEY)
        self._entity_ready = _key_ready(settings.DIFY_APP_ENTITY_EXTRACT_KEY)
        self._format_ready = _key_ready(settings.DIFY_APP_DOC_FORMAT_KEY)
        self._diagnose_ready = _key_ready(settings.DIFY_APP_DOC_DIAGNOSE_KEY)
        self._punct_fix_ready = _key_ready(settings.DIFY_APP_PUNCT_FIX_KEY)

        status_parts = [
            f"KB={'✓' if self._kb_ready else '✗'}",
            f"Draft={'✓' if self._draft_ready else '✗'}",
            f"Check={'✓' if self._check_ready else '✗'}",
            f"Optimize={'✓' if self._optimize_ready else '✗'}",
            f"Chat={'✓' if self._chat_ready else '✗'}",
            f"Entity={'✓' if self._entity_ready else '✗'}",
            f"Format={'✓' if self._format_ready else '✗'}",
            f"Diagnose={'✓' if self._diagnose_ready else '✗'}",
            f"PunctFix={'✓' if self._punct_fix_ready else '✗'}",
        ]
        logger.info(f"HybridDifyService 初始化（真实接口模式）: {', '.join(status_parts)}")

    # ── Knowledge Base ──

    async def create_dataset(self, name: str) -> DatasetInfo:
        _require_key("kb", self._kb_ready)
        return await self._real.create_dataset(name)

    async def delete_dataset(self, dataset_id: str) -> None:
        _require_key("kb", self._kb_ready)
        return await self._real.delete_dataset(dataset_id)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        _require_key("kb", self._kb_ready)
        return await self._real.upload_document(dataset_id, file_name, file_content, file_type)

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        _require_key("kb", self._kb_ready)
        return await self._real.delete_document(dataset_id, document_id)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        _require_key("kb", self._kb_ready)
        return await self._real.get_indexing_status(dataset_id, batch_id)

    async def list_datasets(self) -> list[DifyDatasetItem]:
        _require_key("kb", self._kb_ready)
        return await self._real.list_datasets()

    async def list_dataset_documents(self, dataset_id: str) -> list[DifyDocumentItem]:
        _require_key("kb", self._kb_ready)
        return await self._real.list_dataset_documents(dataset_id)

    # ── Workflow ──

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        _require_key("draft", self._draft_ready)
        return await self._real.run_doc_draft(title, outline, doc_type, template_content, kb_texts)

    async def run_doc_draft_stream(self, title: str, outline: str, doc_type: str,
                                    template_content: str = "", kb_texts: str = "",
                                    user_instruction: str = "",
                                    file_bytes: bytes | None = None,
                                    file_name: str = "") -> AsyncGenerator[SSEEvent, None]:
        _require_key("draft", self._draft_ready)
        async for event in self._real.run_doc_draft_stream(
            title, outline, doc_type, template_content, kb_texts,
            user_instruction, file_bytes, file_name,
        ):
            yield event

    async def run_doc_check(self, content: str) -> ReviewResult:
        _require_key("check", self._check_ready)
        return await self._real.run_doc_check(content)

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        _require_key("optimize", self._optimize_ready)
        return await self._real.run_doc_optimize(content, kb_texts)

    async def run_doc_review_stream(
        self,
        content: str,
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        _require_key("optimize", self._optimize_ready)
        async for event in self._real.run_doc_review_stream(
            content, user_instruction, file_bytes=file_bytes, file_name=file_name,
        ):
            yield event

    # ── Chat ──

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
        _require_key("chat", self._chat_ready)
        async for event in self._real.chat_stream(
            query, user_id, conversation_id, dataset_ids,
            kb_context=kb_context, graph_context=graph_context,
            kb_top_score=kb_top_score,
        ):
            yield event

    # ── Entity Extraction ──

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        _require_key("entity", self._entity_ready)
        return await self._real.extract_entities(text)

    # ── Document Format (AI 排版 — 流式) ──

    async def run_doc_format_stream(
        self,
        content: str,
        doc_type: str = "official",
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        _require_key("format", self._format_ready)
        async for event in self._real.run_doc_format_stream(
            content, doc_type, user_instruction,
            file_bytes=file_bytes, file_name=file_name,
        ):
            yield event

    # ── Document Diagnose ──

    async def run_doc_diagnose_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        _require_key("diagnose", self._diagnose_ready)
        async for event in self._real.run_doc_diagnose_stream(content):
            yield event

    # ── Punctuation Fix ──

    async def run_punct_fix_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        _require_key("punct_fix", self._punct_fix_ready)
        async for event in self._real.run_punct_fix_stream(content):
            yield event
