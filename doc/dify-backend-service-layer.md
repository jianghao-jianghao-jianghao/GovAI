# ============================================================

# GovAI 智政系统 - 后端 Python 内部服务层规范

# 日期：2026-02-10

# 说明：定义后端A（业务层）↔ 后端B（AI对接层）的 Python 函数接口

# 此文件是 dify-backend-api.yaml 的配套文档

# ============================================================

## 一、目录结构

```
backend/
├─ main.py                           # FastAPI 入口
├─ config.py                         # 配置（含 Dify 环境变量）
├─ routes/                           # 后端A：路由层
│   ├─ auth.py
│   ├─ kb.py                         # 知识库路由（调用 dify_service）
│   ├─ chat.py                       # 问答路由（调用 dify_service）
│   ├─ document.py                   # 公文路由（调用 dify_service）
│   ├─ graph.py
│   ├─ qa.py
│   ├─ user.py
│   ├─ rule.py
│   └─ audit.py
├─ services/                         # 后端A：业务服务层
│   ├─ kb_service.py
│   ├─ chat_service.py
│   ├─ doc_service.py
│   ├─ qa_service.py
│   ├─ rule_service.py
│   ├─ user_service.py
│   └─ audit_service.py
├─ services/dify/                    # ★ 后端B：Dify 对接层（本文档重点）
│   ├─ __init__.py
│   ├─ client.py                     # DifyClient 基础 HTTP 客户端
│   ├─ config.py                     # Dify 配置管理
│   ├─ dataset.py                    # 知识库/文档 API 封装
│   ├─ workflow.py                   # Workflow 执行封装
│   ├─ chat.py                       # RAG 问答封装
│   ├─ entity.py                     # 实体抽取封装
│   └─ exceptions.py                 # Dify 异常定义
├─ services/graph/                   # 后端B：Apache AGE 图数据库层
│   ├─ __init__.py
│   ├─ age_client.py                 # AGE 连接管理
│   └─ queries.py                    # Cypher 查询封装
├─ models/                           # SQLAlchemy ORM 模型
├─ schemas/                          # Pydantic 请求/响应 Schema
└─ utils/                            # 工具函数
```

---

## 二、配置管理（config.py）

```python
from pydantic_settings import BaseSettings
from typing import Optional

class DifyConfig(BaseSettings):
    """Dify 连接配置，从 .env 文件加载"""

    # ---- 基础配置 ----
    DIFY_BASE_URL: str = "http://localhost/v1"
    DIFY_TIMEOUT: int = 120                    # 请求超时（秒）
    DIFY_MAX_RETRIES: int = 3                  # 最大重试次数
    DIFY_RETRY_DELAY: float = 1.0              # 重试间隔基数（秒）
    DIFY_MAX_FILE_SIZE: int = 15_728_640       # 15MB

    # ---- API Keys（每个 Dify 应用/知识库一个 Key）----
    DIFY_DATASET_API_KEY: str                  # 知识库管理 Key
    DIFY_APP_DOC_DRAFT_KEY: str                # 公文起草 Workflow Key
    DIFY_APP_DOC_CHECK_KEY: str                # 公文审查 Workflow Key
    DIFY_APP_DOC_OPTIMIZE_KEY: str             # 公文优化 Workflow Key
    DIFY_APP_QA_CHAT_KEY: str                  # RAG 问答 Chat App Key
    DIFY_APP_ENTITY_EXTRACT_KEY: str           # 实体抽取 Workflow Key

    # ---- 索引轮询配置 ----
    DIFY_POLL_INTERVAL: int = 3                # 索引状态轮询间隔（秒）
    DIFY_POLL_MAX_COUNT: int = 60              # 最大轮询次数
    DIFY_POLL_TIMEOUT: int = 180               # 轮询总超时（秒）

    class Config:
        env_file = ".env"
        case_sensitive = True

dify_config = DifyConfig()
```

---

## 三、异常定义（exceptions.py）

```python
from typing import Optional

class DifyError(Exception):
    """Dify API 调用基础异常"""

    def __init__(
        self,
        message: str,
        code: str = "dify_error",
        status_code: int = 500,
        govai_code: int = 4001,
        raw_response: Optional[dict] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.govai_code = govai_code          # 映射到 GovAI 错误码
        self.raw_response = raw_response
        super().__init__(self.message)

class DifyConnectionError(DifyError):
    """网络连接异常（超时、DNS 解析失败等）"""
    def __init__(self, message: str = "Dify 服务连接失败"):
        super().__init__(message, code="connection_error", govai_code=4001)

class DifyTimeoutError(DifyError):
    """请求超时"""
    def __init__(self, message: str = "Dify 请求超时", timeout: int = 0):
        self.timeout = timeout
        super().__init__(message, code="timeout", govai_code=4001)

class DifyRateLimitError(DifyError):
    """请求频率限制 (HTTP 429)"""
    def __init__(self, message: str = "Dify 请求频率限制", retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(message, code="rate_limit", status_code=429, govai_code=4001)

class DifyFileError(DifyError):
    """文件相关异常（过大、格式不支持等）"""
    def __init__(self, message: str, code: str = "file_error"):
        super().__init__(message, code=code, status_code=400, govai_code=4002)

class DifyDatasetError(DifyError):
    """知识库相关异常"""
    def __init__(self, message: str, code: str = "dataset_error"):
        super().__init__(message, code=code, status_code=400, govai_code=4001)

class DifyWorkflowError(DifyError):
    """Workflow 执行异常"""
    def __init__(self, message: str, code: str = "workflow_error", task_id: str = ""):
        self.task_id = task_id
        super().__init__(message, code=code, govai_code=4001)

class DifyStreamError(DifyError):
    """SSE 流中断异常"""
    def __init__(self, message: str = "Dify SSE 流异常中断"):
        super().__init__(message, code="stream_error", govai_code=4003)
```

