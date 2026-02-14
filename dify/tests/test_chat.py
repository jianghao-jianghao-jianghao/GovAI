"""
Chat Service 单元测试
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.dify import DifyClient, ChatService


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def chat_service(dify_client):
    """创建聊天服务"""
    return ChatService(dify_client)


@pytest.fixture
def sample_chat_events_with_retrieval():
    """带知识库检索的聊天事件"""
    return [
        {
            "event": "message",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "answer": "根据知识库中的"
        },
        {
            "event": "message",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "answer": "《数据安全法》规定"
        },
        {
            "event": "message_end",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "metadata": {
                "usage": {
                    "prompt_tokens": 150,
                    "completion_tokens": 80,
                    "total_tokens": 230
                },
                "retriever_resources": [
                    {
                        "position": 1,
                        "dataset_id": "dataset-123",
                        "dataset_name": "政策法规知识库",
                        "document_id": "doc-456",
                        "document_name": "数据安全法.pdf",
                        "segment_id": "seg-789",
                        "score": 0.95,
                        "content": "第二十一条 国家建立数据分类分级保护制度..."
                    },
                    {
                        "position": 2,
                        "dataset_id": "dataset-123",
                        "dataset_name": "政策法规知识库",
                        "document_id": "doc-789",
                        "document_name": "数据分类分级指南.pdf",
                        "segment_id": "seg-101",
                        "score": 0.87,
                        "content": "数据分类分级是指根据数据的重要性..."
                    }
                ]
            }
        }
    ]


@pytest.mark.unit
class TestChatService:
    """聊天服务测试"""
    
    @pytest.mark.asyncio
    async def test_rag_chat_stream(
        self, chat_service, mock_api_keys, sample_chat_events, mock_sse_events
    ):
        """测试RAG问答流式响应"""
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events)
            
            collected_events = []
            async for event in chat_service.rag_chat_stream(
                api_key=mock_api_keys["chat"],
                query="什么是数据分类分级？",
                user="test-user"
            ):
                collected_events.append(event)
            
            assert len(collected_events) == 3
            assert collected_events[0]["event"] == "message"
            assert collected_events[-1]["event"] == "message_end"
            
            # 验证调用参数
            call_args = mock_stream.call_args
            assert call_args[1]["json_body"]["query"] == "什么是数据分类分级？"
            assert call_args[1]["json_body"]["response_mode"] == "streaming"
    
    @pytest.mark.asyncio
    async def test_rag_chat_stream_with_conversation(
        self, chat_service, mock_api_keys, sample_chat_events, mock_sse_events
    ):
        """测试带会话ID的RAG问答"""
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events)
            
            collected_events = []
            async for event in chat_service.rag_chat_stream(
                api_key=mock_api_keys["chat"],
                query="继续说明",
                user="test-user",
                conversation_id="conv-123"
            ):
                collected_events.append(event)
            
            # 验证会话ID被传递
            call_args = mock_stream.call_args
            assert call_args[1]["json_body"]["conversation_id"] == "conv-123"
    
    @pytest.mark.asyncio
    async def test_rag_chat_collect(
        self, chat_service, mock_api_keys, sample_chat_events, mock_sse_events
    ):
        """测试RAG问答收集完整结果"""
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events)
            
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="什么是数据分类分级？",
                user="test-user"
            )
            
            # 验证结果
            assert answer == "数据分类分级是指根据数据的重要性"
            assert conv_id == "conv-123"
            assert citations is not None
            assert len(citations) == 1
            assert citations[0]["dataset_id"] == "dataset-123"
    
    @pytest.mark.asyncio
    async def test_rag_chat_collect_empty_answer(
        self, chat_service, mock_api_keys, mock_sse_events
    ):
        """测试空回答"""
        events = [
            {"event": "message_end", "conversation_id": "conv-123", "metadata": {}}
        ]
        
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(events)
            
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="测试",
                user="test-user"
            )
            
            assert answer == ""
            assert conv_id == "conv-123"
            assert citations is None
    
    @pytest.mark.asyncio
    async def test_rag_chat_with_inputs(
        self, chat_service, mock_api_keys, sample_chat_events, mock_sse_events
    ):
        """测试带额外输入参数的RAG问答"""
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events)
            
            collected_events = []
            async for event in chat_service.rag_chat_stream(
                api_key=mock_api_keys["chat"],
                query="测试问题",
                user="test-user",
                inputs={"dataset_ids": ["dataset-123", "dataset-456"]}
            ):
                collected_events.append(event)
            
            # 验证inputs被传递
            call_args = mock_stream.call_args
            assert "dataset_ids" in call_args[1]["json_body"]["inputs"]
            assert len(call_args[1]["json_body"]["inputs"]["dataset_ids"]) == 2
    
    @pytest.mark.asyncio
    async def test_rag_chat_with_knowledge_base_retrieval(
        self, chat_service, mock_api_keys, sample_chat_events_with_retrieval, mock_sse_events
    ):
        """测试RAG问答时检查知识库检索结果"""
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events_with_retrieval)
            
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="什么是数据分类分级？",
                user="test-user"
            )
            
            # 验证回答内容
            assert "根据知识库中的" in answer
            assert "《数据安全法》规定" in answer
            
            # 验证知识库检索结果
            assert citations is not None
            assert len(citations) == 2
            
            # 验证第一个引用来源
            first_citation = citations[0]
            assert first_citation["dataset_id"] == "dataset-123"
            assert first_citation["dataset_name"] == "政策法规知识库"
            assert first_citation["document_name"] == "数据安全法.pdf"
            assert first_citation["score"] == 0.95
            assert "第二十一条" in first_citation["content"]
            
            # 验证第二个引用来源
            second_citation = citations[1]
            assert second_citation["dataset_id"] == "dataset-123"
            assert second_citation["document_name"] == "数据分类分级指南.pdf"
            assert second_citation["score"] == 0.87
            
            # 验证引用按相关性排序（score降序）
            assert citations[0]["score"] >= citations[1]["score"]
    
    @pytest.mark.asyncio
    async def test_rag_chat_no_retrieval_resources(
        self, chat_service, mock_api_keys, mock_sse_events
    ):
        """测试RAG问答无知识库检索结果的情况"""
        events = [
            {
                "event": "message",
                "conversation_id": "conv-123",
                "message_id": "msg-456",
                "answer": "抱歉，我没有找到相关信息"
            },
            {
                "event": "message_end",
                "conversation_id": "conv-123",
                "message_id": "msg-456",
                "metadata": {
                    "usage": {
                        "prompt_tokens": 50,
                        "completion_tokens": 20,
                        "total_tokens": 70
                    },
                    "retriever_resources": []  # 空的检索结果
                }
            }
        ]
        
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(events)
            
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="不存在的问题",
                user="test-user"
            )
            
            # 验证回答
            assert "抱歉" in answer
            
            # 验证没有检索结果
            assert citations == []
    
    @pytest.mark.asyncio
    async def test_rag_chat_verify_dataset_usage(
        self, chat_service, mock_api_keys, sample_chat_events_with_retrieval, mock_sse_events
    ):
        """测试验证指定知识库被正确使用"""
        target_dataset_id = "dataset-123"
        
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(sample_chat_events_with_retrieval)
            
            # 发送问答请求，指定知识库
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="数据分类分级相关规定",
                user="test-user",
                inputs={"dataset_ids": [target_dataset_id]}
            )
            
            # 验证请求参数中包含指定的知识库
            call_args = mock_stream.call_args
            request_body = call_args[1]["json_body"]
            assert "inputs" in request_body
            assert "dataset_ids" in request_body["inputs"]
            assert target_dataset_id in request_body["inputs"]["dataset_ids"]
            
            # 验证返回的引用来源都来自指定的知识库
            assert citations is not None
            for citation in citations:
                assert citation["dataset_id"] == target_dataset_id
                assert citation["dataset_name"] == "政策法规知识库"
    
    @pytest.mark.asyncio
    async def test_rag_chat_multiple_datasets(
        self, chat_service, mock_api_keys, mock_sse_events
    ):
        """测试使用多个知识库进行RAG问答"""
        events = [
            {
                "event": "message",
                "conversation_id": "conv-456",
                "message_id": "msg-789",
                "answer": "综合多个知识库的信息"
            },
            {
                "event": "message_end",
                "conversation_id": "conv-456",
                "message_id": "msg-789",
                "metadata": {
                    "usage": {"prompt_tokens": 200, "completion_tokens": 100, "total_tokens": 300},
                    "retriever_resources": [
                        {
                            "position": 1,
                            "dataset_id": "dataset-123",
                            "dataset_name": "政策法规知识库",
                            "document_id": "doc-1",
                            "document_name": "文档1.pdf",
                            "segment_id": "seg-1",
                            "score": 0.92,
                            "content": "内容1"
                        },
                        {
                            "position": 2,
                            "dataset_id": "dataset-456",
                            "dataset_name": "技术标准知识库",
                            "document_id": "doc-2",
                            "document_name": "文档2.pdf",
                            "segment_id": "seg-2",
                            "score": 0.88,
                            "content": "内容2"
                        }
                    ]
                }
            }
        ]
        
        with patch.object(chat_service._client, 'stream_post') as mock_stream:
            mock_stream.return_value = mock_sse_events(events)
            
            # 使用多个知识库
            answer, conv_id, citations = await chat_service.rag_chat_collect(
                api_key=mock_api_keys["chat"],
                query="综合查询",
                user="test-user",
                inputs={"dataset_ids": ["dataset-123", "dataset-456"]}
            )
            
            # 验证请求包含多个知识库
            call_args = mock_stream.call_args
            dataset_ids = call_args[1]["json_body"]["inputs"]["dataset_ids"]
            assert len(dataset_ids) == 2
            assert "dataset-123" in dataset_ids
            assert "dataset-456" in dataset_ids
            
            # 验证返回的引用来自不同知识库
            assert len(citations) == 2
            dataset_ids_in_citations = {c["dataset_id"] for c in citations}
            assert len(dataset_ids_in_citations) == 2
            assert "dataset-123" in dataset_ids_in_citations
            assert "dataset-456" in dataset_ids_in_citations


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
