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
class StructuredParagraph:
    """结构化段落 — 带样式类型和富格式属性的段落数据"""
    text: str
    style_type: str  # title / heading1-4 / body / recipient / signature / date / attachment / closing
    # ── 以下为可选的富格式属性（排版阶段 LLM 输出） ──
    font_size: Optional[str] = None      # 字号，如 "二号" "三号" "16pt"
    font_family: Optional[str] = None    # 字体，如 "方正小标宋简体" "仿宋_GB2312" "黑体"
    bold: Optional[bool] = None          # 是否加粗
    italic: Optional[bool] = None        # 是否斜体
    color: Optional[str] = None          # 文字颜色，6 位十六进制，如 "#000000" "#CC0000"
    indent: Optional[str] = None         # 首行缩进，如 "2em" "0"
    alignment: Optional[str] = None      # 对齐方式，如 "center" "left" "right" "justify"
    line_height: Optional[str] = None    # 行距，如 "28pt" "2"
    red_line: Optional[bool] = None      # 标题下红色分隔线
    _index: Optional[int] = None         # 增量模式下段落在原数组中的位置索引


@dataclass
class WorkflowResult:
    """Workflow 执行结果（阻塞模式）"""
    output_text: str
    metadata: dict = field(default_factory=dict)
    paragraphs: list[StructuredParagraph] = field(default_factory=list)


@dataclass
class ReviewItem:
    text: str
    suggestion: str
    context: str = ""


@dataclass
class ReviewResult:
    """公文检查结果（旧版，保留兼容）"""
    typos: list[ReviewItem] = field(default_factory=list)
    grammar: list[ReviewItem] = field(default_factory=list)
    sensitive: list[ReviewItem] = field(default_factory=list)


@dataclass
class ReviewSuggestion:
    """审查优化建议（合并版）"""
    category: str       # typo | punctuation | grammar | wording | sensitive | structure
    severity: str        # error | warning | info
    original: str        # 原文文本片段
    suggestion: str      # 建议修改为
    reason: str          # 修改理由
    context: str = ""    # 包含问题的上下文


@dataclass
class ReviewResponse:
    """审查优化完整响应"""
    suggestions: list[ReviewSuggestion] = field(default_factory=list)
    summary: str = ""


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


@dataclass
class DifyDatasetItem:
    """Dify Dataset 简要信息（用于同步比对）"""
    dataset_id: str
    name: str
    document_count: int = 0


@dataclass
class DifyDocumentItem:
    """Dify Document 简要信息（用于同步比对）"""
    document_id: str
    name: str
    indexing_status: str = ""  # completed / indexing / error





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

    @abstractmethod
    async def list_datasets(self) -> list["DifyDatasetItem"]:
        """列出 Dify 上所有知识库（Dataset），用于同步比对"""
        ...

    @abstractmethod
    async def list_dataset_documents(self, dataset_id: str) -> list["DifyDocumentItem"]:
        """列出某个 Dify Dataset 下所有文档，用于同步比对"""
        ...

    # ── Workflow (公文处理) ──

    @abstractmethod
    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        """公文起草 Workflow（阻塞模式）"""
        ...

    @abstractmethod
    async def run_doc_draft_stream(self, title: str, outline: str, doc_type: str,
                                    template_content: str = "", kb_texts: str = "",
                                    user_instruction: str = "",
                                    file_bytes: bytes | None = None,
                                    file_name: str = "") -> "AsyncGenerator[SSEEvent, None]":
        """公文起草 Workflow（流式模式） — 逐段 yield SSEEvent，支持多模态文件直传"""
        ...

    @abstractmethod
    async def run_doc_check(self, content: str) -> ReviewResult:
        """公文检查 Workflow"""
        ...

    @abstractmethod
    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        """公文优化 Workflow（旧版，保留兼容）"""
        ...

    @abstractmethod
    async def run_doc_review_stream(
        self,
        content: str,
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> "AsyncGenerator[SSEEvent, None]":
        """
        公文审查与优化（合并版，流式）— 支持文件上传 + 文档提取器。

        流式调用 Dify Chatflow，逐条推送建议 + 最终汇总。

        Yields:
          SSEEvent(event="progress",          data={"message": "..."})
          SSEEvent(event="review_suggestion",  data={"index": 0, "category": ..., ...})
          SSEEvent(event="review_result",      data={"suggestions": [...], "summary": "..."})
          SSEEvent(event="error",             data={"message": "..."})
        """
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

    # ── Document Format (AI 排版 — 流式 Markdown) ──

    @abstractmethod
    async def run_doc_format_stream(
        self,
        content: str,
        doc_type: str = "official",
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        AI 智能排版（流式） — 支持文件上传 + 文档提取器，将文档转化为结构化段落 JSON。

        以 SSE 流式方式返回结构化段落。用户通过自然语言描述排版需求，
        可以粗略（如"这是一份通知，按公文标准排版"）或精细（如"标题二号方正小标宋红色"），
        也可以粗细结合。

        参数:
          - content:          文档纯文本内容（兜底，当无文件时使用）
          - doc_type:         目标文档类型（official/academic/legal）
          - user_instruction: 用户自然语言排版指令
          - file_bytes:       待排版文件原始字节（上传到 Dify 文档提取器）
          - file_name:        文件名（含后缀）
        Yields:
          SSEEvent(event="structured_paragraph", data={"text": "...", "style_type": "...", "color": "...", ...})
          SSEEvent(event="text_chunk", data={"text": "..."})    — 降级纯文本
          SSEEvent(event="message_end", data={})                — 结束
        """
        ...

    # ── Document Diagnose (AI 格式诊断 — 流式 Markdown) ──

    @abstractmethod
    async def run_doc_diagnose_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        """
        AI 格式诊断（流式） — 分析文档格式问题，输出诊断报告。

        以 SSE 流式方式返回 Markdown 格式的诊断报告。

        参数:
          - content: 文档纯文本内容
        Yields:
          SSEEvent(event="text_chunk", data={"text": "..."})  — 增量文本
          SSEEvent(event="message_end", data={})               — 结束
        """
        ...

    # ── Punctuation Fix (AI 标点修复 — 流式 Markdown) ──

    @abstractmethod
    async def run_punct_fix_stream(self, content: str) -> AsyncGenerator[SSEEvent, None]:
        """
        AI 标点修复（流式） — 修正标点符号问题，输出修正后的文本。

        以 SSE 流式方式返回修正后的 Markdown 文本。

        参数:
          - content: 文档纯文本内容
        Yields:
          SSEEvent(event="text_chunk", data={"text": "..."})  — 增量文本
          SSEEvent(event="message_end", data={})               — 结束
        """
        ...
