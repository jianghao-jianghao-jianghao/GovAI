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
        # 连接超时 5 秒（HybridService 会 fallback，无需等太久）
        # 读取超时 120 秒（Workflow 响应可能较慢）
        self.timeout = httpx.Timeout(timeout=120.0, connect=5.0)

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
                # 超时（特别是 ReadTimeout）通常是 LLM 推理耗时过长
                # 重试没有意义，直接抛出让 Hybrid 降级到 Mock
                raise Exception(f"Dify 请求超时 (url={url})")
            except httpx.ConnectError as e:
                # 连接失败（Dify 不可达）→ 不重试，直接抛出让 Hybrid 降级
                raise Exception(f"Dify 连接失败: {e}")
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

    async def _run_chatflow_blocking(
        self,
        *,
        api_key: str,
        query: str,
        inputs: dict,
        user: str = "govai-system",
    ) -> dict:
        """
        执行 Dify Chatflow（对话型工作流）blocking 模式。
        适用于：公文起草/审查/优化/实体抽取（Chatflow 应用）。
        
        Chatflow 返回格式:
        {
            "event": "message",
            "message_id": "...",
            "conversation_id": "...",
            "answer": "生成的文本内容",
            "metadata": {...}
        }
        """
        url = f"{self.base_url}/chat-messages"
        body = {
            "query": query,
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        
        resp = await self._request("POST", url, api_key=api_key, json_body=body)
        result = resp.json()
        
        # Chatflow blocking 返回格式: {"answer": "...", "conversation_id": "...", "metadata": {...}}
        if "answer" not in result:
            raise Exception(f"Chatflow 返回格式异常: {result}")
        
        return {
            "text": result.get("answer", ""),
            "conversation_id": result.get("conversation_id", ""),
            "message_id": result.get("message_id", ""),
            "metadata": result.get("metadata", {}),
        }

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
        公文起草 Chatflow。

        Chatflow 输入:
          - query: 用户的起草要求（必需）
          - inputs: 额外的输入变量
            - template_content: 公文模板文本
            - reference_materials: 参考素材
        Chatflow 输出:
          - answer: 生成的公文全文
        """
        # 构建 query（Chatflow 必需参数）
        query = f"请帮我起草一份{doc_type}，标题是：{title}\n\n大纲：\n{outline}"
        
        # 构建 inputs（可选的额外输入）
        inputs = {}
        if template_content:
            inputs["template_content"] = template_content
        if kb_texts:
            inputs["reference_materials"] = kb_texts
        
        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_draft_key,
            query=query,
            inputs=inputs,
        )
        
        return WorkflowResult(
            output_text=outputs.get("text", ""),
            metadata=outputs.get("metadata", {}),
        )

    async def run_doc_check(self, content: str) -> ReviewResult:
        """
        公文审查 Chatflow。

        Chatflow 输入:
          - query: 待审查的公文内容
          - inputs: 空（或根据 Chatflow 设计传入额外参数）
        Chatflow 输出:
          - answer: 审查结果（JSON 格式字符串或纯文本）
        
        注意：Chatflow 的输出格式取决于你在 Dify 中的设计。
        如果 Chatflow 返回 JSON，需要解析；如果返回纯文本，需要适配。
        """
        query = f"请审查以下公文，检查错别字、语法问题和敏感词：\n\n{content}"
        
        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_check_key,
            query=query,
            inputs={},
        )
        
        result = ReviewResult()
        answer_text = outputs.get("text", "")
        
        # 尝试解析 JSON 格式的审查结果
        try:
            review_data = json.loads(answer_text)
            
            # 解析 typos
            raw_typos = review_data.get("typos", [])
            if isinstance(raw_typos, str):
                raw_typos = json.loads(raw_typos)
            for item in raw_typos:
                result.typos.append(ReviewItem(
                    text=item.get("original", item.get("text", "")),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", item.get("reason", "")),
                ))
            
            # 解析 grammar
            raw_grammar = review_data.get("grammar_issues", [])
            if isinstance(raw_grammar, str):
                raw_grammar = json.loads(raw_grammar)
            for item in raw_grammar:
                result.grammar.append(ReviewItem(
                    text=item.get("text", ""),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", ""),
                ))
            
            # 解析 sensitive
            raw_sensitive = review_data.get("sensitive_words", [])
            if isinstance(raw_sensitive, str):
                raw_sensitive = json.loads(raw_sensitive)
            for item in raw_sensitive:
                result.sensitive.append(ReviewItem(
                    text=item.get("word", item.get("text", "")),
                    suggestion=item.get("suggestion", ""),
                    context=item.get("position", ""),
                ))
        except json.JSONDecodeError:
            # 如果不是 JSON 格式，将整个文本作为审查结果
            logger.warning(f"公文审查返回非 JSON 格式: {answer_text[:100]}")
            # 可以在这里添加文本解析逻辑，或者返回空结果
            pass
        
        return result

    async def run_doc_optimize(self, content: str, kb_texts: str = "") -> WorkflowResult:
        """
        公文优化 Chatflow。

        Chatflow 输入:
          - query: 待优化的公文内容
          - inputs: 可选的优化重点
        Chatflow 输出:
          - answer: 优化后的公文全文
        """
        query = f"请优化以下公文，提升语言规范性：\n\n{content}"
        
        inputs = {}
        if kb_texts:
            inputs["reference_materials"] = kb_texts
        
        outputs = await self._run_chatflow_blocking(
            api_key=self.doc_optimize_key,
            query=query,
            inputs=inputs,
        )
        
        return WorkflowResult(
            output_text=outputs.get("text", ""),
            metadata=outputs.get("metadata", {}),
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
        kb_context: str = "",
        graph_context: str = "",
        kb_top_score: float = 0.0,
    ) -> AsyncGenerator[SSEEvent, None]:
        """
        调用 Dify 工作流编排对话型应用 (Chatflow) 的 SSE 流式接口。
        
        后端检索版：将已检索的 kb_context / graph_context 作为 inputs 传入 Dify 工作流，
        Dify 仅做 LLM 推理（不做内部知识库检索）。
        """
        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.qa_chat_key}"}
        
        # 构建 inputs — 传递后端检索结果给 Dify 工作流
        inputs: dict = {}
        if kb_context:
            inputs["kb_context"] = kb_context[:20000]   # Dify 变量上限
        if graph_context:
            inputs["graph_context"] = graph_context[:10000]
        if kb_top_score > 0:
            inputs["kb_top_score"] = round(kb_top_score, 4)
        
        body: dict = {
            "inputs": inputs,
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
        调用 Dify 实体抽取 Chatflow（纯文本输入，不上传文件）。

        使用 streaming 模式收集完整响应，避免 blocking 模式的 120 秒超时。

        流程：
          1. 将 Markdown 文本作为 query 直接传给 Chatflow
          2. 以 streaming 模式接收 SSE 事件，拼接所有 answer 片段
          3. 解析最终 JSON → EntityTriple 列表

        Dify 结构化输出格式:
          {
            "query": "...",
            "entities": [{"id": "entity_1", "name": "...", "type": "...", ...}],
            "relations": [{"id": "rel_1", "source": "entity_1", "relation_type": "...", "target": "entity_2", ...}]
          }
        注意: relations 中 source/target 是实体 ID（如 entity_1），不是实体名称。
        """
        url = f"{self.base_url}/chat-messages"
        headers = {"Authorization": f"Bearer {self.entity_extract_key}"}
        body = {
            "query": text,
            "inputs": {},
            "response_mode": "streaming",
            "user": "govai-entity-extract",
        }

        # 使用 streaming 模式收集完整 answer，带重试（防止瞬时连接断开）
        stream_timeout = httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
        max_retries = 3
        last_error: Exception | None = None

        for attempt in range(1, max_retries + 1):
            answer_parts: list[str] = []
            try:
                async with httpx.AsyncClient(timeout=stream_timeout) as client:
                    async with client.stream("POST", url, headers=headers, json=body) as resp:
                        if resp.status_code >= 400:
                            error_body = ""
                            async for chunk in resp.aiter_text():
                                error_body += chunk
                            raise Exception(f"Dify API 错误 ({resp.status_code}): {error_body}")

                        async for line in resp.aiter_lines():
                            line = line.strip()
                            if not line or not line.startswith("data:"):
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
                                answer_parts.append(event_data.get("answer", ""))
                            elif event_type in ("message_end", "workflow_finished"):
                                break
                            elif event_type == "error":
                                raise Exception(f"Dify 工作流错误: {event_data.get('message', data_str)}")

                # 成功，跳出重试循环
                last_error = None
                break

            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    wait = self.RETRY_DELAY * (2 ** (attempt - 1))
                    logger.warning(f"实体抽取第 {attempt} 次失败: {e}，{wait}s 后重试...")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"实体抽取第 {attempt} 次失败（已用尽重试）: {e}")

        if last_error is not None:
            if isinstance(last_error, httpx.ConnectError):
                raise Exception(f"Dify 连接失败 (重试 {max_retries} 次): {last_error}")
            elif isinstance(last_error, httpx.TimeoutException):
                raise Exception(f"Dify 实体抽取超时 (重试 {max_retries} 次, url={url})")
            else:
                raise Exception(f"Dify 实体抽取失败 (重试 {max_retries} 次): {last_error}")

        answer_text = "".join(answer_parts)
        if not answer_text.strip():
            logger.warning("实体抽取返回空内容")
            return []

        logger.debug(f"实体抽取原始响应 ({len(answer_text)} 字符): {answer_text[:300]}")

        # ── 预处理：剥离 LLM 的 <think>...</think> 推理标签 ──
        import re
        clean_text = re.sub(r"<think>[\s\S]*?</think>", "", answer_text).strip()
        if not clean_text:
            logger.warning("实体抽取响应仅含 <think> 标签，无实际内容")
            return []

        # 尝试从文本中提取 JSON 块（可能被 markdown 代码块包裹）
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", clean_text)
        if json_match:
            clean_text = json_match.group(1).strip()

        # 如果仍不是以 { 开头，尝试找第一个 { 到最后一个 }
        if not clean_text.startswith("{"):
            brace_start = clean_text.find("{")
            brace_end = clean_text.rfind("}")
            if brace_start != -1 and brace_end > brace_start:
                clean_text = clean_text[brace_start:brace_end + 1]

        logger.debug(f"清洗后文本 ({len(clean_text)} 字符): {clean_text[:300]}")

        # 解析 JSON 结构化输出
        triples: list[EntityTriple] = []
        try:
            extraction_data = json.loads(clean_text)

            # 解析实体列表，构建 ID→实体 映射
            raw_entities = extraction_data.get("entities", [])
            if isinstance(raw_entities, str):
                raw_entities = json.loads(raw_entities)

            entity_by_id: dict[str, dict] = {}
            for ent in raw_entities:
                ent_id = ent.get("id", "")
                if ent_id:
                    entity_by_id[ent_id] = ent

            # 也做一份 name→type 映射（兼容旧格式 source/target 直接写名称的情况）
            entity_type_by_name: dict[str, str] = {}
            for ent in raw_entities:
                entity_type_by_name[ent.get("name", "")] = ent.get("type", "未知")

            # 解析关系列表（字段名 "relations"，兼容 "relationships"）
            raw_rels = extraction_data.get("relations") or extraction_data.get("relationships", [])
            if isinstance(raw_rels, str):
                raw_rels = json.loads(raw_rels)

            for rel in raw_rels:
                src_ref = rel.get("source", "")
                tgt_ref = rel.get("target", "")
                relation = rel.get("relation_type") or rel.get("relation", "相关")

                # source/target 可能是实体 ID（entity_1）或实体名称
                src_ent = entity_by_id.get(src_ref)
                tgt_ent = entity_by_id.get(tgt_ref)

                if src_ent and tgt_ent:
                    # 标准模式：通过 ID 查找
                    source_name = src_ent.get("name", src_ref)
                    target_name = tgt_ent.get("name", tgt_ref)
                    source_type = src_ent.get("type", "未知")
                    target_type = tgt_ent.get("type", "未知")
                else:
                    # 兼容模式：source/target 直接是名称
                    source_name = src_ref
                    target_name = tgt_ref
                    source_type = entity_type_by_name.get(src_ref, "未知")
                    target_type = entity_type_by_name.get(tgt_ref, "未知")

                if source_name and target_name:
                    triples.append(EntityTriple(
                        source=source_name,
                        target=target_name,
                        relation=relation,
                        source_type=source_type,
                        target_type=target_type,
                    ))

            logger.info(
                f"实体抽取完成: {len(raw_entities)} 个实体, "
                f"{len(raw_rels)} 个关系 → {len(triples)} 个三元组"
            )
        except json.JSONDecodeError:
            logger.warning(f"实体抽取返回非 JSON 格式: {clean_text[:300]}")

        return triples
