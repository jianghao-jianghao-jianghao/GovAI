"""
Dify 真实服务实现。
当 DIFY_MOCK=full 时使用，全部走真实 Dify API。

已实现的功能：
- 知识库管理：create_dataset, delete_dataset, upload_document, delete_document, get_indexing_status
- Workflow：run_doc_draft, run_doc_check, run_doc_optimize
- Chat：chat_stream (SSE 流式)
- 实体抽取：extract_entities
"""

import asyncio
import json
import logging
from typing import AsyncGenerator, Optional

import httpx

from app.core.config import settings
from app.services.dify.base import (
    DifyServiceBase,
    WorkflowResult,
    ReviewItem,
    ReviewResult,
    SSEEvent,
    DatasetInfo,
    DocumentUploadResult,
    EntityTriple,
)

logger = logging.getLogger(__name__)


class RealDifyService(DifyServiceBase):
    """
    真实 Dify API 客户端。
    通过 HTTP 调用 Dify 平台的 Dataset / Workflow / Chat API。
    """

    # ── 重试配置 ──
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0  # 秒（指数退避基数）

    def __init__(self):
        self.base_url = settings.DIFY_BASE_URL
        self.dataset_api_key = settings.DIFY_DATASET_API_KEY
        self.doc_draft_key = settings.DIFY_APP_DOC_DRAFT_KEY
        self.doc_check_key = settings.DIFY_APP_DOC_CHECK_KEY
        self.doc_optimize_key = settings.DIFY_APP_DOC_OPTIMIZE_KEY
        self.qa_chat_key = settings.DIFY_APP_CHAT_KEY
        self.entity_extract_key = settings.DIFY_APP_ENTITY_EXTRACT_KEY
        self.timeout = httpx.Timeout(timeout=120.0, connect=10.0)

    # ══════════════════════════════════════════════════════════
    # 通用请求方法（带重试、错误处理）
    # ══════════════════════════════════════════════════════════

    async def _request(
        self,
        method: str,
        url: str,
        *,
        api_key: str,
        json_body: Optional[dict] = None,
        files: Optional[dict] = None,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> httpx.Response:
        """带重试的 HTTP 请求"""
        headers = {"Authorization": f"Bearer {api_key}"}
        if json_body is not None and files is None:
            headers["Content-Type"] = "application/json"

        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.request(
                        method, url, headers=headers,
                        json=json_body, files=files, data=data, params=params,
                    )

                if resp.status_code < 400:
                    return resp

                # 429 频率限制 → 退避重试
                if resp.status_code == 429 and attempt < self.MAX_RETRIES - 1:
                    retry_after = int(resp.headers.get("Retry-After", 30))
                    logger.warning(f"Dify rate limited, retry after {retry_after}s")
                    await asyncio.sleep(retry_after)
                    continue

                # 5xx 服务器错误 → 退避重试
                if resp.status_code >= 500 and attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAY * (2 ** attempt)
                    logger.warning(f"Dify server error {resp.status_code}, retrying in {delay}s")
                    await asyncio.sleep(delay)
                    continue

                # 其余错误直接抛出
                self._raise_for_status(resp)

            except httpx.TimeoutException:
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.RETRY_DELAY * (2 ** attempt))
                    continue
                raise Exception(f"Dify 请求超时 (url={url})")
            except httpx.RequestError as e:
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.RETRY_DELAY * (2 ** attempt))
                    continue
                raise Exception(f"Dify 连接失败: {e}")

        raise Exception("Dify 请求重试次数超限")

    @staticmethod
    def _raise_for_status(resp: httpx.Response):
        """解析 Dify 错误并抛出异常"""
        try:
            body = resp.json()
            message = body.get("message", resp.text)
        except Exception:
            message = resp.text
        raise Exception(f"Dify API 错误 ({resp.status_code}): {message}")

    async def _run_workflow_blocking(
        self,
        *,
        api_key: str,
        inputs: dict,
        user: str = "govai-system",
    ) -> dict:
        """
        执行 Dify Workflow（blocking 模式），返回 outputs dict。
        适用于：公文起草/审查/优化/实体抽取。
        """
        url = f"{self.base_url}/workflows/run"
        body = {
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        resp = await self._request("POST", url, api_key=api_key, json_body=body)
        result = resp.json()
        # Dify blocking 返回结构: {"data": {"outputs": {...}, "status": "succeeded", ...}}
        data = result.get("data", {})
        if data.get("status") != "succeeded":
            error_msg = data.get("error", "Workflow 执行失败")
            raise Exception(f"Dify Workflow 失败: {error_msg}")
        return data.get("outputs", {})

    # ══════════════════════════════════════════════════════════
    # Knowledge Base (Dataset) — 知识库管理
    # ══════════════════════════════════════════════════════════

    async def create_dataset(self, name: str) -> DatasetInfo:
        url = f"{self.base_url}/datasets"
        payload = {
            "name": name,
            "description": "",
            "permission": "only_me",
            "indexing_technique": "high_quality",
        }
        resp = await self._request("POST", url, api_key=self.dataset_api_key, json_body=payload)
        result = resp.json()
        return DatasetInfo(dataset_id=result.get("id", ""), name=result.get("name", name))

    async def delete_dataset(self, dataset_id: str) -> None:
        url = f"{self.base_url}/datasets/{dataset_id}"
        await self._request("DELETE", url, api_key=self.dataset_api_key)

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        url = f"{self.base_url}/datasets/{dataset_id}/document/create-by-file"
        files = {"file": (file_name, file_content, file_type)}
        data = {
            "data": json.dumps({
                "indexing_technique": "high_quality",
                "process_rule": {"mode": "automatic"},
            })
        }
        resp = await self._request("POST", url, api_key=self.dataset_api_key, files=files, data=data)
        result = resp.json()
        document = result.get("document", {})
        return DocumentUploadResult(
            document_id=document.get("id", ""),
            batch_id=result.get("batch", ""),
        )

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{document_id}"
        await self._request("DELETE", url, api_key=self.dataset_api_key)

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{batch_id}/indexing-status"
        resp = await self._request("GET", url, api_key=self.dataset_api_key)
        result = resp.json()
        data_list = result.get("data", [])
        if data_list:
            return data_list[0].get("indexing_status", "error")
        return "error"

    # ══════════════════════════════════════════════════════════
    # Workflow — 公文起草 / 审查 / 优化
    # ══════════════════════════════════════════════════════════

    async def run_doc_draft(
        self,
        title: str,
        outline: str,
        doc_type: str,
        template_content: str = "",
        kb_texts: str = "",
    ) -> WorkflowResult:
        """
        公文起草 Workflow。

        Dify 输入变量:
          - template_content: 公文模板文本
          - user_requirement: 用户起草要求
          - reference_materials: 参考素材
        Dify 输出变量:
          - generated_text: 生成的公文全文
        """
        inputs = {
            "template_content": template_content or "",
            "user_requirement": f"标题: {title}\n类型: {doc_type}\n大纲: {outline}",
            "reference_materials": kb_texts or "",
        }
        outputs = await self._run_workflow_blocking(
            api_key=self.doc_draft_key,
            inputs=inputs,
        )
        generated_text = outputs.get("generated_text", "") or outputs.get("text", "")
        return WorkflowResult(
            output_text=generated_text,
            metadata={"tokens_used": outputs.get("tokens_used", 0)},
        )

    async def run_doc_check(self, content: str) -> ReviewResult:
        """
        公文审查 Workflow。

        Dify 输入变量:
          - content: 待审查的公文全文
        Dify 输出变量:
          - typos: [{position, original, suggestion, reason}]
          - grammar_issues: [{position, text, suggestion, severity}]
          - sensitive_words: [{word, position, suggestion}]
          - overall_score: int
          - summary: str
        """
        inputs = {"content": content}
        outputs = await self._run_workflow_blocking(
            api_key=self.doc_check_key,
            inputs=inputs,
        )

        result = ReviewResult()

        # 解析 typos
        raw_typos = outputs.get("typos", [])
        if isinstance(raw_typos, str):
            try:
                raw_typos = json.loads(raw_typos)
            except json.JSONDecodeError:
                raw_typos = []
        for item in raw_typos:
            result.typos.append(ReviewItem(
                text=item.get("original", item.get("text", "")),
                suggestion=item.get("suggestion", ""),
                context=item.get("position", item.get("reason", "")),
            ))

        # 解析 grammar
        raw_grammar = outputs.get("grammar_issues", [])
        if isinstance(raw_grammar, str):
            try:
                raw_grammar = json.loads(raw_grammar)
            except json.JSONDecodeError:
                raw_grammar = []
        for item in raw_grammar:
            result.grammar.append(ReviewItem(
                text=item.get("text", ""),
                suggestion=item.get("suggestion", ""),
                context=item.get("position", ""),
            ))

        # 解析 sensitive
        raw_sensitive = outputs.get("sensitive_words", [])
        if isinstance(raw_sensitive, str):
            try:
                raw_sensitive = json.loads(raw_sensitive)
            except json.JSONDecodeError:
                raw_sensitive = []
        for item in raw_sensitive:
            result.sensitive.append(ReviewItem(
                text=item.get("word", item.get("text", "")),
                suggestion=item.get("suggestion", ""),
                context=item.get("position", ""),
            ))

        return result

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        """
        公文优化 Workflow。

        Dify 输入变量:
          - content: 待优化的公文全文
          - optimization_focus: 优化重点
        Dify 输出变量:
          - optimized_text: 优化后的公文全文
        """
        inputs = {
            "content": content,
            "optimization_focus": "语言规范性",
        }
        outputs = await self._run_workflow_blocking(
            api_key=self.doc_optimize_key,
            inputs=inputs,
        )
        optimized_text = outputs.get("optimized_text", "") or outputs.get("text", "")
        return WorkflowResult(
            output_text=optimized_text,
            metadata={"tokens_used": outputs.get("tokens_used", 0)},
        )

    # ══════════════════════════════════════════════════════════
    # Chat — 智能问答 (工作流编排对话型应用 SSE 流式)
    # ══════════════════════════════════════════════════════════

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: Optional[str] = None,
        dataset_ids: Optional[list[str]] = None,
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 工作流编排对话型应用 (Chatflow) 的 SSE 流式接口。

        Dify POST /chat-messages, response_mode=streaming
        Dify 工作流 Chatflow SSE 事件:
          - workflow_started:  工作流开始
          - node_started:      节点开始执行
          - node_finished:     节点执行完成
          - message:           answer 增量文本 (LLM 节点流式输出)
          - message_end:       消息结束，附带 metadata / retriever_resources / usage
          - workflow_finished: 工作流结束
          - tts_message:       TTS 语音片段
          - tts_message_end:   TTS 结束
          - message_replace:   内容审查替换
          - error:             异常
          - ping:              心跳
        """
        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.qa_chat_key}"}
        body: dict = {
            "inputs": {},
            "query": query,
            "response_mode": "streaming",
            "user": user_id,
        }
        if conversation_id:
            body["conversation_id"] = conversation_id

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=body) as resp:
                    if resp.status_code >= 400:
                        error_body = ""
                        async for chunk in resp.aiter_text():
                            error_body += chunk
                        raise Exception(f"Dify Chat API 错误 ({resp.status_code}): {error_body}")

                    message_start_sent = False
                    workflow_data = {}  # 收集 workflow 级别的元数据

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        if not line.startswith("data:"):
                            continue

                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            event_data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event_data.get("event", "")

                        if event_type == "message":
                            # Dify Chatflow: 增量文本在 answer 字段
                            yield SSEEvent(
                                event="text_chunk",
                                data={"text": event_data.get("answer", "")},
                            )
                            # 首次获取 conversation_id 时发送 message_start（仅一次）
                            if not message_start_sent:
                                conv_id = event_data.get("conversation_id")
                                msg_id = event_data.get("message_id")
                                if conv_id and msg_id:
                                    yield SSEEvent(
                                        event="message_start",
                                        data={
                                            "message_id": msg_id,
                                            "conversation_id": conv_id,
                                        },
                                    )
                                    message_start_sent = True

                        elif event_type == "message_end":
                            # 消息结束：提取检索引用 + 用量统计
                            metadata = event_data.get("metadata", {})
                            retriever_resources = metadata.get("retriever_resources", [])
                            usage = metadata.get("usage", {})
                            token_count = usage.get("total_tokens", 0)

                            # 构建 citations 事件
                            if retriever_resources:
                                citations = []
                                for res in retriever_resources:
                                    citations.append({
                                        "title": res.get("document_name", ""),
                                        "type": "kb",
                                        "page": res.get("position"),
                                        "quote": res.get("content", "")[:200],
                                        "score": res.get("score"),
                                        "dataset_name": res.get("dataset_name", ""),
                                    })
                                yield SSEEvent(event="citations", data={"citations": citations})

                            yield SSEEvent(
                                event="message_end",
                                data={
                                    "message_id": event_data.get("message_id", ""),
                                    "conversation_id": event_data.get("conversation_id", ""),
                                    "token_count": token_count,
                                    "usage": usage,
                                },
                            )

                        elif event_type == "workflow_started":
                            # 工作流开始执行
                            workflow_data["workflow_run_id"] = event_data.get("workflow_run_id", "")
                            workflow_data["task_id"] = event_data.get("task_id", "")
                            yield SSEEvent(
                                event="workflow_started",
                                data={
                                    "workflow_run_id": event_data.get("workflow_run_id", ""),
                                    "task_id": event_data.get("task_id", ""),
                                },
                            )

                        elif event_type == "node_started":
                            # 节点开始（可用于前端展示推理过程）
                            node_data = event_data.get("data", {})
                            yield SSEEvent(
                                event="node_started",
                                data={
                                    "node_id": node_data.get("node_id", ""),
                                    "node_type": node_data.get("node_type", ""),
                                    "title": node_data.get("title", ""),
                                },
                            )

                        elif event_type == "node_finished":
                            # 节点完成（含输出，可抽取 reasoning / knowledge_graph）
                            node_data = event_data.get("data", {})
                            node_type = node_data.get("node_type", "")
                            outputs = node_data.get("outputs", {}) or {}

                            # 如果节点输出含 reasoning，发送推理事件
                            reasoning_text = outputs.get("reasoning") or outputs.get("thought") or ""
                            if reasoning_text:
                                yield SSEEvent(
                                    event="reasoning",
                                    data={"text": reasoning_text},
                                )

                            # 如果节点输出含知识图谱数据，发送知识图谱事件
                            kg_data = outputs.get("knowledge_graph") or outputs.get("entities")
                            if kg_data:
                                yield SSEEvent(
                                    event="knowledge_graph",
                                    data={"triples": kg_data if isinstance(kg_data, list) else []},
                                )

                            # 透传 node_finished 事件（前端可用于构建推理链）
                            yield SSEEvent(
                                event="node_finished",
                                data={
                                    "node_id": node_data.get("node_id", ""),
                                    "node_type": node_type,
                                    "title": node_data.get("title", ""),
                                    "status": node_data.get("status", ""),
                                    "elapsed_time": node_data.get("elapsed_time", 0),
                                },
                            )

                        elif event_type == "workflow_finished":
                            # 工作流完成
                            wf_data = event_data.get("data", {})
                            yield SSEEvent(
                                event="workflow_finished",
                                data={
                                    "workflow_run_id": wf_data.get("id", ""),
                                    "status": wf_data.get("status", ""),
                                    "total_tokens": wf_data.get("total_tokens", 0),
                                    "elapsed_time": wf_data.get("elapsed_time", 0),
                                },
                            )

                        elif event_type == "message_replace":
                            # 内容审查替换
                            yield SSEEvent(
                                event="message_replace",
                                data={"text": event_data.get("answer", "")},
                            )

                        elif event_type == "error":
                            yield SSEEvent(
                                event="error",
                                data={
                                    "code": event_data.get("code", ""),
                                    "message": event_data.get("message", "未知错误"),
                                },
                            )

                        elif event_type in ("ping", "tts_message", "tts_message_end"):
                            continue  # 心跳/TTS 事件忽略

        except Exception as e:
            logger.error(f"Dify Chat SSE 异常: {e}")
            yield SSEEvent(event="error", data={"code": "stream_error", "message": str(e)})

    # ══════════════════════════════════════════════════════════
    # Entity Extraction — 知识图谱实体抽取
    # ══════════════════════════════════════════════════════════

    async def extract_entities(self, text: str) -> list[EntityTriple]:
        """
        调用 Dify 实体抽取 Workflow。

        Dify 输入变量:
          - text: 待抽取的文本
          - source_doc_id: 来源文档ID（可选）
        Dify 输出变量:
          - entities: [{name, type, description}]
          - relationships: [{source, relation, target, weight}]
        """
        inputs = {
            "text": text,
            "source_doc_id": "",
        }
        outputs = await self._run_workflow_blocking(
            api_key=self.entity_extract_key,
            inputs=inputs,
        )

        triples: list[EntityTriple] = []

        # 解析 relationships
        raw_rels = outputs.get("relationships", [])
        if isinstance(raw_rels, str):
            try:
                raw_rels = json.loads(raw_rels)
            except json.JSONDecodeError:
                raw_rels = []

        # 构建实体类型映射
        raw_entities = outputs.get("entities", [])
        if isinstance(raw_entities, str):
            try:
                raw_entities = json.loads(raw_entities)
            except json.JSONDecodeError:
                raw_entities = []

        entity_type_map = {}
        for ent in raw_entities:
            entity_type_map[ent.get("name", "")] = ent.get("type", "未知")

        for rel in raw_rels:
            source_name = rel.get("source", "")
            target_name = rel.get("target", "")
            triples.append(EntityTriple(
                source=source_name,
                target=target_name,
                relation=rel.get("relation", "相关"),
                source_type=entity_type_map.get(source_name, "未知"),
                target_type=entity_type_map.get(target_name, "未知"),
            ))

        return triples
