"""
Pytest 配置文件
提供测试fixtures和配置
"""
import sys
import os
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import pytest
from dotenv import load_dotenv
from unittest.mock import AsyncMock, MagicMock

# 加载环境变量
load_dotenv()


@pytest.fixture
def mock_api_keys():
    """Mock API Keys"""
    return {
        "dataset": "dataset-test-key",
        "doc_draft": "app-doc-draft-key",
        "doc_check": "app-doc-check-key",
        "doc_optimize": "app-doc-optimize-key",
        "entity_extract": "app-entity-extract-key",
        "chat": "app-chat-key",
    }


@pytest.fixture
def test_base_url():
    """测试基础URL"""
    return "http://test-dify.local/v1"


@pytest.fixture
def mock_http_response():
    """创建Mock HTTP响应"""
    def _create_response(status_code=200, json_data=None, text=""):
        response = MagicMock()
        response.status_code = status_code
        response.json.return_value = json_data or {}
        response.text = text
        response.headers = {}
        return response
    return _create_response


@pytest.fixture
def mock_sse_events():
    """创建Mock SSE事件流"""
    def _create_events(events):
        async def _generator():
            for event in events:
                yield event
        return _generator()
    return _create_events


@pytest.fixture
def sample_dataset_response():
    """示例数据集响应"""
    return {
        "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
        "name": "测试知识库",
        "description": "测试描述",
        "provider": "vendor",
        "permission": "only_me",
        "data_source_type": None,
        "indexing_technique": "high_quality",
        "app_count": 0,
        "document_count": 0,
        "word_count": 0,
        "created_by": "",
        "created_at": 1695636173,
        "updated_by": "",
        "updated_at": 1695636173
    }


@pytest.fixture
def sample_document_response():
    """示例文档响应"""
    return {
        "document": {
            "id": "a8c6c36f-9f5d-4d7a-8472-f5d7b75d71d2",
            "position": 1,
            "data_source_type": "upload_file",
            "name": "test.txt",
            "created_from": "api",
            "created_at": 1695308667,
            "tokens": 0,
            "indexing_status": "waiting",
            "error": None,
            "enabled": True,
            "disabled_at": None,
            "disabled_by": None,
            "archived": False
        },
        "batch": "20230921150427533684"
    }


@pytest.fixture
def sample_workflow_response():
    """示例工作流响应"""
    return {
        "workflow_run_id": "wfr-d290f1ee-6c54",
        "task_id": "task-a8c6c36f-9f5d",
        "data": {
            "id": "wfr-d290f1ee-6c54",
            "workflow_id": "wf-123",
            "status": "succeeded",
            "outputs": {
                "generated_text": "关于加强数据安全管理的通知...",
                "citations": [],
                "quality_score": 85
            },
            "error": None,
            "elapsed_time": 12.5,
            "total_tokens": 1500,
            "total_steps": 3,
            "created_at": 1695636173,
            "finished_at": 1695636185
        }
    }


@pytest.fixture
def sample_chat_events():
    """示例聊天事件"""
    return [
        {
            "event": "message",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "answer": "数据分类分级是指"
        },
        {
            "event": "message",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "answer": "根据数据的重要性"
        },
        {
            "event": "message_end",
            "conversation_id": "conv-123",
            "message_id": "msg-456",
            "metadata": {
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150
                },
                "retriever_resources": [
                    {
                        "position": 1,
                        "dataset_id": "dataset-123",
                        "dataset_name": "政策法规",
                        "document_id": "doc-456",
                        "document_name": "数据安全法.pdf",
                        "segment_id": "seg-789",
                        "score": 0.95,
                        "content": "数据分类分级是指..."
                    }
                ]
            }
        }
    ]


@pytest.fixture
def real_api_keys():
    """真实API Keys (用于集成测试)"""
    return {
        "base_url": os.getenv("DIFY_BASE_URL", "https://api.dify.ai/v1"),
        "dataset": os.getenv("DIFY_DATASET_API_KEY"),
        "doc_draft": os.getenv("DIFY_APP_DOC_DRAFT_KEY"),
        "doc_check": os.getenv("DIFY_APP_DOC_CHECK_KEY"),
        "doc_optimize": os.getenv("DIFY_APP_DOC_OPTIMIZE_KEY"),
        "entity_extract": os.getenv("DIFY_APP_ENTITY_EXTRACT_KEY"),
        "chat": os.getenv("DIFY_APP_CHAT_KEY"),
    }


def pytest_configure(config):
    """Pytest配置"""
    config.addinivalue_line(
        "markers", "integration: 标记为集成测试 (需要真实API Key)"
    )
    config.addinivalue_line(
        "markers", "unit: 标记为单元测试 (使用Mock)"
    )