---

## 四、DifyClient 基础客户端（client.py）

```python
import httpx
import asyncio
import logging
import json
from typing import AsyncGenerator, Optional, Any
from .config import dify_config
from .exceptions import (
    DifyError, DifyConnectionError, DifyTimeoutError,
    DifyRateLimitError, DifyStreamError
)

logger = logging.getLogger(__name__)

class DifyClient:
    """
    Dify HTTP 客户端基类。

    功能：
    - 统一的 HTTP 请求封装（GET/POST/DELETE）
    - 自动重试（指数退避）
    - 超时控制
    - SSE 流式响应处理
    - 错误统一解析

    使用方式：
        client = DifyClient(api_key=dify_config.DIFY_DATASET_API_KEY)
        result = await client.post("/datasets", json={"name": "test"})
    """

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._base_url = dify_config.DIFY_BASE_URL
        self._timeout = dify_config.DIFY_TIMEOUT
        self._max_retries = dify_config.DIFY_MAX_RETRIES
        self._retry_delay = dify_config.DIFY_RETRY_DELAY

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json"
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict] = None,
        data: Optional[Any] = None,
        files: Optional[dict] = None,
        params: Optional[dict] = None,
        timeout: Optional[int] = None,
        retry: bool = True
    ) -> httpx.Response:
        """
        发送 HTTP 请求（带重试机制）。

        重试策略：
        - 仅对 5xx 错误和网络超时进行重试
        - 使用指数退避：delay * 2^attempt
        - 4xx 错误不重试（客户端错误）

        Args:
            method:  HTTP 方法
            path:    API 路径（如 /datasets）
            json:    JSON 请求体
            data:    Form 请求体（用于文件上传）
            files:   文件上传
            params:  查询参数
            timeout: 请求超时（秒），默认使用全局配置
            retry:   是否启用重试

        Returns:
            httpx.Response 对象

        Raises:
            DifyConnectionError: 网络连接失败
            DifyTimeoutError:    请求超时
            DifyRateLimitError:  频率限制
            DifyError:           其他 Dify 错误
        """
        url = f"{self._base_url}{path}"
        effective_timeout = timeout or self._timeout
        max_attempts = self._max_retries if retry else 1

        headers = {"Authorization": f"Bearer {self._api_key}"}
        if json is not None:
            headers["Content-Type"] = "application/json"

        for attempt in range(max_attempts):
            try:
                async with httpx.AsyncClient(timeout=effective_timeout) as client:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=json,
                        data=data,
                        files=files,
                        params=params
                    )

                # 成功
                if response.status_code < 400:
                    return response

                # 429 频率限制
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    if attempt < max_attempts - 1:
                        logger.warning(
                            f"[DifyClient] Rate limited, retry after {retry_after}s "
                            f"(attempt {attempt+1}/{max_attempts})"
                        )
                        await asyncio.sleep(retry_after)
                        continue
                    raise DifyRateLimitError(retry_after=retry_after)

                # 5xx 服务器错误 → 重试
                if response.status_code >= 500 and attempt < max_attempts - 1:
                    delay = self._retry_delay * (2 ** attempt)
                    logger.warning(
                        f"[DifyClient] Server error {response.status_code}, "
                        f"retrying in {delay}s (attempt {attempt+1}/{max_attempts})"
                    )
                    await asyncio.sleep(delay)
                    continue

                # 4xx 客户端错误 → 不重试，直接解析错误
                self._raise_for_error(response)

            except httpx.ConnectError as e:
                if attempt < max_attempts - 1:
                    delay = self._retry_delay * (2 ** attempt)
                    logger.warning(f"[DifyClient] Connection error, retrying in {delay}s")
                    await asyncio.sleep(delay)
                    continue
                raise DifyConnectionError(str(e))

            except httpx.TimeoutException as e:
                if attempt < max_attempts - 1:
                    delay = self._retry_delay * (2 ** attempt)
                    logger.warning(f"[DifyClient] Timeout, retrying in {delay}s")
                    await asyncio.sleep(delay)
                    continue
                raise DifyTimeoutError(timeout=effective_timeout)

        raise DifyError("Max retries exceeded")

    def _raise_for_error(self, response: httpx.Response):
        """解析 Dify 错误响应并抛出对应异常"""
        try:
            body = response.json()
        except Exception:
            body = {"code": "unknown", "message": response.text}

        code = body.get("code", "unknown")
        message = body.get("message", "Unknown Dify error")

        # 文件相关错误
        FILE_ERROR_CODES = {
            "no_file_uploaded", "too_many_files",
            "file_too_large", "unsupported_file_type"
        }
        if code in FILE_ERROR_CODES:
            from .exceptions import DifyFileError
            raise DifyFileError(message=message, code=code)

        # 知识库相关错误
        DATASET_ERROR_CODES = {
            "high_quality_dataset_only", "dataset_not_initialized",
            "archived_document_immutable", "dataset_name_duplicate",
            "document_already_finished", "document_indexing",
            "invalid_metadata", "invalid_action"
        }
        if code in DATASET_ERROR_CODES:
            from .exceptions import DifyDatasetError
            raise DifyDatasetError(message=message, code=code)

        raise DifyError(
            message=message,
            code=code,
            status_code=response.status_code,
            raw_response=body
        )

    # ---- 便捷方法 ----

    async def get(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("PUT", path, **kwargs)

    async def delete(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("DELETE", path, **kwargs)

    async def patch(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("PATCH", path, **kwargs)

    # ---- SSE 流式请求 ----

    async def stream_post(
        self,
        path: str,
        *,
        json: dict,
        timeout: Optional[int] = None
    ) -> AsyncGenerator[dict, None]:
        """
        发送 POST 请求并以 SSE 流式方式读取响应。

        用于：
        - Chat streaming (POST /chat-messages, response_mode=streaming)
        - Workflow streaming (POST /workflows/run, response_mode=streaming)

        Yields:
            解析后的 SSE 事件字典，如：
            {"event": "message", "answer": "根据", ...}
            {"event": "message_end", "metadata": {...}, ...}

        Raises:
            DifyStreamError: SSE 流解析失败或连接中断
        """
        url = f"{self._base_url}{path}"
        effective_timeout = timeout or self._timeout

        try:
            async with httpx.AsyncClient(timeout=effective_timeout) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers=self._headers,
                    json=json
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        self._raise_for_error(
                            type('R', (), {
                                'status_code': response.status_code,
                                'json': lambda: json.loads(body),
                                'text': body.decode()
                            })()
                        )

                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()

                            if not line:
                                continue
                            if line.startswith("data:"):
                                data_str = line[5:].strip()
                                if not data_str:
                                    continue
                                try:
                                    event_data = json.loads(data_str)
                                    # 跳过 ping 事件
                                    if event_data.get("event") == "ping":
                                        continue
                                    yield event_data
                                except json.JSONDecodeError:
                                    logger.warning(
                                        f"[DifyClient] Failed to parse SSE: {data_str[:200]}"
                                    )
        except httpx.StreamClosed:
            raise DifyStreamError("SSE stream closed unexpectedly")
        except httpx.TimeoutException:
            raise DifyTimeoutError(timeout=effective_timeout)
        except httpx.ConnectError as e:
            raise DifyConnectionError(str(e))
```

