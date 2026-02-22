"""
Mock Dify 服务实现。
在 Dify 尚未搭建完成时使用，返回模拟数据，支持完整的开发和测试流程。
通过 DIFY_MOCK=true 环境变量启用。
"""

import asyncio
import uuid
from typing import AsyncGenerator, Optional

from app.services.dify.base import (
    DifyServiceBase,
    WorkflowResult,
    ReviewItem,
    ReviewResult,
    SSEEvent,
    DatasetInfo,
    DocumentUploadResult,
    EntityTriple,
    DifyDatasetItem,
    DifyDocumentItem,
)


class MockDifyService(DifyServiceBase):
    """
    Mock 实现 — 返回逼真的模拟数据。
    所有异步方法都加了短暂延迟以模拟网络IO。
    """

    # ── Knowledge Base ──

    async def create_dataset(self, name: str) -> DatasetInfo:
        await asyncio.sleep(0.1)
        return DatasetInfo(
            dataset_id=str(uuid.uuid4()),
            name=name,
        )

    async def delete_dataset(self, dataset_id: str) -> None:
        await asyncio.sleep(0.05)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        await asyncio.sleep(0.2)
        return DocumentUploadResult(
            document_id=str(uuid.uuid4()),
            batch_id=str(uuid.uuid4()),
        )

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        await asyncio.sleep(0.05)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        await asyncio.sleep(0.1)
        # Mock 直接返回完成
        return "completed"

    async def list_datasets(self) -> list[DifyDatasetItem]:
        await asyncio.sleep(0.05)
        return []

    async def list_dataset_documents(self, dataset_id: str) -> list[DifyDocumentItem]:
        await asyncio.sleep(0.05)
        return []

    # ── Workflow (公文处理) ──

    async def run_doc_draft(self, title: str, outline: str, doc_type: str,
                            template_content: str = "", kb_texts: str = "") -> WorkflowResult:
        await asyncio.sleep(0.5)

        content = f"""关于{title}的{_doc_type_label(doc_type)}

各相关单位：

为深入贯彻落实党中央、国务院关于数字政府建设的决策部署，根据《国务院关于加强数字政府建设的指导意见》，结合工作实际，现就{title}有关事项通知如下：

一、总体要求

坚持以习近平新时代中国特色社会主义思想为指导，深入贯彻党的二十大精神，以推进国家治理体系和治理能力现代化为目标，加快推进{title}相关工作。

二、主要任务

（一）加强组织领导。各单位要高度重视，成立专项工作领导小组，明确责任分工，确保各项任务落到实处。

（二）完善制度机制。建立健全相关制度体系，细化工作流程和操作规范，为工作开展提供制度保障。

（三）强化技术支撑。充分运用大数据、人工智能等新技术手段，提升工作效率和服务水平。

三、工作要求

各单位要按照本通知要求，结合实际制定具体实施方案，确保各项工作任务按时完成。

[Mock 模式生成 — Dify 就绪后将返回真实AI内容]"""

        return WorkflowResult(output_text=content, metadata={"mock": True})

    async def run_doc_check(self, content: str) -> ReviewResult:
        await asyncio.sleep(0.3)

        # 模拟审查结果
        result = ReviewResult()

        # 检查是否有常见错字模拟
        if "的" in content and len(content) > 100:
            result.typos.append(ReviewItem(
                text="[Mock] 未发现明显错别字",
                suggestion="文档拼写检查通过",
                context="全文扫描完毕",
            ))

        result.grammar.append(ReviewItem(
            text="[Mock] 语法检查已完成",
            suggestion="建议复查长句是否通顺",
            context="全文语法分析",
        ))

        result.sensitive.append(ReviewItem(
            text="[Mock] 敏感词检查已完成",
            suggestion="未发现违规内容",
            context="全文敏感词扫描",
        ))

        return result

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        await asyncio.sleep(0.5)

        optimized = content
        # 模拟优化：在文末加优化说明
        optimized += "\n\n---\n[Mock 优化说明] 已对文档进行以下优化：\n"
        optimized += "1. 调整段落结构，使逻辑更加清晰\n"
        optimized += "2. 规范公文用语，符合《党政机关公文格式》标准\n"
        optimized += "3. 补充政策引用依据\n"
        optimized += "[Mock 模式 — Dify 就绪后将返回真实AI优化内容]"

        return WorkflowResult(output_text=optimized, metadata={"mock": True})

    # ── Chat (智能问答) ──

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
        message_id = str(uuid.uuid4())
        new_conversation_id = conversation_id or str(uuid.uuid4())

        # 1. message_start
        yield SSEEvent(
            event="message_start",
            data={"message_id": message_id, "conversation_id": new_conversation_id},
        )
        await asyncio.sleep(0.1)

        # 2. 模拟逐段输出
        chunks = _generate_mock_answer(query)
        for chunk in chunks:
            yield SSEEvent(event="text_chunk", data={"text": chunk})
            await asyncio.sleep(0.08)

        # 3. citations
        yield SSEEvent(
            event="citations",
            data={
                "citations": [
                    {
                        "title": "数据安全法.pdf",
                        "type": "kb",
                        "page": 12,
                        "quote": "国家建立数据分类分级保护制度，对数据实行分类分级保护。",
                    },
                    {
                        "title": "一网通办常见问题",
                        "type": "qa",
                        "page": None,
                        "quote": "[Mock] QA 库标准答案引用",
                    },
                ]
            },
        )

        # 4. reasoning
        yield SSEEvent(
            event="reasoning",
            data={
                "reasoning": (
                    "1. 意图识别：用户询问政策相关问题\n"
                    "2. 检索策略：从知识库中检索相关法规文档\n"
                    "3. 答案生成：基于检索结果综合生成回答\n"
                    "[Mock 模式 — 推理过程模拟数据]"
                )
            },
        )

        # 5. knowledge_graph
        yield SSEEvent(
            event="knowledge_graph",
            data={
                "triples": [
                    {"source": "数据安全", "target": "分类分级", "relation": "包含"},
                    {"source": "数字政府", "target": "一网通办", "relation": "推进"},
                ]
            },
        )

        # 6. message_end
        yield SSEEvent(
            event="message_end",
            data={
                "message_id": message_id,
                "conversation_id": new_conversation_id,
                "token_count": len("".join(chunks)) * 2,
            },
        )

    # ── Entity Extraction ──

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        await asyncio.sleep(0.3)
        # 基于文本内容生成更相关的 Mock 实体
        triples = []

        # 从文本中提取关键词来构造模拟三元组
        keywords_map = {
            "数据安全": ("数据安全法", "法规", "数据分类分级", "制度", "规定"),
            "电子政务": ("电子政务", "概念", "政务服务", "服务", "推进"),
            "人工智能": ("人工智能", "技术", "政务服务", "服务", "赋能"),
            "数字政府": ("数字政府", "概念", "一网通办", "服务", "推进"),
            "个人信息": ("个人信息保护法", "法规", "个人信息", "概念", "保护"),
            "网络安全": ("网络安全法", "法规", "网络安全", "概念", "规范"),
            "国务院": ("国务院", "机构", "政策文件", "公文", "发布"),
            "建设方案": ("建设方案", "公文", "工作目标", "概念", "包含"),
        }

        matched = False
        for keyword, (src, st, tgt, tt, rel) in keywords_map.items():
            if keyword in text:
                triples.append(EntityTriple(
                    source=src, target=tgt, relation=rel,
                    source_type=st, target_type=tt,
                ))
                matched = True

        if not matched or len(triples) < 2:
            # 回退到固定 mock 数据
            triples.extend([
                EntityTriple(
                    source="数字政府", target="一网通办", relation="推进",
                    source_type="概念", target_type="服务",
                ),
                EntityTriple(
                    source="数据安全法", target="数据分类分级", relation="规定",
                    source_type="法规", target_type="制度",
                ),
                EntityTriple(
                    source="人工智能", target="政务服务", relation="赋能",
                    source_type="技术", target_type="服务",
                ),
            ])

        return triples


# ── 辅助函数 ──


def _doc_type_label(doc_type: str) -> str:
    mapping = {
        "request": "请示",
        "report": "报告",
        "notice": "通知",
        "briefing": "简报",
        "ai_generated": "文稿",
    }
    return mapping.get(doc_type, "通知")


def _generate_mock_answer(query: str) -> list[str]:
    """根据用户问题生成模拟分段回答"""
    return [
        f"关于您提出的「{query[:20]}」问题，",
        "根据相关政策法规和知识库文档，",
        "现回答如下：\n\n",
        "**一、政策依据**\n\n",
        "根据《国务院关于加强数字政府建设的指导意见》",
        "以及《数据安全法》相关规定，",
        "各级政府部门应当依法依规开展相关工作。\n\n",
        "**二、具体说明**\n\n",
        "在实际操作中，需要注意以下几点：\n",
        "1. 严格遵守数据分类分级保护制度\n",
        "2. 建立健全安全管理责任体系\n",
        "3. 加强技术防护和监测预警能力\n\n",
        "**三、建议**\n\n",
        "建议结合本单位实际情况，制定具体实施方案，",
        "确保各项要求落到实处。\n\n",
        "_[Mock 模式 — Dify 就绪后将返回真实AI回答]_",
    ]
