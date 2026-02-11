"""GovAI 中间件 — 请求日志 & 耗时统计"""

import time
import logging
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("govai.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    为每个请求打印：
      - 请求ID (X-Request-ID)
      - 方法 + 路径
      - 客户端IP
      - 响应状态码
      - 耗时(ms)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid4())[:8]
        request.state.request_id = request_id

        start = time.perf_counter()
        client_ip = request.client.host if request.client else "-"
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                "[%s] %s %s <- %s | 500 ERROR | %.1fms | %s",
                request_id, method, path, client_ip, elapsed, str(exc),
            )
            raise

        elapsed = (time.perf_counter() - start) * 1000
        status = response.status_code

        # 跳过健康检查等噪音
        if path not in ("/health", "/docs", "/redoc", "/openapi.json"):
            log_fn = logger.info if status < 400 else logger.warning
            log_fn(
                "[%s] %s %s <- %s | %d | %.1fms",
                request_id, method, path, client_ip, status, elapsed,
            )

        response.headers["X-Request-ID"] = request_id
        return response