---

## 五、Dataset 服务层（dataset.py）

### 5.1 接口签名

```python
from typing import Optional, BinaryIO
from .client import DifyClient
from .config import dify_config

class DifyDatasetService:
    """
    知识库/文档管理服务。

    对应 Dify Dataset API，封装所有知识库 CRUD 操作。
    被 后端A 的 kb_service.py 调用。
    """

    def __init__(self):
        self._client = DifyClient(api_key=dify_config.DIFY_DATASET_API_KEY)

    # ----------------------------------------------------------
    # 知识库（Dataset）管理
    # ----------------------------------------------------------

    async def create_dataset(
        self,
        name: str,
        description: str = "",
        indexing_technique: str = "high_quality"
    ) -> str:
        """
        创建 Dify 知识库。

        调用方：后端A kb_service.create_collection()
        调用时机：创建 kb_collections 记录时

        Args:
            name:                知识库名称（必须唯一）
            description:         知识库描述
            indexing_technique:  索引方式 (high_quality|economy)

        Returns:
            str: Dify Dataset ID（存入 kb_collections.dify_dataset_id）

        Raises:
            DifyDatasetError: 名称重复 (dataset_name_duplicate)
            DifyConnectionError: 网络异常

        示例：
            dify_dataset_id = await dataset_service.create_dataset(
                name="政策法规知识库",
                description="包含国家政策法规文件"
            )
            # 回写到 PgSQL
            collection.dify_dataset_id = dify_dataset_id
        """
        response = await self._client.post(
            "/datasets",
            json={
                "name": name,
                "description": description,
                "permission": "only_me",
                "indexing_technique": indexing_technique
            }
        )
        return response.json()["id"]

    async def delete_dataset(self, dataset_id: str) -> bool:
        """
        删除 Dify 知识库（含所有文档）。

        调用方：后端A kb_service.delete_collection()
        调用时机：删除 kb_collections 前（先删 Dify，再删 PgSQL）

        Args:
            dataset_id: Dify Dataset ID (kb_collections.dify_dataset_id)

        Returns:
            bool: 是否成功

        Raises:
            DifyError: 删除失败
        """
        response = await self._client.delete(f"/datasets/{dataset_id}")
        return response.status_code == 204

    async def list_datasets(
        self,
        page: int = 1,
        limit: int = 20
    ) -> dict:
        """
        获取 Dify 知识库列表（用于对账/调试）。

        Returns:
            dict: {"data": [...], "has_more": bool, "total": int, "page": int}
        """
        response = await self._client.get(
            "/datasets",
            params={"page": page, "limit": limit}
        )
        return response.json()

    # ----------------------------------------------------------
    # 文档（Document）管理
    # ----------------------------------------------------------

    async def upload_document(
        self,
        dataset_id: str,
        file_content: bytes,
        filename: str,
        indexing_technique: str = "high_quality",
        process_mode: str = "automatic"
    ) -> dict:
        """
        上传文件到 Dify 知识库。

        调用方：后端A kb_service.upload_file()
        调用时机：PgSQL INSERT kb_files 后

        Args:
            dataset_id:           Dify Dataset ID
            file_content:         文件二进制内容
            filename:             文件名（如 "数据安全法.pdf"）
            indexing_technique:   索引方式
            process_mode:         处理模式 (automatic|custom)

        Returns:
            dict: {
                "dify_document_id": str,   # 存入 kb_files.dify_document_id
                "dify_batch_id": str        # 存入 kb_files.dify_batch_id
            }

        Raises:
            DifyFileError: 文件过大/格式不支持
            DifyDatasetError: 知识库不存在或未初始化

        示例：
            result = await dataset_service.upload_document(
                dataset_id=collection.dify_dataset_id,
                file_content=file.read(),
                filename="数据安全法.pdf"
            )
            # 回写
            kb_file.dify_document_id = result["dify_document_id"]
            kb_file.dify_batch_id = result["dify_batch_id"]
            kb_file.status = "indexing"
        """
        import json as json_module

        # 文件大小校验
        if len(file_content) > dify_config.DIFY_MAX_FILE_SIZE:
            from .exceptions import DifyFileError
            raise DifyFileError(
                message=f"File size {len(file_content)} exceeds limit "
                        f"{dify_config.DIFY_MAX_FILE_SIZE}",
                code="file_too_large"
            )

        data_json = json_module.dumps({
            "indexing_technique": indexing_technique,
            "process_rule": {"mode": process_mode}
        })

        response = await self._client.post(
            f"/datasets/{dataset_id}/document/create-by-file",
            data={"data": data_json},
            files={"file": (filename, file_content)},
            timeout=180  # 文件上传使用更长超时
        )

        result = response.json()
        return {
            "dify_document_id": result["document"]["id"],
            "dify_batch_id": result.get("batch", "")
        }

    async def create_document_by_text(
        self,
        dataset_id: str,
        name: str,
        text: str,
        indexing_technique: str = "high_quality"
    ) -> dict:
        """
        以文本方式创建文档。

        调用方：后端A qa_service（QA 对同步到知识库时）

        Returns:
            dict: {"dify_document_id": str, "dify_batch_id": str}
        """
        response = await self._client.post(
            f"/datasets/{dataset_id}/document/create_by_text",
            json={
                "name": name,
                "text": text,
                "indexing_technique": indexing_technique,
                "process_rule": {"mode": "automatic"}
            }
        )
        result = response.json()
        return {
            "dify_document_id": result["document"]["id"],
            "dify_batch_id": result.get("batch", "")
        }

    async def delete_document(
        self,
        dataset_id: str,
        document_id: str
    ) -> bool:
        """
        从知识库删除文档。

        调用方：后端A kb_service.delete_file()
        调用时机：删除 PgSQL kb_files 前

        Args:
            dataset_id:  Dify Dataset ID
            document_id: Dify Document ID (kb_files.dify_document_id)

        Returns:
            bool: 是否成功
        """
        response = await self._client.delete(
            f"/datasets/{dataset_id}/documents/{document_id}"
        )
        result = response.json()
        return result.get("result") == "success"

    async def get_indexing_status(
        self,
        dataset_id: str,
        batch_id: str
    ) -> dict:
        """
        查询文档索引进度。

        调用方：后端A kb_service（轮询索引状态）

        Args:
            dataset_id: Dify Dataset ID
            batch_id:   批次 ID (kb_files.dify_batch_id)

        Returns:
            dict: {
                "indexing_status": str,   # waiting|indexing|completed|error
                "completed_segments": int,
                "total_segments": int,
                "error": Optional[str]
            }

        使用示例（轮询）：
            while True:
                status = await dataset_service.get_indexing_status(
                    dataset_id, batch_id
                )
                if status["indexing_status"] in ("completed", "error"):
                    break
                await asyncio.sleep(POLL_INTERVAL)
        """
        response = await self._client.get(
            f"/datasets/{dataset_id}/documents/{batch_id}/indexing-status"
        )
        result = response.json()
        first_doc = result["data"][0] if result.get("data") else {}
        return {
            "indexing_status": first_doc.get("indexing_status", "unknown"),
            "completed_segments": first_doc.get("completed_segments", 0),
            "total_segments": first_doc.get("total_segments", 0),
            "error": first_doc.get("error")
        }

    async def list_documents(
        self,
        dataset_id: str,
        page: int = 1,
        limit: int = 20
    ) -> dict:
        """
        获取知识库文档列表（用于对账/调试）。

        Returns:
            dict: {"data": [...], "has_more": bool, "total": int}
        """
        response = await self._client.get(
            f"/datasets/{dataset_id}/documents",
            params={"page": page, "limit": limit}
        )
        return response.json()

    async def update_document_by_file(
        self,
        dataset_id: str,
        document_id: str,
        file_content: bytes,
        filename: str
    ) -> dict:
        """
        通过文件更新已有文档（重新索引）。

        Returns:
            dict: {"dify_document_id": str, "dify_batch_id": str}
        """
        import json as json_module

        data_json = json_module.dumps({
            "name": filename,
            "indexing_technique": "high_quality",
            "process_rule": {"mode": "automatic"}
        })

        response = await self._client.post(
            f"/datasets/{dataset_id}/documents/{document_id}/update-by-file",
            data={"data": data_json},
            files={"file": (filename, file_content)},
            timeout=180
        )
        result = response.json()
        return {
            "dify_document_id": result["document"]["id"],
            "dify_batch_id": result.get("batch", "")
        }

    # ----------------------------------------------------------
    # 检索（Retrieval）
    # ----------------------------------------------------------

    async def retrieve(
        self,
        dataset_id: str,
        query: str,
        top_k: int = 5,
        search_method: str = "hybrid_search",
        score_threshold: Optional[float] = 0.5
    ) -> list:
        """
        直接对知识库执行检索。

        调用方：后端A（调试/独立检索场景）

        Returns:
            list: [{"content": str, "score": float, "document_name": str}, ...]
        """
        response = await self._client.post(
            f"/datasets/{dataset_id}/retrieve",
            json={
                "query": query,
                "retrieval_model": {
                    "search_method": search_method,
                    "reranking_enable": False,
                    "top_k": top_k,
                    "score_threshold_enabled": score_threshold is not None,
                    "score_threshold": score_threshold
                }
            }
        )
        result = response.json()
        return [
            {
                "content": r["segment"]["content"],
                "score": r["score"],
                "document_name": r["segment"].get("document", {}).get("name", ""),
                "document_id": r["segment"].get("document_id", ""),
                "segment_id": r["segment"].get("id", "")
            }
            for r in result.get("records", [])
        ]
```

