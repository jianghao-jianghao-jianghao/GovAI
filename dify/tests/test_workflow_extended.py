"""
Workflow Service 扩展测试 - 覆盖报告中缺失的测试项
"""
import pytest
from unittest.mock import patch, MagicMock
from services.dify import DifyClient, WorkflowService

@pytest.fixture
def dify_client(test_base_url):
    return DifyClient(base_url=test_base_url)

@pytest.fixture
def workflow_service(dify_client):
    return WorkflowService(dify_client)

@pytest.mark.unit
class TestWorkflowExtended:
    """扩展工作流测试，针对 TEST_STATUS_REPORT.md 中的缺失项"""

    # 4.1 工作流管理
    @pytest.mark.asyncio
    async def test_get_workflow_logs(self, workflow_service, mock_http_response):
        """测试工作流执行历史查询 (4.1)"""
        mock_logs = {
            "data": [
                {"id": "run-1", "status": "succeeded", "created_at": 1700000000},
                {"id": "run-2", "status": "failed", "created_at": 1700000100}
            ],
            "has_more": False,
            "limit": 20
        }
        with patch.object(workflow_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_logs)
            
            result = await workflow_service.get_workflow_logs(api_key="test-key", status="succeeded")
            
            assert len(result["data"]) == 2
            assert result["data"][0]["id"] == "run-1"
            mock_get.assert_called_once()
            args, kwargs = mock_get.call_args
            assert kwargs["params"]["status"] == "succeeded"

    @pytest.mark.asyncio
    async def test_get_workflow_run_detail(self, workflow_service, mock_http_response):
        """测试工作流详情查询 (4.1)"""
        mock_detail = {
            "id": "run-123",
            "status": "succeeded",
            "inputs": {"arg": "val"},
            "outputs": {"result": "ok"}
        }
        with patch.object(workflow_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_detail)
            
            result = await workflow_service.get_workflow_run_detail(api_key="test-key", run_id="run-123")
            
            assert result["id"] == "run-123"
            assert "/workflows/runs/run-123" in mock_get.call_args[0][0]

    # 4.2 工作流执行状态
    @pytest.mark.asyncio
    async def test_stop_workflow_task(self, workflow_service, mock_http_response):
        """测试取消正在执行的工作流 (4.2)"""
        mock_stop_resp = {"result": "success"}
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_stop_resp)
            
            result = await workflow_service.stop_workflow_task(
                api_key="test-key", 
                task_id="task-789", 
                user="test-user"
            )
            
            assert result["result"] == "success"
            mock_post.assert_called_once()
            assert "/workflows/tasks/task-789/stop" in mock_post.call_args[0][0]

    # 4.3 工作流变量
    @pytest.mark.asyncio
    async def test_complex_variable_types(self, workflow_service, mock_http_response):
        """测试复杂变量类型 (数组, 对象) (4.3)"""
        complex_inputs = {
            "items": ["a", "b", "c"],
            "config": {"key": "value", "enabled": True}
        }
        mock_resp = {"data": {"outputs": {"status": "processed"}}}
        
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_resp)
            
            await workflow_service.run_workflow_blocking(
                api_key="test-key",
                inputs=complex_inputs,
                user="test-user"
            )
            
            sent_body = mock_post.call_args[1]["json_body"]
            assert sent_body["inputs"]["items"] == ["a", "b", "c"]
            assert sent_body["inputs"]["config"]["key"] == "value"

    @pytest.mark.asyncio
    async def test_optional_variables(self, workflow_service, mock_http_response):
        """测试可选变量测试 (4.3)"""
        # 场景：不传可选参数 kb_dataset_ids
        mock_resp = {"data": {"outputs": {"text": "done"}}}
        with patch.object(workflow_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_resp)
            
            await workflow_service.run_doc_optimize(
                api_key="test-key",
                content="测试文本",
                user="test-user"
                # 不传 optimization_focus 和 kb_dataset_ids
            )
            
            sent_inputs = mock_post.call_args[1]["json_body"]["inputs"]
            assert "optimization_focus" in sent_inputs
            assert "kb_dataset_ids" not in sent_inputs
