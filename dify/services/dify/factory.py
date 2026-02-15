"""
Dify服务工厂
用于创建和管理Dify服务实例
"""
from typing import Optional
from .client import DifyClient
from .workflow import WorkflowService
from .chat import ChatService
from .dataset import DatasetService


class DifyServiceFactory:
    """Dify服务工厂类"""
    
    def __init__(self, base_url: str, timeout: int = 120):
        """
        初始化Dify服务工厂
        
        Args:
            base_url: Dify API基础URL
            timeout: 请求超时时间(秒)
        """
        self._client = DifyClient(base_url=base_url, timeout=timeout)
        self._workflow_service: Optional[WorkflowService] = None
        self._chat_service: Optional[ChatService] = None
        self._dataset_service: Optional[DatasetService] = None
    
    @property
    def workflow(self) -> WorkflowService:
        """获取工作流服务实例"""
        if self._workflow_service is None:
            self._workflow_service = WorkflowService(self._client)
        return self._workflow_service
    
    @property
    def chat(self) -> ChatService:
        """获取聊天服务实例"""
        if self._chat_service is None:
            self._chat_service = ChatService(self._client)
        return self._chat_service
    
    @property
    def dataset(self) -> DatasetService:
        """获取数据集服务实例"""
        if self._dataset_service is None:
            self._dataset_service = DatasetService(self._client)
        return self._dataset_service


def create_dify_service(base_url: str = "http://host.docker.internal:19090/v1", timeout: int = 120) -> DifyServiceFactory:
    """
    创建Dify服务工厂实例
    
    Args:
        base_url: Dify API基础URL
        timeout: 请求超时时间(秒)
    
    Returns:
        DifyServiceFactory实例
    """
    return DifyServiceFactory(base_url=base_url, timeout=timeout)
