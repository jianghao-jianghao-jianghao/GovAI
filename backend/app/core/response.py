"""统一响应模型与错误码"""

from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


# ---- 错误码 ----
class ErrorCode:
    SUCCESS = 0
    PARAM_INVALID = 1001
    NOT_FOUND = 1002
    CONFLICT = 1003
    AUTH_FAILED = 2001
    TOKEN_EXPIRED = 2002
    TOKEN_INVALID = 2003
    ACCOUNT_DISABLED = 2004
    PERMISSION_DENIED = 3001
    DIFY_ERROR = 4001
    FILE_UPLOAD_ERROR = 4002
    SSE_ERROR = 4003
    SENSITIVE_BLOCK = 5001
    SENSITIVE_WARN = 5002
    INTERNAL_ERROR = 9999


# ---- 统一响应 ----
class ApiResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Any = None


class PaginatedData(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


def success(data: Any = None, message: str = "success") -> dict:
    """成功响应"""
    return {"code": 0, "message": message, "data": data}


def error(code: int, message: str, data: Any = None) -> dict:
    """错误响应"""
    return {"code": code, "message": message, "data": data}
