"""
QA服务 - 两级查询逻辑实现

实现流程:
1. 先查询QA库
2. 如果QA库命中（score >= 阈值），直接返回答案
3. 如果QA库未命中，查询用户指定的知识库
4. 将知识库检索结果传递给智能问答工作流
5. 返回工作流生成的答案
"""

from typing import Dict, Any, Optional, List
from .client import DifyClient
from .dataset import DatasetService
from .workflow import WorkflowService


class QAService:
    """QA服务 - 实现两级查询逻辑"""
    
    # QA库配置
    QA_DATASET_ID = "7047121a-8b6e-487c-893c-3ed489e0fd87"
    QA_API_KEY = "dataset-02rZJb5w1S39SMUQMXT2sQR2"
    
    # 命中阈值
    QA_HIT_THRESHOLD = 0.85
    
    # 知识库检索配置
    KB_TOP_K = 3
    KB_SCORE_THRESHOLD = 0.7
    
    def __init__(self, client: DifyClient):
        self._client = client
        self._dataset_service = DatasetService(client)
        self._workflow_service = WorkflowService(client)
    
    async def query(
        self,
        *,
        query: str,
        user_dataset_id: str,
        user_dataset_api_key: str,
        workflow_api_key: str,
        user: str,
        qa_top_k: int = 1,
        kb_top_k: Optional[int] = None,
        qa_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        执行两级查询
        
        Args:
            query: 用户问题
            user_dataset_id: 用户知识库ID
            user_dataset_api_key: 用户知识库API Key
            workflow_api_key: 智能问答工作流API Key
            user: 用户ID
            qa_top_k: QA库返回结果数量
            kb_top_k: 知识库返回结果数量
            qa_threshold: QA库命中阈值（可选，默认使用类常量）
        
        Returns:
            {
                "answer": "答案内容",
                "source": "qa" | "workflow",  # 答案来源
                "qa_score": 0.95,  # QA库分数（如果来自QA库）
                "citations": [...],  # 引用来源（如果来自工作流）
                "metadata": {...}  # 其他元数据
            }
        """
        kb_top_k = kb_top_k or self.KB_TOP_K
        qa_threshold = qa_threshold or self.QA_HIT_THRESHOLD
        
        # 步骤1: 查询QA库
        qa_result = await self._query_qa_library(
            query=query,
            top_k=qa_top_k
        )
        
        # 步骤2: 检查QA库是否命中
        if qa_result["hit"]:
            # QA库命中，直接返回
            return {
                "answer": qa_result["answer"],
                "source": "qa",
                "qa_score": qa_result["score"],
                "qa_segment_id": qa_result["segment_id"],
                "citations": None,
                "metadata": {
                    "query": query,
                    "qa_hit": True,
                    "kb_queried": False
                }
            }
        
        # 步骤3: QA库未命中，查询用户知识库
        kb_result = await self._query_knowledge_base(
            query=query,
            dataset_id=user_dataset_id,
            api_key=user_dataset_api_key,
            top_k=kb_top_k
        )
        
        # 步骤4: 检查知识库是否有结果
        if not kb_result["records"]:
            # 知识库也没有结果
            return {
                "answer": "抱歉，我没有找到相关信息。请尝试换一种方式提问，或联系管理员补充知识库内容。",
                "source": "fallback",
                "qa_score": qa_result.get("score"),
                "citations": None,
                "metadata": {
                    "query": query,
                    "qa_hit": False,
                    "kb_queried": True,
                    "kb_empty": True
                }
            }
        
        # 步骤5: 调用智能问答工作流
        workflow_result = await self._call_qa_workflow(
            query=query,
            kb_records=kb_result["records"],
            dataset_ids=[user_dataset_id],
            workflow_api_key=workflow_api_key,
            user=user
        )
        
        # 步骤6: 返回工作流结果
        return {
            "answer": workflow_result["answer"],
            "source": "workflow",
            "qa_score": qa_result.get("score"),
            "citations": workflow_result.get("citations"),
            "metadata": {
                "query": query,
                "qa_hit": False,
                "kb_queried": True,
                "kb_records_count": len(kb_result["records"]),
                "workflow_run_id": workflow_result.get("workflow_run_id")
            }
        }
    
    async def _query_qa_library(
        self,
        *,
        query: str,
        top_k: int = 1
    ) -> Dict[str, Any]:
        """
        查询QA库
        
        Returns:
            {
                "hit": True/False,
                "score": 0.95,
                "answer": "答案内容",
                "segment_id": "seg-123",
                "content": "问题内容"
            }
        """
        try:
            result = await self._client.post(
                f"/datasets/{self.QA_DATASET_ID}/retrieve",
                api_key=self.QA_API_KEY,
                json_body={
                    "query": query,
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": top_k,
                        "score_threshold_enabled": False
                    }
                }
            )
            
            data = result.json()
            
            if not data.get("records"):
                return {
                    "hit": False,
                    "score": 0.0,
                    "answer": None,
                    "segment_id": None,
                    "content": None
                }
            
            best_match = data["records"][0]
            score = best_match["score"]
            segment = best_match["segment"]
            
            # 检查是否命中
            hit = score >= self.QA_HIT_THRESHOLD
            
            # 提取答案（优先使用answer字段，否则使用content）
            answer = segment.get("answer") or segment.get("content")
            
            return {
                "hit": hit,
                "score": score,
                "answer": answer,
                "segment_id": segment.get("id"),
                "content": segment.get("content")
            }
        
        except Exception as e:
            # QA库查询失败，记录日志但不中断流程
            print(f"QA库查询失败: {e}")
            return {
                "hit": False,
                "score": 0.0,
                "answer": None,
                "segment_id": None,
                "content": None,
                "error": str(e)
            }
    
    async def _query_knowledge_base(
        self,
        *,
        query: str,
        dataset_id: str,
        api_key: str,
        top_k: int = 3
    ) -> Dict[str, Any]:
        """
        查询用户知识库
        
        Returns:
            {
                "records": [
                    {
                        "segment_id": "seg-123",
                        "content": "内容",
                        "document_name": "文档名.pdf",
                        "document_id": "doc-456",
                        "score": 0.92
                    },
                    ...
                ]
            }
        """
        try:
            result = await self._client.post(
                f"/datasets/{dataset_id}/retrieve",
                api_key=api_key,
                json_body={
                    "query": query,
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": top_k,
                        "score_threshold_enabled": True,
                        "score_threshold": self.KB_SCORE_THRESHOLD
                    }
                }
            )
            
            data = result.json()
            
            # 转换为简化格式
            records = []
            for record in data.get("records", []):
                segment = record["segment"]
                records.append({
                    "segment_id": segment.get("id"),
                    "content": segment.get("content"),
                    "document_name": segment.get("document", {}).get("name"),
                    "document_id": segment.get("document", {}).get("id"),
                    "score": record.get("score")
                })
            
            return {"records": records}
        
        except Exception as e:
            print(f"知识库查询失败: {e}")
            return {"records": [], "error": str(e)}
    
    async def _call_qa_workflow(
        self,
        *,
        query: str,
        kb_records: List[Dict[str, Any]],
        dataset_ids: List[str],
        workflow_api_key: str,
        user: str
    ) -> Dict[str, Any]:
        """
        调用智能问答工作流
        
        Args:
            query: 用户问题
            kb_records: 知识库检索结果
            dataset_ids: 数据集ID列表
            workflow_api_key: 工作流API Key
            user: 用户ID
        
        Returns:
            {
                "answer": "答案内容",
                "citations": [...],
                "workflow_run_id": "wfr-123"
            }
        """
        # 将知识库检索结果转换为context
        context_parts = []
        for i, record in enumerate(kb_records, 1):
            doc_name = record["document_name"]
            content = record["content"]
            context_parts.append(f"[来源{i}: {doc_name}]\n{content}")
        
        context = "\n\n".join(context_parts)
        
        try:
            # 调用工作流
            result = await self._workflow_service.run_workflow_blocking(
                api_key=workflow_api_key,
                inputs={
                    "query": query,
                    "context": context,
                    "dataset_ids": dataset_ids
                },
                user=user
            )
            
            # 提取答案和引用
            answer = result.get("answer") or result.get("text") or "未能生成答案"
            
            # 构建引用列表
            citations = []
            for record in kb_records:
                citations.append({
                    "document_name": record["document_name"],
                    "document_id": record["document_id"],
                    "content": record["content"][:200],  # 截取前200字符
                    "score": record["score"]
                })
            
            return {
                "answer": answer,
                "citations": citations,
                "workflow_run_id": result.get("workflow_run_id")
            }
        
        except Exception as e:
            print(f"工作流调用失败: {e}")
            # 工作流失败时，返回基于检索结果的简单答案
            fallback_answer = f"根据检索到的资料：\n\n{context[:500]}..."
            return {
                "answer": fallback_answer,
                "citations": [
                    {
                        "document_name": r["document_name"],
                        "content": r["content"][:200]
                    }
                    for r in kb_records
                ],
                "workflow_run_id": None,
                "error": str(e)
            }
    
    async def query_streaming(
        self,
        *,
        query: str,
        user_dataset_id: str,
        user_dataset_api_key: str,
        workflow_api_key: str,
        user: str
    ):
        """
        流式查询（用于实时返回）
        
        注意: QA库命中时直接返回，不支持流式
        只有调用工作流时才使用流式返回
        """
        # 步骤1: 查询QA库
        qa_result = await self._query_qa_library(query=query)
        
        if qa_result["hit"]:
            # QA库命中，直接返回（非流式）
            yield {
                "event": "answer",
                "data": {
                    "answer": qa_result["answer"],
                    "source": "qa",
                    "qa_score": qa_result["score"]
                }
            }
            yield {
                "event": "done",
                "data": {
                    "source": "qa",
                    "metadata": {"qa_hit": True}
                }
            }
            return
        
        # 步骤2: 查询知识库
        kb_result = await self._query_knowledge_base(
            query=query,
            dataset_id=user_dataset_id,
            api_key=user_dataset_api_key
        )
        
        if not kb_result["records"]:
            yield {
                "event": "answer",
                "data": {"answer": "抱歉，我没有找到相关信息。"}
            }
            yield {
                "event": "done",
                "data": {"source": "fallback"}
            }
            return
        
        # 步骤3: 流式调用工作流
        context_parts = []
        for i, record in enumerate(kb_result["records"], 1):
            context_parts.append(f"[来源{i}: {record['document_name']}]\n{record['content']}")
        context = "\n\n".join(context_parts)
        
        async for event in self._workflow_service.run_workflow_streaming(
            api_key=workflow_api_key,
            inputs={
                "query": query,
                "context": context,
                "dataset_ids": [user_dataset_id]
            },
            user=user
        ):
            # 转发工作流事件
            yield event
        
        # 添加引用信息
        yield {
            "event": "citations",
            "data": {
                "citations": [
                    {
                        "document_name": r["document_name"],
                        "content": r["content"][:200]
                    }
                    for r in kb_result["records"]
                ]
            }
        }