---

## 六、Workflow 服务层（workflow.py）

```python
from typing import Optional, AsyncGenerator
from .client import DifyClient
from .config import dify_config
from .exceptions import DifyWorkflowError

class DifyWorkflowService:
    """
    Dify Workflow 执行服务。

    封装 4 个 Workflow 的调用逻辑：
    1. 公文起草 (doc-draft)
    2. 公文审查 (doc-check)
    3. 公文优化 (doc-optimize)
    4. 实体抽取 (entity-extract)

    被 后端A 的 doc_service.py 调用。
    """

    def __init__(self):
        self._clients = {
            "doc_draft": DifyClient(api_key=dify_config.DIFY_APP_DOC_DRAFT_KEY),
            "doc_check": DifyClient(api_key=dify_config.DIFY_APP_DOC_CHECK_KEY),
            "doc_optimize": DifyClient(api_key=dify_config.DIFY_APP_DOC_OPTIMIZE_KEY),
            "entity_extract": DifyClient(api_key=dify_config.DIFY_APP_ENTITY_EXTRACT_KEY),
        }

    # ----------------------------------------------------------
    # 公文起草
    # ----------------------------------------------------------

    async def run_doc_draft(
        self,
        template_content: str,
        user_requirement: str,
        user_id: str,
        reference_materials: str = ""
    ) -> dict:
        """
        执行公文起草 Workflow（blocking 模式）。

        调用方：后端A doc_service.draft_document()
        调用链路：
            POST /documents/draft（前端）
              → 后端A：权限检查 + 敏感词检查
              → 后端B：run_doc_draft()  ← 本函数
              → 后端A：保存结果到 documents 表

        Args:
            template_content:     公文模板（含 {{placeholder}}）
            user_requirement:     用户起草要求
            user_id:              GovAI 用户 UUID
            reference_materials:  参考素材（可选）

        Returns:
            dict: {
                "generated_text": str,      # 生成的公文全文
                "sections": list[dict],     # 分段结构
                "tokens_used": int,         # 消耗 token
                "workflow_run_id": str,     # Workflow 运行 ID（可用于日志追踪）
                "elapsed_time": float       # 执行耗时（秒）
            }

        Raises:
            DifyWorkflowError: Workflow 执行失败
            DifyTimeoutError:  执行超时（>120s）

        示例：
            result = await workflow_service.run_doc_draft(
                template_content="关于{{主题}}的{{类型}}...",
                user_requirement="撰写数据安全管理通知",
                user_id="user-uuid"
            )
            document.content = result["generated_text"]
        """
        inputs = {
            "template_content": template_content,
            "user_requirement": user_requirement,
        }
        if reference_materials:
            inputs["reference_materials"] = reference_materials

        response = await self._clients["doc_draft"].post(
            "/workflows/run",
            json={
                "inputs": inputs,
                "response_mode": "blocking",
                "user": user_id
            }
        )

        result = response.json()
        data = result.get("data", {})

        if data.get("status") != "succeeded":
            raise DifyWorkflowError(
                message=data.get("error", "Workflow execution failed"),
                task_id=result.get("task_id", "")
            )

        outputs = data.get("outputs", {})
        return {
            "generated_text": outputs.get("generated_text", ""),
            "sections": outputs.get("sections", []),
            "tokens_used": data.get("total_tokens", 0),
            "workflow_run_id": result.get("workflow_run_id", ""),
            "elapsed_time": data.get("elapsed_time", 0)
        }

    # ----------------------------------------------------------
    # 公文审查
    # ----------------------------------------------------------

    async def run_doc_check(
        self,
        content: str,
        user_id: str
    ) -> dict:
        """
        执行公文审查 Workflow（blocking 模式）。

        调用方：后端A doc_service.check_document()

        Args:
            content:  待审查的公文全文
            user_id:  GovAI 用户 UUID

        Returns:
            dict: {
                "typos": list[dict],            # 错别字列表
                "grammar_issues": list[dict],   # 语法问题列表
                "sensitive_words": list[dict],  # 敏感词列表
                "format_issues": list[dict],    # 格式问题列表
                "overall_score": int,           # 总评分 (0-100)
                "summary": str,                 # 评价摘要
                "workflow_run_id": str,
                "elapsed_time": float
            }

        Raises:
            DifyWorkflowError: Workflow 执行失败
        """
        response = await self._clients["doc_check"].post(
            "/workflows/run",
            json={
                "inputs": {"content": content},
                "response_mode": "blocking",
                "user": user_id
            }
        )

        result = response.json()
        data = result.get("data", {})

        if data.get("status") != "succeeded":
            raise DifyWorkflowError(
                message=data.get("error", "Doc check workflow failed"),
                task_id=result.get("task_id", "")
            )

        outputs = data.get("outputs", {})
        return {
            "typos": outputs.get("typos", []),
            "grammar_issues": outputs.get("grammar_issues", []),
            "sensitive_words": outputs.get("sensitive_words", []),
            "format_issues": outputs.get("format_issues", []),
            "overall_score": outputs.get("overall_score", 0),
            "summary": outputs.get("summary", ""),
            "workflow_run_id": result.get("workflow_run_id", ""),
            "elapsed_time": data.get("elapsed_time", 0)
        }

    # ----------------------------------------------------------
    # 公文优化
    # ----------------------------------------------------------

    async def run_doc_optimize(
        self,
        content: str,
        user_id: str,
        optimization_focus: str = ""
    ) -> dict:
        """
        执行公文优化 Workflow（blocking 模式）。

        调用方：后端A doc_service.optimize_document()

        Args:
            content:             待优化的公文全文
            user_id:             GovAI 用户 UUID
            optimization_focus:  优化重点（可选，如"语言规范性"）

        Returns:
            dict: {
                "optimized_text": str,       # 优化后的全文
                "changes": list[dict],       # 修改明细
                "tokens_used": int,
                "workflow_run_id": str,
                "elapsed_time": float
            }

        Raises:
            DifyWorkflowError: Workflow 执行失败
        """
        inputs = {"content": content}
        if optimization_focus:
            inputs["optimization_focus"] = optimization_focus

        response = await self._clients["doc_optimize"].post(
            "/workflows/run",
            json={
                "inputs": inputs,
                "response_mode": "blocking",
                "user": user_id
            }
        )

        result = response.json()
        data = result.get("data", {})

        if data.get("status") != "succeeded":
            raise DifyWorkflowError(
                message=data.get("error", "Doc optimize workflow failed"),
                task_id=result.get("task_id", "")
            )

        outputs = data.get("outputs", {})
        return {
            "optimized_text": outputs.get("optimized_text", ""),
            "changes": outputs.get("changes", []),
            "tokens_used": data.get("total_tokens", 0),
            "workflow_run_id": result.get("workflow_run_id", ""),
            "elapsed_time": data.get("elapsed_time", 0)
        }

    # ----------------------------------------------------------
    # 停止 Workflow
    # ----------------------------------------------------------

    async def stop_workflow(
        self,
        task_id: str,
        user_id: str,
        workflow_type: str = "doc_draft"
    ) -> bool:
        """
        停止正在运行的 Workflow 任务。

        Args:
            task_id:        任务 ID
            user_id:        用户标识
            workflow_type:  工作流类型 (doc_draft|doc_check|doc_optimize|entity_extract)

        Returns:
            bool: 是否成功
        """
        client = self._clients.get(workflow_type)
        if not client:
            raise ValueError(f"Unknown workflow type: {workflow_type}")

        response = await client.post(
            f"/workflows/tasks/{task_id}/stop",
            json={"user": user_id}
        )
        return response.json().get("result") == "success"
```

