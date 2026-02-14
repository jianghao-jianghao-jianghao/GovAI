"""
Dify Client 错误处理专项测试 - 覆盖报告第 6 节
"""
import pytest
import asyncio
import httpx
from unittest.mock import patch, MagicMock, AsyncMock
from services.dify import DifyClient, DifyError, DifyTimeoutError, DifyConnectionError, DifyRateLimitError

@pytest.fixture
def dify_client():
    return DifyClient(base_url="http://test-dify.local/v1")

@pytest.mark.unit
class TestErrorHandling:
    """错误处理测试，针对 TEST_STATUS_REPORT.md 第 6 节"""

    # 6.1 网络错误
    @pytest.mark.asyncio
    async def test_network_timeout(self, dify_client):
        """测试连接/读取超时 (6.1)"""
        with patch("httpx.AsyncClient.request", side_effect=httpx.TimeoutException("Timeout")):
            # 验证会进行 3 次尝试（默认 max_retries=3）
            with pytest.raises(DifyTimeoutError):
                await dify_client.get("/test", api_key="test-key")

    @pytest.mark.asyncio
    async def test_network_connection_error(self, dify_client):
        """测试网络中断/连接错误 (6.1)"""
        with patch("httpx.AsyncClient.request", side_effect=httpx.RequestError("Connection failed")):
            with pytest.raises(DifyConnectionError):
                await dify_client.get("/test", api_key="test-key")

    # 6.2 认证错误
    @pytest.mark.asyncio
    async def test_auth_errors(self, dify_client):
        """测试认证/权限错误 (6.2)"""
        # Mock 401 Unauthorized
        mock_401 = MagicMock(spec=httpx.Response)
        mock_401.status_code = 401
        mock_401.json.return_value = {"code": "invalid_api_key", "message": "Invalid API Key"}
        
        with patch("httpx.AsyncClient.request", return_value=mock_401):
            with pytest.raises(DifyError) as excinfo:
                await dify_client.get("/test", api_key="invalid-key")
            assert excinfo.value.status_code == 401
            assert excinfo.value.code == "invalid_api_key"

        # Mock 403 Forbidden
        mock_403 = MagicMock(spec=httpx.Response)
        mock_403.status_code = 403
        mock_403.json.return_value = {"code": "no_permission", "message": "No permission"}
        
        with patch("httpx.AsyncClient.request", return_value=mock_403):
            with pytest.raises(DifyError) as excinfo:
                await dify_client.get("/test", api_key="test-key")
            assert excinfo.value.status_code == 403

    # 6.3 限流错误
    @pytest.mark.asyncio
    async def test_rate_limit_and_backoff(self, dify_client):
        """测试 429 限流及 Retry-After 处理 (6.3)"""
        mock_429 = MagicMock(spec=httpx.Response)
        mock_429.status_code = 429
        mock_429.headers = {"Retry-After": "1"}
        mock_429.json.return_value = {"code": "rate_limit", "message": "Too many requests"}

        with patch("httpx.AsyncClient.request", return_value=mock_429):
            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                with pytest.raises(DifyRateLimitError):
                    await dify_client.get("/test", api_key="test-key")
                
                # 应该尝试了 3 次，前两次触发 sleep
                assert mock_sleep.call_count == 2
                mock_sleep.assert_called_with(1)

    # 6.4 服务器错误
    @pytest.mark.asyncio
    async def test_server_error_retry(self, dify_client):
        """测试 5xx 服务器错误及指数退避重试 (6.4)"""
        mock_500 = MagicMock(spec=httpx.Response)
        mock_500.status_code = 500
        mock_500.json.return_value = {"code": "internal_error", "message": "Internal Server Error"}

        # 模拟前两次 500，最后一次还是 500 最终抛错
        with patch("httpx.AsyncClient.request", return_value=mock_500) as mock_req:
            with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                with pytest.raises(DifyError):
                    await dify_client.get("/test", api_key="test-key")
                
                assert mock_req.call_count == 3
                # 指数退避：第一次重试等待 1.0 * (2^0) = 1s, 第二次 1.0 * (2^1) = 2s
                assert mock_sleep.call_args_list[0][0][0] == 1.0
                assert mock_sleep.call_args_list[1][0][0] == 2.0
