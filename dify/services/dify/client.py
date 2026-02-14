import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, Optional

import httpx
from .exceptions import (
    DifyError, DifyConnectionError, DifyTimeoutError,
    DifyRateLimitError, DifyStreamError
)

logger = logging.getLogger(__name__)

class DifyClient:
    """
    Dify HTTP 客户端。
    已根据 backend-front 规范优化：
    - 自动指数退避重试
    - GovAI 异常码映射
    - 统一的错误解析
    """

    def __init__(self, base_url: str = "http://localhost/v1", timeout: int = 120):
        self._base_url = base_url
        self._timeout = timeout
        self._max_retries = 3
        self._retry_delay = 1.0

    def _get_headers(self, api_key: str) -> dict:
        return {
            "Authorization": f"Bearer {api_key}",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        api_key: str,
        json_body: Optional[dict] = None,
        files: Optional[dict] = None,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
    ) -> httpx.Response:
        url = f"{self._base_url}{path}"
        headers = self._get_headers(api_key)
        
        for attempt in range(self._max_retries):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.request(
                        method,
                        url,
                        headers=headers,
                        json=json_body,
                        files=files,
                        params=params,
                        data=data,
                    )
                
                if resp.status_code < 400:
                    return resp
                
                # 处理频率限制
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 60))
                    if attempt < self._max_retries - 1:
                        await asyncio.sleep(retry_after)
                        continue
                    raise DifyRateLimitError(retry_after=retry_after)

                # 处理 5xx 错误重试
                if resp.status_code >= 500 and attempt < self._max_retries - 1:
                    await asyncio.sleep(self._retry_delay * (2 ** attempt))
                    continue

                # 4xx 错误直接抛出
                self._raise_for_status(resp)

            except httpx.TimeoutException:
                if attempt < self._max_retries - 1:
                    await asyncio.sleep(self._retry_delay * (2 ** attempt))
                    continue
                raise DifyTimeoutError(timeout=self._timeout)
            except httpx.RequestError as e:
                if attempt < self._max_retries - 1:
                    await asyncio.sleep(self._retry_delay * (2 ** attempt))
                    continue
                raise DifyConnectionError(str(e))
        
        raise DifyError("Max retries exceeded")

    def _raise_for_status(self, resp: httpx.Response):
        try:
            body = resp.json()
        except:
            body = {"message": resp.text}
        
        message = body.get("message", "Unknown Dify error")
        code = body.get("code", "unknown")
        
        raise DifyError(
            message=message,
            code=code,
            status_code=resp.status_code,
            raw_response=body
        )

    async def get(self, path: str, api_key: str, **kwargs):
        return await self._request("GET", path, api_key=api_key, **kwargs)

    async def post(self, path: str, api_key: str, **kwargs):
        return await self._request("POST", path, api_key=api_key, **kwargs)

    async def delete(self, path: str, api_key: str, **kwargs):
        return await self._request("DELETE", path, api_key=api_key, **kwargs)

    async def patch(self, path: str, api_key: str, **kwargs):
        return await self._request("PATCH", path, api_key=api_key, **kwargs)

    async def stream_post(self, path: str, api_key: str, json_body: dict) -> AsyncGenerator[dict, None]:
        url = f"{self._base_url}{path}"
        headers = self._get_headers(api_key)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", url, headers=headers, json=json_body) as resp:
                    if resp.status_code >= 400:
                        self._raise_for_status(resp)
                    
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]": break
                        try:
                            yield json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            raise DifyStreamError(str(e))