---

## 七、Chat 服务层（chat.py）

```python
from typing import AsyncGenerator, Optional
from .client import DifyClient
from .config import dify_config

class DifyChatService:
    """
    RAG 问答服务（SSE 流式输出）。

    封装 Dify Chat App 的调用逻辑，支持 streaming。
    被 后端A 的 chat_service.py 调用。
    """

    def __init__(self):
        self._client = DifyClient(api_key=dify_config.DIFY_APP_QA_CHAT_KEY)

    async def chat_stream(
        self,
        query: str,
        user_id: str,
        conversation_id: str = "",
        inputs: Optional[dict] = None
    ) -> AsyncGenerator[dict, None]:
        """
        发送 RAG 问答请求（streaming 模式）。

        调用方：后端A chat_service.send_message()
        调用链路：
            POST /chat/send（前端 SSE）
              → 后端A：权限检查
              → 后端A：敏感词前置检查
              → 后端A：QA库优先匹配
              → [未命中] → 后端B：chat_stream()  ← 本函数
              → 后端A：逐块 SSE 转发给前端
              → 后端A：消息完成后保存到 chat_messages

        Args:
            query:            用户问题文本
            user_id:          GovAI 用户 UUID
            conversation_id:  Dify 会话 ID（首次留空）
            inputs:           App 变量（首次对话时传入）

        Yields:
            dict: SSE 事件数据。事件类型及处理方式：

            1. {"event": "message", "answer": "增量文本", "message_id": "...", "conversation_id": "..."}
               → 后端A 拼接 answer → SSE 转发给前端（打字机效果）

            2. {"event": "message_end", "message_id": "...", "conversation_id": "...", "metadata": {...}}
               → 后端A 提取 retriever_resources → 构建 citations
               → 保存完整消息到 chat_messages 表
               → SSE 发送 END 信号给前端

            3. {"event": "error", "message": "...", "code": "..."}
               → 后端A 日志记录 → SSE 发送错误给前端

        Raises:
            DifyStreamError:      SSE 流中断
            DifyConnectionError:  网络异常
            DifyTimeoutError:     请求超时

        使用示例（后端A 中的调用）：
            async def send_message_sse(query, user_id, session):
                # ... 前置检查 ...

                full_answer = ""
                conversation_id = session.dify_conversation_id or ""
                citations = []

                async for event in chat_service.chat_stream(
                    query=query,
                    user_id=user_id,
                    conversation_id=conversation_id
                ):
                    if event["event"] == "message":
                        full_answer += event["answer"]
                        yield sse_format({"type": "text", "content": event["answer"]})

                    elif event["event"] == "message_end":
                        # 提取引用来源
                        resources = event.get("metadata", {}).get("retriever_resources", [])
                        citations = [
                            {
                                "kb_name": r["dataset_name"],
                                "doc_name": r["document_name"],
                                "content": r["content"],
                                "score": r["score"]
                            }
                            for r in resources
                        ]
                        # 更新会话 Dify ID
                        if not session.dify_conversation_id:
                            session.dify_conversation_id = event["conversation_id"]

                        yield sse_format({
                            "type": "end",
                            "citations": citations,
                            "tokens": event.get("metadata", {}).get("usage", {})
                        })

                    elif event["event"] == "error":
                        yield sse_format({"type": "error", "message": event["message"]})

                # 保存消息
                await save_chat_message(session.id, "user", query)
                await save_chat_message(
                    session.id, "assistant", full_answer,
                    citations=citations
                )
        """
        request_body = {
            "query": query,
            "response_mode": "streaming",
            "user": user_id,
        }
        if conversation_id:
            request_body["conversation_id"] = conversation_id
        if inputs:
            request_body["inputs"] = inputs

        async for event in self._client.stream_post(
            "/chat-messages",
            json=request_body
        ):
            yield event

    async def send_feedback(
        self,
        message_id: str,
        rating: str,
        user_id: str
    ) -> bool:
        """
        对 Dify 消息进行反馈。

        Args:
            message_id: Dify 消息 ID
            rating:     "like" | "dislike" | null
            user_id:    用户标识

        Returns:
            bool: 是否成功
        """
        response = await self._client.post(
            f"/messages/{message_id}/feedbacks",
            json={
                "rating": rating,
                "user": user_id
            }
        )
        return response.json().get("result") == "success"

    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str
    ) -> bool:
        """
        删除 Dify 会话。

        调用方：后端A chat_service.delete_session()
        调用时机：删除 PgSQL chat_sessions 前

        Returns:
            bool: 是否成功
        """
        response = await self._client.delete(
            f"/conversations/{conversation_id}",
            json={"user": user_id}
        )
        return response.status_code == 204 or response.status_code == 200
```

