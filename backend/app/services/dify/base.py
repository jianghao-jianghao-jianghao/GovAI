"""
Dify 服务抽象基类。
后端 A 只依赖此接口编程，不关心底层是 Mock 还是真实 Dify。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional
from uuid import UUID


# ── 数据结构 ──────────────────────────────────────────────


@dataclass
class WorkflowResult:
    """Workflow 执行结果（阻塞模式）"""
    output_text: str
    metadata: dict = field(default_factory=dict)


@dataclass
class ReviewItem:
    text: str
    suggestion: str
    context: str = ""


@dataclass
class ReviewResult:
    """公文检查结果"""
    typos: list[ReviewItem] = field(default_factory=list)
    grammar: list[ReviewItem] = field(default_factory=list)
    sensitive: list[ReviewItem] = field(default_factory=list)


@dataclass
class SSEEvent:
    """SSE 流事件"""
    event: str          # message_start / text_chunk / citations / reasoning / knowledge_graph / message_end / error
    data: dict = field(default_factory=dict)


@dataclass
class DatasetInfo:
    """Dify Dataset 信息"""
    dataset_id: str
    name: str = ""


@dataclass
class DocumentUploadResult:
    """Dify 文档上传结果"""
    document_id: str
    batch_id: str


@dataclass
class EntityTriple:
    """知识图谱三元组"""
    source: str
    target: str
    relation: str
    source_type: str = ""
    target_type: str = ""


# ── 抽象接口 ──────────────────────────────────────────────


class DifyServiceBase(ABC):
    """
    Dify 服务抽象基类。
    后端 A 通过此接口调用所有 Dify 功能。
    """

    # ── Knowledge Base (Dataset) ──

    @abstractmethod
    async def create_dataset(self, name: str) -> DatasetInfo:
        """创建 Dify 知识库，返回 dataset_id"""
        ...

    @abstractmethod
    async def delete_dataset(self, dataset_id: str) -> None:
        """删除 Dify 知识库"""
        ...

    @abstractmethod
    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        """上传文件到 Dify 知识库"""
        ...

    @abstractmethod
    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        """从 Dify 知识库删除文档"""
        ...

    @abstractmethod
    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        """查询文档索引状态，返回 'indexing' | 'completed' | 'error'"""
        ...

    # ── Workflow (公文处理) ──

    @abstractmethod
    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        """公文起草 Workflow"""
        ...

    @abstractmethod
    async def run_doc_check(self, content: str) -> ReviewResult:
        """公文检查 Workflow"""
        ...

    @abstractmethod
    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        """公文优化 Workflow"""
        ...

    # ── Chat (智能问答) ──

    @abstractmethod
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
        """
        流式聊天（后端检索版），yields SSEEvent。
        
        后端检索版：调用方已完成 KB + Graph 检索，将上下文通过参数传入。
        Dify 工作流仅负责 LLM 推理，不再做内部检索。
        
        参数:
          - kb_context:    后端检索到的知识库段落文本（含来源标注）
          - graph_context: 后端检索到的知识图谱关系文本
          - kb_top_score:  最高检索相关度分数
        """
        ...

    # ── Entity Extraction (知识图谱) ──

    @abstractmethod
    async def extract_entities(self, text: str) -> list[EntityTriple]:
        """从文本中抽取知识图谱三元组"""
        ...
