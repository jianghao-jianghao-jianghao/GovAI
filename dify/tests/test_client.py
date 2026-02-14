"""
Dify Client 单元测试

运行测试：
pytest tests/test_client.py -v
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.dify import DifyClient, DifyError


@pytest.fixture
def dify_config():
    """测试配置"""
    return {
        "base_url": "http://test-dify.local/v1",
        "timeout": 30
    }


@pytest.fixture
def dify_client(dify_config):
    """测试客户端"""
    return DifyClient(**dify_config)


class TestDifyClient:
    """DifyClient 测试类"""
    
    @pytest.mark.asyncio
    async def test_request_json_success(self, dify_client):
        """测试成功的 JSON 请求"""
        with patch.object(dify_client._client, 'request') as mock_request:
            # Mock 成功响应
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"id": "test-123", "name": "test"}
            mock_request.return_value = mock_response
            
            result = await dify_client._request_json(
                "GET",
                "http://test-dify.local/v1/datasets",
                api_key="test-key"
            )
            
            assert result["id"] == "test-123"
            assert result["name"] == "test"
    
    @pytest.mark.asyncio
    async def test_request_json_error(self, dify_client):
        """测试错误响应"""
        with patch.object(dify_client._client, 'request') as mock_request:
            # Mock 错误响应
            mock_response = MagicMock()
            mock_response.status_code = 400
            mock_response.json.return_value = {
                "code": "invalid_param",
                "message": "Invalid parameter"
            }
            mock_response.text = "Invalid parameter"
            mock_request.return_value = mock_response
            
            with pytest.raises(DifyError) as exc_info:
                await dify_client._request_json(
                    "POST",
                    "http://test-dify.local/v1/datasets",
                    api_key="test-key",
                    json_body={"name": ""}
                )
            
            assert exc_info.value.status_code == 400
            assert exc_info.value.code == "invalid_param"
    
    @pytest.mark.asyncio
    async def test_request_json_retry(self, dify_client):
        """测试重试机制"""
        with patch.object(dify_client._client, 'request') as mock_request:
            # 第一次失败，第二次成功
            mock_response_fail = MagicMock()
            mock_response_fail.status_code = 500
            mock_response_fail.json.return_value = {"message": "Server error"}
            mock_response_fail.text = "Server error"
            
            mock_response_success = MagicMock()
            mock_response_success.status_code = 200
            mock_response_success.json.return_value = {"id": "test-123"}
            
            mock_request.side_effect = [mock_response_fail, mock_response_success]
            
            result = await dify_client._request_json(
                "GET",
                "http://test-dify.local/v1/datasets",
                api_key="test-key"
            )
            
            assert result["id"] == "test-123"
            assert mock_request.call_count == 2
    
    @pytest.mark.asyncio
    async def test_headers(self, dify_client):
        """测试请求头"""
        headers = dify_client._headers("test-api-key")
        assert headers["Authorization"] == "Bearer test-api-key"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