---

## 八、Entity 服务层（entity.py）

```python
from typing import Optional
from .client import DifyClient
from .config import dify_config
from .exceptions import DifyWorkflowError

class DifyEntityService:
    """
    实体抽取服务。

    通过 Dify Workflow 从文本中抽取实体和关系，
    结果写入 PgSQL Apache AGE 图数据库。

    被 后端B 的 graph/age_client.py 调用。
    """

    def __init__(self):
        self._client = DifyClient(api_key=dify_config.DIFY_APP_ENTITY_EXTRACT_KEY)

    async def extract_entities(
        self,
        text: str,
        user_id: str,
        source_doc_id: str = ""
    ) -> dict:
        """
        从文本中抽取实体和关系。

        调用方：后端B（文档上传完成后自动触发，或手动触发）
        调用链路：
            文档索引完成
              → 后端B：从 Dify 获取文档文本（或直接用上传时的文本）
              → 后端B：extract_entities()  ← 本函数
              → 后端B：将结果写入 AGE 图

        Args:
            text:           待抽取的文本内容
            user_id:        用户标识
            source_doc_id:  来源文档 ID（用于溯源）

        Returns:
            dict: {
                "entities": [
                    {
                        "name": str,        # 实体名称
                        "type": str,        # 实体类型（法规/机构/概念/人物等）
                        "description": str  # 实体描述
                    }
                ],
                "relationships": [
                    {
                        "source": str,      # 源实体名称
                        "relation": str,    # 关系类型（包含/规定/执法等）
                        "target": str,      # 目标实体名称
                        "weight": float     # 关系权重 (0-1)
                    }
                ]
            }

        后续处理（age_client.py）：
            result = await entity_service.extract_entities(text, user_id, doc_id)

            for entity in result["entities"]:
                await age_client.create_entity(
                    name=entity["name"],
                    entity_type=entity["type"],
                    description=entity["description"],
                    source_doc_id=source_doc_id
                )

            for rel in result["relationships"]:
                await age_client.create_relationship(
                    source=rel["source"],
                    relation=rel["relation"],
                    target=rel["target"],
                    weight=rel["weight"]
                )
        """
        inputs = {"text": text}
        if source_doc_id:
            inputs["source_doc_id"] = source_doc_id

        response = await self._client.post(
            "/workflows/run",
            json={
                "inputs": inputs,
                "response_mode": "blocking",
                "user": user_id
            }
        )

        result = response.json()
        data = result.get("data", {})

        if data.get("status") != "succeeded":
            raise DifyWorkflowError(
                message=data.get("error", "Entity extraction failed"),
                task_id=result.get("task_id", "")
            )

        outputs = data.get("outputs", {})
        return {
            "entities": outputs.get("entities", []),
            "relationships": outputs.get("relationships", [])
        }
```

