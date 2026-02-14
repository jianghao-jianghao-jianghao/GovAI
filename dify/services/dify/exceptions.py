from typing import Optional

class DifyError(Exception):
    """Dify API 调用基础异常，对齐后端 A 的 GovAI 错误码规范"""

    def __init__(
        self,
        message: str,
        code: str = "dify_error",
        status_code: int = 500,
        govai_code: int = 4001,
        raw_response: Optional[dict] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.govai_code = govai_code          # 映射到 GovAI 错误码
        self.raw_response = raw_response
        super().__init__(self.message)

class DifyConnectionError(DifyError):
    """网络连接异常"""
    def __init__(self, message: str = "Dify 服务连接失败"):
        super().__init__(message, code="connection_error", govai_code=4001)

class DifyTimeoutError(DifyError):
    """请求超时"""
    def __init__(self, message: str = "Dify 请求超时", timeout: int = 0):
        self.timeout = timeout
        super().__init__(message, code="timeout", govai_code=4001)

class DifyRateLimitError(DifyError):
    """请求频率限制 (HTTP 429)"""
    def __init__(self, message: str = "Dify 请求频率限制", retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(message, code="rate_limit", status_code=429, govai_code=4001)

class DifyFileError(DifyError):
    """文件相关异常（过大、格式不支持等）"""
    def __init__(self, message: str, code: str = "file_error"):
        super().__init__(message, code=code, status_code=400, govai_code=4002)

class DifyDatasetError(DifyError):
    """知识库相关异常"""
    def __init__(self, message: str, code: str = "dataset_error"):
        super().__init__(message, code=code, status_code=400, govai_code=4001)

class DifyWorkflowError(DifyError):
    """Workflow 执行异常"""
    def __init__(self, message: str, code: str = "workflow_error", task_id: str = ""):
        self.task_id = task_id
        super().__init__(message, code=code, govai_code=4001)

class DifyStreamError(DifyError):
    """SSE 流中断异常"""
    def __init__(self, message: str = "Dify SSE 流异常中断"):
        super().__init__(message, code="stream_error", govai_code=4003)
