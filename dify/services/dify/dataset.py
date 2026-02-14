import json
from typing import Any, Dict, Optional
from .client import DifyClient


class DatasetService:
    def __init__(self, client: DifyClient):
        self._client = client

    async def create_dataset(self, api_key: str, name: str, description: str = "") -> str:
        """创建空知识库"""
        url = "/datasets"
        payload = {
            "name": name,
            "description": description,
            "permission": "only_me",
            "indexing_technique": "high_quality"
        }
        resp = await self._client.post(url, api_key=api_key, json_body=payload)
        result = resp.json()
        return result["id"]

    async def upload_document(
        self, 
        api_key: str,
        dataset_id: str, 
        file_bytes: bytes, 
        filename: str, 
        content_type: str = "application/octet-stream"
    ) -> Dict[str, Any]:
        """上传文件到知识库"""
        url = f"/datasets/{dataset_id}/document/create-by-file"
        data_json = {
            "indexing_technique": "high_quality",
            "process_rule": {"mode": "automatic"}
        }
        files = {
            "file": (filename, file_bytes, content_type)
        }
        data = {
            "data": json.dumps(data_json)
        }
        resp = await self._client.post(url, api_key=api_key, files=files, data=data)
        return resp.json()

    async def get_indexing_status(self, api_key: str, dataset_id: str, batch: str) -> Dict[str, Any]:
        """查询索引进度"""
        url = f"/datasets/{dataset_id}/documents/{batch}/indexing-status"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def delete_dataset(self, api_key: str, dataset_id: str) -> None:
        """删除知识库"""
        url = f"/datasets/{dataset_id}"
        await self._client.delete(url, api_key=api_key)

    async def delete_document(self, api_key: str, dataset_id: str, document_id: str) -> None:
        """删除文档"""
        url = f"/datasets/{dataset_id}/documents/{document_id}"
        await self._client.delete(url, api_key=api_key)

    async def list_datasets(
        self, 
        api_key: str, 
        page: int = 1, 
        limit: int = 20
    ) -> Dict[str, Any]:
        """获取知识库列表"""
        url = f"/datasets?page={page}&limit={limit}"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def get_dataset(self, api_key: str, dataset_id: str) -> Dict[str, Any]:
        """获取知识库详情"""
        url = f"/datasets/{dataset_id}"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def update_dataset(
        self, 
        api_key: str, 
        dataset_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        permission: Optional[str] = None
    ) -> Dict[str, Any]:
        """更新知识库"""
        url = f"/datasets/{dataset_id}"
        payload = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if permission is not None:
            payload["permission"] = permission
        
        resp = await self._client.patch(url, api_key=api_key, json_body=payload)
        return resp.json()

    async def list_documents(
        self, 
        api_key: str,
        dataset_id: str,
        keyword: str = "",
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """获取文档列表"""
        url = f"/datasets/{dataset_id}/documents?keyword={keyword}&page={page}&limit={limit}"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def get_document(
        self, 
        api_key: str,
        dataset_id: str,
        document_id: str
    ) -> Dict[str, Any]:
        """获取文档详情"""
        url = f"/datasets/{dataset_id}/documents/{document_id}"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def update_document(
        self, 
        api_key: str,
        dataset_id: str,
        document_id: str,
        name: Optional[str] = None,
        enabled: Optional[bool] = None
    ) -> Dict[str, Any]:
        """更新文档"""
        url = f"/datasets/{dataset_id}/documents/{document_id}"
        payload = {}
        if name is not None:
            payload["name"] = name
        if enabled is not None:
            payload["enabled"] = enabled
        
        resp = await self._client.patch(url, api_key=api_key, json_body=payload)
        return resp.json()

    async def list_segments(
        self,
        api_key: str,
        dataset_id: str,
        document_id: str
    ) -> Dict[str, Any]:
        """获取文档分段列表"""
        url = f"/datasets/{dataset_id}/documents/{document_id}/segments"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def add_segments(
        self,
        api_key: str,
        dataset_id: str,
        document_id: str,
        segments: list
    ) -> Dict[str, Any]:
        """添加文档分段"""
        url = f"/datasets/{dataset_id}/documents/{document_id}/segments"
        payload = {"segments": segments}
        resp = await self._client.post(url, api_key=api_key, json_body=payload)
        return resp.json()

    async def update_segment(
        self,
        api_key: str,
        dataset_id: str,
        document_id: str,
        segment_id: str,
        content: Optional[str] = None,
        answer: Optional[str] = None,
        keywords: Optional[list] = None,
        enabled: Optional[bool] = None
    ) -> Dict[str, Any]:
        """更新文档分段"""
        url = f"/datasets/{dataset_id}/documents/{document_id}/segments/{segment_id}"
        segment = {}
        if content is not None:
            segment["content"] = content
        if answer is not None:
            segment["answer"] = answer
        if keywords is not None:
            segment["keywords"] = keywords
        if enabled is not None:
            segment["enabled"] = enabled
        
        payload = {"segment": segment}
        resp = await self._client.post(url, api_key=api_key, json_body=payload)
        return resp.json()

    async def delete_segment(
        self,
        api_key: str,
        dataset_id: str,
        document_id: str,
        segment_id: str
    ) -> None:
        """删除文档分段"""
        url = f"/datasets/{dataset_id}/documents/{document_id}/segments/{segment_id}"
        await self._client.delete(url, api_key=api_key)