---

## 九、后端A 调用示例（集成层）

### 9.1 知识库文件上传完整流程

```python
# routes/kb.py（后端A）

from services.dify.dataset import DifyDatasetService
from services.dify.exceptions import DifyError, DifyFileError

dataset_service = DifyDatasetService()

@router.post("/kb/files/upload")
async def upload_file(
    collection_id: UUID,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """知识库文件上传完整流程"""

    # ① 权限检查
    collection = await kb_service.get_collection(db, collection_id)
    check_perm(current_user, f"res:kb:manage:{collection_id}")

    # ② PgSQL 写入元数据 (status=uploading)
    kb_file = KBFile(
        collection_id=collection_id,
        name=file.filename,
        file_type=file.content_type,
        file_size=file.size,
        status="uploading",
        uploaded_by=current_user.id
    )
    db.add(kb_file)
    await db.commit()

    try:
        # ③ 调后端B → Dify API 上传
        file_content = await file.read()
        result = await dataset_service.upload_document(
            dataset_id=collection.dify_dataset_id,
            file_content=file_content,
            filename=file.filename
        )

        # ④ 回写 Dify ID，更新状态
        kb_file.dify_document_id = result["dify_document_id"]
        kb_file.dify_batch_id = result["dify_batch_id"]
        kb_file.status = "indexing"
        await db.commit()

        # ⑤ 记审计日志
        await audit_service.log(
            user_id=current_user.id,
            action="upload",
            module="kb",
            target_id=str(kb_file.id),
            detail=f"上传文件 {file.filename} 到集合 {collection.name}"
        )

        return {"code": 0, "data": kb_file.to_dict()}

    except DifyFileError as e:
        # Dify 文件错误 → 标记失败
        kb_file.status = "failed"
        await db.commit()
        return {"code": e.govai_code, "message": e.message}

    except DifyError as e:
        # 其他 Dify 错误 → 标记失败
        kb_file.status = "failed"
        await db.commit()
        return {"code": e.govai_code, "message": f"Dify 服务异常: {e.message}"}
```

### 9.2 智能问答 SSE 完整流程

