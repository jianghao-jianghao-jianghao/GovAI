"""
Chat Service 扩展测试 - 覆盖报告中缺失的测试项 (5.1 - 5.4)
"""
import pytest
from unittest.mock import patch
from services.dify import DifyClient, ChatService

@pytest.fixture
def dify_client(test_base_url):
    return DifyClient(base_url=test_base_url)

@pytest.fixture
def chat_service(dify_client):
    return ChatService(dify_client)

@pytest.mark.unit
class TestChatExtended:
    """扩展聊天服务测试，针对 TEST_STATUS_REPORT.md 第 5 节"""

    # 5.1 会话管理
    @pytest.mark.asyncio
    async def test_list_conversations(self, chat_service, mock_http_response):
        """测试会话列表查询 (5.1)"""
        mock_data = {
            "data": [
                {"id": "conv-1", "name": "会话1", "created_at": 1700000000},
                {"id": "conv-2", "name": "会话2", "created_at": 1700000100}
            ],
            "has_more": False,
            "limit": 20
        }
        with patch.object(chat_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.list_conversations(api_key="test-key", user="test-user")
            
            assert len(result["data"]) == 2
            assert result["data"][0]["id"] == "conv-1"
            mock_get.assert_called_once()
            assert "/conversations" in mock_get.call_args[0][0]

    @pytest.mark.asyncio
    async def test_get_conversation_detail(self, chat_service, mock_http_response):
        """测试会话详情查询 (5.1)"""
        mock_data = {"id": "conv-1", "name": "会话1", "status": "normal"}
        with patch.object(chat_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.get_conversation_detail(
                api_key="test-key", conversation_id="conv-1", user="test-user"
            )
            
            assert result["id"] == "conv-1"
            assert "/conversations/conv-1" in mock_get.call_args[0][0]

    @pytest.mark.asyncio
    async def test_rename_conversation(self, chat_service, mock_http_response):
        """测试会话重命名 (5.1)"""
        mock_data = {"result": "success"}
        with patch.object(chat_service._client, 'patch') as mock_patch:
            mock_patch.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.rename_conversation(
                api_key="test-key", conversation_id="conv-1", name="新名称", user="test-user"
            )
            
            assert result["result"] == "success"
            sent_body = mock_patch.call_args[1]["json_body"]
            assert sent_body["name"] == "新名称"

    @pytest.mark.asyncio
    async def test_delete_conversation(self, chat_service, mock_http_response):
        """测试会话删除 (5.1)"""
        mock_data = {"result": "success"}
        with patch.object(chat_service._client, 'delete') as mock_delete:
            mock_delete.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.delete_conversation(
                api_key="test-key", conversation_id="conv-1", user="test-user"
            )
            
            assert result["result"] == "success"
            mock_delete.assert_called_once()

    # 5.2 消息管理
    @pytest.mark.asyncio
    async def test_list_messages(self, chat_service, mock_http_response):
        """测试消息历史查询 (5.2)"""
        mock_data = {
            "data": [
                {"id": "msg-1", "content": "你好", "role": "user"},
                {"id": "msg-2", "content": "你好！我是AI", "role": "assistant"}
            ]
        }
        with patch.object(chat_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.list_messages(
                api_key="test-key", conversation_id="conv-1", user="test-user"
            )
            
            assert len(result["data"]) == 2
            assert "/messages" in mock_get.call_args[0][0]

    @pytest.mark.asyncio
    async def test_message_feedback(self, chat_service, mock_http_response):
        """测试消息反馈 (点赞/点踩) (5.2)"""
        mock_data = {"result": "success"}
        with patch.object(chat_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.message_feedback(
                api_key="test-key", message_id="msg-1", rating="like", user="test-user"
            )
            
            assert result["result"] == "success"
            assert "/messages/msg-1/feedbacks" in mock_post.call_args[0][0]

    # 5.3 建议问题
    @pytest.mark.asyncio
    async def test_get_suggested_questions(self, chat_service, mock_http_response):
        """测试获取建议问题列表 (5.3)"""
        mock_data = {"data": ["问题1", "问题2"]}
        with patch.object(chat_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.get_suggested_questions(api_key="test-key", message_id="msg-1")
            
            assert len(result["data"]) == 2
            assert "/messages/msg-1/suggested" in mock_get.call_args[0][0]

    # 5.4 文件上传
    @pytest.mark.asyncio
    async def test_upload_chat_file(self, chat_service, mock_http_response):
        """测试聊天中上传文件 (5.4)"""
        mock_data = {"id": "file-123", "name": "test.png", "size": 1024}
        with patch.object(chat_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(status_code=200, json_data=mock_data)
            
            result = await chat_service.upload_chat_file(
                api_key="test-key",
                file_bytes=b"fake-image-content",
                filename="test.png",
                content_type="image/png",
                user="test-user"
            )
            
            assert result["id"] == "file-123"
            mock_post.assert_called_once()
            assert "/files/upload" in mock_post.call_args[0][0]
            assert "files" in mock_post.call_args[1]
