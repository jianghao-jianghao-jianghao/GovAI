"""
Dify API 集成模块

提供 Dify 平台的 Python 客户端封装，包括：
- Dataset API（知识库管理）
- Workflow API（工作流执行）
- Chat API（RAG 对话）
"""

from .client import DifyClient
from .dataset import DatasetService
from .workflow import WorkflowService
from .chat import ChatService
from .factory import DifyServiceFactory, create_dify_service
from .exceptions import (
    DifyError,
    DifyConnectionError,
    DifyTimeoutError,
    DifyRateLimitError,
    DifyStreamError,
)

__all__ = [
    "DifyClient",
    "DifyError",
    "DifyConnectionError",
    "DifyTimeoutError",
    "DifyRateLimitError",
    "DifyStreamError",
    "DatasetService",
    "WorkflowService",
    "ChatService",
    "DifyServiceFactory",
    "create_dify_service",
]
