from __future__ import annotations

from typing import Any, Dict, Optional

from .client import DifyClient


class WorkflowService:
    def __init__(self, client: DifyClient):
        self._client = client

    async def run_workflow_blocking(
        self,
        *,
        api_key: str,
        inputs: Dict[str, Any],
        user: str,
    ) -> Dict[str, Any]:
        """执行工作流并阻塞等待完整结果。"""
        url = "/workflows/run"
        body = {
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        resp = await self._client.post(url, api_key=api_key, json_body=body)
        result = resp.json()
        # 返回数据结构参见 OpenAPI doc-draft-workflow 等示例
        return result.get("data", {}).get("outputs", {})

    async def run_doc_draft(
        self,
        *,
        api_key: str,
        template_content: str,
        user_requirement: str,
        user: str,
        reference_materials: Optional[str] = None,
    ) -> Dict[str, Any]:
        """公文起草"""
        inputs = {
            "template_content": template_content,
            "user_requirement": user_requirement,
            "reference_materials": reference_materials or "",
        }
        return await self.run_workflow_blocking(api_key=api_key, inputs=inputs, user=user)

    async def run_doc_check(
        self,
        *,
        api_key: str,
        content: str,
        user: str,
    ) -> Dict[str, Any]:
        """公文审查"""
        inputs = {"content": content}
        return await self.run_workflow_blocking(api_key=api_key, inputs=inputs, user=user)

    async def run_doc_optimize(
        self,
        *,
        api_key: str,
        content: str,
        user: str,
        optimization_focus: Optional[str] = None,
        kb_dataset_ids: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        """公文优化"""
        inputs = {
            "content": content,
            "optimization_focus": optimization_focus or "语言规范性",
        }
        if kb_dataset_ids:
            inputs["kb_dataset_ids"] = kb_dataset_ids
        return await self.run_workflow_blocking(api_key=api_key, inputs=inputs, user=user)

    async def extract_entities(
        self,
        *,
        api_key: str,
        text: str,
        user: str,
        source_doc_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """实体与关系抽取"""
        inputs = {
            "text": text,
            "source_doc_id": source_doc_id or "",
        }
        return await self.run_workflow_blocking(api_key=api_key, inputs=inputs, user=user)
    
    async def run_workflow_streaming(
        self,
        *,
        api_key: str,
        inputs: Dict[str, Any],
        user: str,
    ) -> Any:
        """执行工作流并流式返回结果"""
        url = "/workflows/run"
        body = {
            "inputs": inputs,
            "response_mode": "streaming",
            "user": user,
        }
        async for event in self._client.stream_post(url, api_key=api_key, json_body=body):
            yield event

    async def stop_workflow_task(
        self,
        *,
        api_key: str,
        task_id: str,
        user: str,
    ) -> Dict[str, Any]:
        """停止正在运行的工作流任务"""
        url = f"/workflows/tasks/{task_id}/stop"
        body = {"user": user}
        resp = await self._client.post(url, api_key=api_key, json_body=body)
        return resp.json()

    async def get_workflow_run_detail(
        self,
        *,
        api_key: str,
        run_id: str,
    ) -> Dict[str, Any]:
        """查询工作流执行详情"""
        url = f"/workflows/runs/{run_id}"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def get_workflow_logs(
        self,
        *,
        api_key: str,
        keyword: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """查询工作流执行历史/日志"""
        url = "/workflows/logs"
        params = {
            "page": page,
            "limit": limit,
        }
        if keyword:
            params["keyword"] = keyword
        if status:
            params["status"] = status
            
        resp = await self._client.get(url, api_key=api_key, params=params)
        return resp.json()
