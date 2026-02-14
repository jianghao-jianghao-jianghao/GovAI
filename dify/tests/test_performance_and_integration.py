"""
性能测试与端到端集成测试 - 覆盖报告第 7 节与第 8 节
"""
import pytest
import asyncio
import time
from unittest.mock import patch, MagicMock, AsyncMock
from services.dify import DifyClient, DatasetService, WorkflowService, ChatService

@pytest.fixture
def dify_client(test_base_url):
    return DifyClient(base_url=test_base_url)

@pytest.fixture
def dataset_service(dify_client):
    return DatasetService(dify_client)

@pytest.fixture
def workflow_service(dify_client):
    return WorkflowService(dify_client)

@pytest.fixture
def chat_service(dify_client):
    return ChatService(dify_client)

@pytest.mark.unit
class TestPerformance:
    """性能测试模拟 (第 7 节)"""

    @pytest.mark.asyncio
    async def test_concurrent_workflow_requests(self, workflow_service, mock_http_response):
        """测试并发工作流请求 (7.1)"""
        mock_resp = {"data": {"outputs": {"text": "done"}}}
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_resp)
            
            # 模拟 10 个并发请求
            tasks = [
                workflow_service.run_workflow_blocking(
                    api_key="key", inputs={"q": i}, user="user"
                ) for i in range(10)
            ]
            start_time = time.time()
            results = await asyncio.gather(*tasks)
            end_time = time.time()
            
            assert len(results) == 10
            assert mock_post.call_count == 10
            # 验证异步执行未发生阻塞（模拟环境下理论上极快）
            assert end_time - start_time < 1.0

    @pytest.mark.asyncio
    async def test_large_content_processing(self, workflow_service, mock_http_response):
        """测试长文本处理 (7.2)"""
        # 生成 1MB 左右的长文本
        long_text = "这是测试长文本。" * 50000 
        mock_resp = {"data": {"outputs": {"summary": "ok"}}}
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_resp)
            
            result = await workflow_service.run_doc_check(
                api_key="key", content=long_text, user="user"
            )
            
            assert result is not None
            # 验证请求体大小
            sent_body = mock_post.call_args[1]["json_body"]
            assert len(sent_body["inputs"]["content"]) > 1000000

@pytest.mark.unit
class TestEndToEndFlows:
    """端到端集成测试模拟 (第 8 节)"""

    @pytest.mark.asyncio
    async def test_dataset_full_lifecycle(self, dataset_service, chat_service, mock_http_response, mock_sse_events):
        """完整的知识库创建->上传->索引->问答流程 (8.1)"""
        # 1. Mock 创建知识库
        mock_create = mock_http_response(json_data={"id": "ds-123"})
        # 2. Mock 上传
        mock_upload = mock_http_response(json_data={"document": {"id": "doc-456"}, "batch": "b-789"})
        # 3. Mock 索引状态
        mock_status = mock_http_response(json_data={"data": {"indexing_status": "completed"}})
        # 4. Mock 问答流
        events = [
            {"event": "message", "answer": "基于文档的回答"},
            {"event": "message_end", "metadata": {"retriever_resources": [{"id": "seg-1"}]}}
        ]

        with patch.object(dataset_service._client, 'post') as mock_post, \
             patch.object(dataset_service._client, 'get') as mock_get, \
             patch.object(chat_service._client, 'stream_post') as mock_stream:
            
            mock_post.side_effect = [mock_create, mock_upload]
            mock_get.return_value = mock_status
            mock_stream.return_value = mock_sse_events(events)

            # 执行流程
            ds_id = await dataset_service.create_dataset("test-ds", "desc", api_key="key")
            upload_res = await dataset_service.upload_document("key", ds_id, b"content", "t.txt")
            status = await dataset_service.get_indexing_status("key", ds_id, upload_res["batch"])
            
            assert ds_id == "ds-123"
            assert status["data"]["indexing_status"] == "completed"

            # 执行问答
            answer, _, citations = await chat_service.rag_chat_collect(
                api_key="key", query="问题", user="user", inputs={"dataset_ids": [ds_id]}
            )
            assert "回答" in answer
            assert len(citations) == 1

    @pytest.mark.asyncio
    async def test_doc_workflow_chain(self, workflow_service, mock_http_response):
        """公文起草->审查->优化完整流程 (8.1)"""
        # 模拟起草输出
        draft_out = {"data": {"outputs": {"generated_text": "起草的初稿"}}}
        # 模拟审查输出
        check_out = {"data": {"outputs": {"typos": [], "overall_score": 90}}}
        # 模拟优化输出
        opt_out = {"data": {"outputs": {"optimized_text": "最终定稿"}}}

        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.side_effect = [
                mock_http_response(json_data=draft_out),
                mock_http_response(json_data=check_out),
                mock_http_response(json_data=opt_out)
            ]

            # 1. 起草
            draft = await workflow_service.run_doc_draft(
                api_key="k1", template_content="T", user_requirement="R", user="u"
            )
            # 2. 审查
            check = await workflow_service.run_doc_check(
                api_key="k2", content=draft["generated_text"], user="u"
            )
            # 3. 优化
            final = await workflow_service.run_doc_optimize(
                api_key="k3", content=draft["generated_text"], user="u"
            )

            assert draft["generated_text"] == "起草的初稿"
            assert check["overall_score"] == 90
            assert final["optimized_text"] == "最终定稿"
            assert mock_post.call_count == 3
