"""
Dify 真实服务实现。
当 DIFY_MOCK=false 且 Dify 已搭建完成时使用。

已实现的功能：
- 知识库管理：create_dataset, delete_dataset
- 文档管理：upload_document, delete_document, get_indexing_status
待实现的功能：
- Workflow：run_doc_draft, run_doc_check, run_doc_optimize
- Chat：chat_stream
- 实体抽取：extract_entities
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
        """
        创建 Dify 知识库
        参考 Dify Dataset API: POST /datasets
        """
        url = f"{self.base_url}/datasets"
        
        payload = {
            "name": name,
            "description": "",
            "permission": "only_me",
            "indexing_technique": "high_quality"
        }
        
        headers = {
            "Authorization": f"Bearer {self.dataset_api_key}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload
            )
            
            if response.status_code >= 400:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except:
                    pass
                raise Exception(f"Dify create dataset failed: {error_detail}")
            
            result = response.json()
            
            return DatasetInfo(
                dataset_id=result.get("id", ""),
                name=result.get("name", name)
            )

    async def delete_dataset(self, dataset_id: str) -> None:
        """
        删除 Dify 知识库
        参考 Dify Dataset API: DELETE /datasets/{dataset_id}
        """
        url = f"{self.base_url}/datasets/{dataset_id}"
        
        headers = {
            "Authorization": f"Bearer {self.dataset_api_key}"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                url,
                headers=headers
            )
            
            if response.status_code >= 400:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except:
                    pass
                raise Exception(f"Dify delete dataset failed: {error_detail}")

    async def upload_document(
        self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
    ) -> DocumentUploadResult:
        """
        上传文件到 Dify 知识库
        参考 Dify Dataset API: POST /datasets/{dataset_id}/document/create-by-file
        """
        url = f"{self.base_url}/datasets/{dataset_id}/document/create-by-file"
        
        # 准备 multipart/form-data
        files = {
            "file": (file_name, file_content, file_type)
        }
        
        # Dify 要求的额外参数
        data = {
            "data": '{"indexing_technique": "high_quality", "process_rule": {"mode": "automatic"}}'
        }
        
        headers = {
            "Authorization": f"Bearer {self.dataset_api_key}"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                url,
                headers=headers,
                files=files,
                data=data
            )
            
            if response.status_code >= 400:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except:
                    pass
                raise Exception(f"Dify upload failed: {error_detail}")
            
            result = response.json()
            
            # 解析返回结果
            document = result.get("document", {})
            batch = result.get("batch", "")
            
            return DocumentUploadResult(
                document_id=document.get("id", ""),
                batch_id=batch
            )

    async def delete_document(self, dataset_id: str, document_id: str) -> None:
        """
        从 Dify 知识库删除文档
        参考 Dify Dataset API: DELETE /datasets/{dataset_id}/documents/{document_id}
        """
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{document_id}"
        
        headers = {
            "Authorization": f"Bearer {self.dataset_api_key}"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                url,
                headers=headers
            )
            
            if response.status_code >= 400:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except:
                    pass
                raise Exception(f"Dify delete document failed: {error_detail}")

    async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
        """
        查询文档索引状态
        参考 Dify Dataset API: GET /datasets/{dataset_id}/documents/{batch}/indexing-status
        返回: 'indexing' | 'completed' | 'error'
        """
        url = f"{self.base_url}/datasets/{dataset_id}/documents/{batch_id}/indexing-status"
        
        headers = {
            "Authorization": f"Bearer {self.dataset_api_key}"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                url,
                headers=headers
            )
            
            if response.status_code >= 400:
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("message", error_detail)
                except:
                    pass
                raise Exception(f"Dify get indexing status failed: {error_detail}")
            
            result = response.json()
            
            # Dify 返回的状态字段
            status = result.get("data", [{}])[0].get("indexing_status", "error")
            return status

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