```python
# routes/chat.py（后端A）

from fastapi.responses import StreamingResponse
from services.dify.chat import DifyChatService
from services.qa_service import qa_service
from services.rule_service import rule_service

chat_service = DifyChatService()

@router.post("/chat/send")
async def send_message(
    body: ChatSendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """智能问答 SSE 流式接口"""

    # ① 权限检查
    check_perm(current_user, "app:qa:chat")

    # ② 敏感词前置检查
    block_result = rule_service.check_keywords(body.query)
    if block_result and block_result.action == "block":
        return {"code": 5001, "message": f"包含敏感词: {block_result.word}"}

    # 获取会话
    session = await chat_service_local.get_or_create_session(
        db, body.session_id, current_user.id
    )

    async def event_generator():
        # ③ QA库优先匹配
        qa_match = await qa_service.find_best_match(db, body.query)

        if qa_match:
            # 命中 QA 库 → 直接返回
            yield f"data: {json.dumps({'type': 'text', 'content': qa_match.answer})}\n\n"
            yield f"data: {json.dumps({'type': 'source', 'from': 'qa_library', 'qa_id': str(qa_match.id)})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"

            # 保存消息
            await save_messages(db, session.id, body.query, qa_match.answer, source="qa")
            return

        # ④ 未命中 → 调 Dify RAG
        full_answer = ""
        citations = []

        try:
            async for event in chat_service.chat_stream(
                query=body.query,
                user_id=str(current_user.id),
                conversation_id=session.dify_conversation_id or ""
            ):
                if event["event"] == "message":
                    chunk = event["answer"]
                    full_answer += chunk
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

                elif event["event"] == "message_end":
                    # 提取引用
                    resources = event.get("metadata", {}).get("retriever_resources", [])
                    citations = [
                        {
                            "kb_name": r.get("dataset_name", ""),
                            "doc_name": r.get("document_name", ""),
                            "content": r.get("content", ""),
                            "score": r.get("score", 0)
                        }
                        for r in resources
                    ]

                    # 更新 dify_conversation_id
                    if not session.dify_conversation_id:
                        session.dify_conversation_id = event.get("conversation_id", "")
                        await db.commit()

                    yield f"data: {json.dumps({'type': 'citations', 'data': citations})}\n\n"
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"

                elif event["event"] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': event.get('message', 'AI 服务异常')})}\n\n"
                    return

            # 保存消息
            await save_messages(
                db, session.id, body.query, full_answer,
                source="rag", citations=citations
            )

        except Exception as e:
            logger.exception("Chat stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': 'AI 服务暂时不可用'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
```

---

## 十、数据同步策略汇总

### 10.1 PgSQL ↔ Dify 映射字段

| PgSQL 表         | PgSQL 字段             | Dify 对应                | 写入时机   |
| ---------------- | ---------------------- | ------------------------ | ---------- |
| `kb_collections` | `dify_dataset_id`      | Dataset.id               | 创建集合时 |
| `kb_files`       | `dify_document_id`     | Document.id              | 文件上传后 |
| `kb_files`       | `dify_batch_id`        | Document.batch           | 文件上传后 |
| `kb_files`       | `status`               | Document.indexing_status | 轮询更新   |
| `chat_sessions`  | `dify_conversation_id` | Conversation.id          | 首次消息后 |

### 10.2 操作顺序约定

| 操作         | 顺序                                     | 失败回滚策略                                    |
| ------------ | ---------------------------------------- | ----------------------------------------------- |
| **创建集合** | PgSQL → Dify → 回写 dify_id              | Dify 失败：PgSQL 记录保留，dify_dataset_id=NULL |
| **删除集合** | Dify → PgSQL                             | Dify 失败：不删 PgSQL，前端提示重试             |
| **上传文件** | PgSQL(uploading) → Dify → 回写(indexing) | Dify 失败：status='failed'，前端可重试          |
| **删除文件** | Dify → PgSQL                             | Dify 失败：不删 PgSQL，前端提示重试             |
| **发消息**   | Dify(stream) → PgSQL(完成后)             | Dify 失败：不保存消息，前端提示错误             |
| **删会话**   | Dify → PgSQL                             | Dify 失败：不删 PgSQL，前端提示重试             |

### 10.3 定期对账任务（可选）

```python
# tasks/reconciliation.py

async def reconcile_datasets():
    """
    定期对账：比对 PgSQL kb_collections 与 Dify Datasets。
    建议频率：每天凌晨执行一次。

    对账逻辑：
    1. 获取 PgSQL 中所有 dify_dataset_id 不为空的 kb_collections
    2. 调用 Dify API 获取所有 datasets
    3. 检查：
       a. PgSQL 有而 Dify 无 → 标记为异常，通知管理员
       b. Dify 有而 PgSQL 无 → 孤儿数据，可选择自动清理
    4. 对比文档数量差异
    5. 生成对账报告
    """
    pass

async def reconcile_indexing_status():
    """
    修复卡住的索引状态。

    逻辑：
    1. 查询 PgSQL 中 status='indexing' 且 updated_at < 30分钟前的 kb_files
    2. 逐个查询 Dify 索引状态
    3. 如果已完成 → 更新为 'indexed'
    4. 如果已失败 → 更新为 'failed'
    5. 如果仍在索引 → 保持不变
    """
    pass
```

---

## 十一、环境变量完整清单（.env.example）

```env
# ============================================================
# GovAI 后端 - Dify 集成配置
# ============================================================

# Dify 基础配置
DIFY_BASE_URL=http://localhost/v1
DIFY_TIMEOUT=120
DIFY_MAX_RETRIES=3
DIFY_RETRY_DELAY=1.0
DIFY_MAX_FILE_SIZE=15728640

# Dify API Keys（每个应用独立 Key）
DIFY_DATASET_API_KEY=dataset-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_APP_DOC_DRAFT_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_APP_DOC_CHECK_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_APP_DOC_OPTIMIZE_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_APP_QA_CHAT_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
DIFY_APP_ENTITY_EXTRACT_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx

# 索引轮询配置
DIFY_POLL_INTERVAL=3
DIFY_POLL_MAX_COUNT=60
DIFY_POLL_TIMEOUT=180
```
