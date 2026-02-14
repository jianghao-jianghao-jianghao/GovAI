"""
Workflow Service 单元测试
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.dify import DifyClient, WorkflowService


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def workflow_service(dify_client):
    """创建工作流服务"""
    return WorkflowService(dify_client)


@pytest.mark.unit
class TestWorkflowService:
    """工作流服务测试"""
    
    @pytest.mark.asyncio
    async def test_run_workflow_blocking(
        self, workflow_service, mock_api_keys, sample_workflow_response, mock_http_response
    ):
        """测试阻塞模式工作流"""
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=sample_workflow_response
            )
            
            result = await workflow_service.run_workflow_blocking(
                api_key=mock_api_keys["doc_draft"],
                inputs={"content": "测试内容"},
                user="test-user"
            )
            
            assert "generated_text" in result
            assert result["quality_score"] == 85
            mock_post.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_run_doc_draft(
        self, workflow_service, mock_api_keys, sample_workflow_response, mock_http_response
    ):
        """测试公文起草"""
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=sample_workflow_response
            )
            
            result = await workflow_service.run_doc_draft(
                api_key=mock_api_keys["doc_draft"],
                template_content="关于{{主题}}的通知",
                user_requirement="撰写数据安全管理通知",
                user="test-user"
            )
            
            assert "generated_text" in result
            
            # 验证调用参数
            call_args = mock_post.call_args
            assert call_args[1]["json_body"]["inputs"]["template_content"] == "关于{{主题}}的通知"
            assert call_args[1]["json_body"]["response_mode"] == "blocking"
    
    @pytest.mark.asyncio
    async def test_run_doc_check(
        self, workflow_service, mock_api_keys, mock_http_response
    ):
        """测试公文审查"""
        check_response = {
            "workflow_run_id": "wfr-123",
            "task_id": "task-456",
            "data": {
                "id": "wfr-123",
                "status": "succeeded",
                "outputs": {
                    "typos": [
                        {
                            "original": "做好",
                            "suggestion": "作好",
                            "reason": "用词不当",
                            "position": "第2段第3行"
                        }
                    ],
                    "grammar_issues": [],
                    "sensitive_words": []
                }
            }
        }
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=check_response
            )
            
            result = await workflow_service.run_doc_check(
                api_key=mock_api_keys["doc_check"],
                content="为了做好数据安全管理工作",
                user="test-user"
            )
            
            assert "typos" in result
            assert len(result["typos"]) == 1
    
    @pytest.mark.asyncio
    async def test_run_doc_optimize(
        self, workflow_service, mock_api_keys, mock_http_response
    ):
        """测试公文优化"""
        optimize_response = {
            "workflow_run_id": "wfr-123",
            "task_id": "task-456",
            "data": {
                "id": "wfr-123",
                "status": "succeeded",
                "outputs": {
                    "optimized_text": "优化后的公文内容",
                    "changes": [
                        {
                            "type": "wording",
                            "original": "为了加强",
                            "optimized": "为加强",
                            "reason": "简化冗余表达"
                        }
                    ]
                }
            }
        }
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=optimize_response
            )
            
            result = await workflow_service.run_doc_optimize(
                api_key=mock_api_keys["doc_optimize"],
                content="为了加强数据安全管理",
                user="test-user",
                optimization_focus="语言规范性",
                kb_dataset_ids=["dataset-123"]
            )
            
            assert "optimized_text" in result
            assert "changes" in result
            
            # 验证kb_dataset_ids被传递
            call_args = mock_post.call_args
            assert "kb_dataset_ids" in call_args[1]["json_body"]["inputs"]
    
    @pytest.mark.asyncio
    async def test_extract_entities(
        self, workflow_service, mock_api_keys, mock_http_response
    ):
        """测试实体抽取"""
        entity_response = {
            "workflow_run_id": "wfr-123",
            "task_id": "task-456",
            "data": {
                "id": "wfr-123",
                "status": "succeeded",
                "outputs": {
                    "entities": [
                        {
                            "name": "数据安全法",
                            "type": "法规",
                            "confidence": 0.95
                        }
                    ],
                    "relationships": [
                        {
                            "source": "数据安全法",
                            "relation": "规定",
                            "target": "分类分级",
                            "weight": 0.90
                        }
                    ]
                }
            }
        }
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=entity_response
            )
            
            result = await workflow_service.extract_entities(
                api_key=mock_api_keys["entity_extract"],
                text="数据安全法规定了分类分级要求",
                user="test-user",
                source_doc_id="doc-123"
            )
            
            assert "entities" in result
            assert "relationships" in result
            assert len(result["entities"]) == 1
    
    @pytest.mark.asyncio
    async def test_run_workflow_streaming(
        self, workflow_service, mock_api_keys, mock_sse_events
    ):
        """测试流式工作流"""
        events = [
            {"event": "workflow_started", "task_id": "task-123"},
            {"event": "text_chunk", "text": "关于"},
            {"event": "text_chunk", "text": "数据安全"},
            {"event": "workflow_finished", "outputs": {"text": "关于数据安全"}}
        ]
        
        with patch.object(workflow_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(events)
            
            collected_events = []
            async for event in workflow_service.run_workflow_streaming(
                api_key=mock_api_keys["doc_draft"],
                inputs={"content": "测试"},
                user="test-user"
            ):
                collected_events.append(event)
            
            assert len(collected_events) == 4
            assert collected_events[0]["event"] == "workflow_started"
            assert collected_events[-1]["event"] == "workflow_finished"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
