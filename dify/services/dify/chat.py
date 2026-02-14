from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from .client import DifyClient


class ChatService:
    def __init__(self, client: DifyClient):
        self._client = client

    async def rag_chat_stream(
        self,
        *,
        api_key: str,
        query: str,
        user: str,
        conversation_id: Optional[str] = None,
        inputs: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Yield Dify SSE JSON events from /chat-messages.

        Consumers can:
        - forward `event=message` chunks to frontend
        - collect final `message_end.metadata.retriever_resources` for citations
        """
        url = "/chat-messages"
        body: Dict[str, Any] = {
            "query": query,
            "response_mode": "streaming",
            "user": user,
            "inputs": inputs or {},
        }
        if conversation_id:
            body["conversation_id"] = conversation_id

        async for event in self._client.stream_post(url, api_key=api_key, json_body=body):
            yield event

    async def rag_chat_collect(
        self,
        *,
        api_key: str,
        query: str,
        user: str,
        conversation_id: Optional[str] = None,
        inputs: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Optional[str], Optional[list]]:
        """Convenience wrapper: collect full answer + conversation_id + retriever_resources."""
        answer_parts: list[str] = []
        out_conv_id: Optional[str] = conversation_id
        retriever_resources: Optional[list] = None

        async for event in self.rag_chat_stream(
            api_key=api_key,
            query=query,
            user=user,
            conversation_id=conversation_id,
            inputs=inputs,
        ):
            ev = event.get("event")
            if ev == "message":
                chunk = event.get("answer")
                if isinstance(chunk, str):
                    answer_parts.append(chunk)
                if isinstance(event.get("conversation_id"), str):
                    out_conv_id = event.get("conversation_id")
            elif ev == "message_end":
                if isinstance(event.get("conversation_id"), str):
                    out_conv_id = event.get("conversation_id")
                meta = event.get("metadata") or {}
                retriever_resources = meta.get("retriever_resources")
            elif ev == "error":
                pass  # pragma: no cover

        return "".join(answer_parts), out_conv_id, retriever_resources

    async def list_conversations(
        self,
        *,
        api_key: str,
        user: str,
        last_id: Optional[str] = None,
        limit: int = 20,
        pinned: Optional[bool] = None,
    ) -> Dict[str, Any]:
        url = "/conversations"
        params: Dict[str, Any] = {"user": user, "limit": limit}
        if last_id:
            params["last_id"] = last_id
        if pinned is not None:
            params["pinned"] = pinned
        resp = await self._client.get(url, api_key=api_key, params=params)
        return resp.json()

    async def get_conversation_detail(
        self,
        *,
        api_key: str,
        conversation_id: str,
        user: str,
    ) -> Dict[str, Any]:
        url = f"/conversations/{conversation_id}"
        resp = await self._client.get(url, api_key=api_key, params={"user": user})
        return resp.json()

    async def rename_conversation(
        self,
        *,
        api_key: str,
        conversation_id: str,
        name: str,
        user: str,
    ) -> Dict[str, Any]:
        url = f"/conversations/{conversation_id}"
        body = {"name": name, "user": user}
        resp = await self._client.patch(url, api_key=api_key, json_body=body)
        return resp.json()

    async def delete_conversation(
        self,
        *,
        api_key: str,
        conversation_id: str,
        user: str,
    ) -> Dict[str, Any]:
        url = f"/conversations/{conversation_id}"
        resp = await self._client.delete(url, api_key=api_key, params={"user": user})
        return resp.json()

    async def list_messages(
        self,
        *,
        api_key: str,
        conversation_id: str,
        user: str,
        first_id: Optional[str] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        url = "/messages"
        params: Dict[str, Any] = {
            "conversation_id": conversation_id,
            "user": user,
            "limit": limit,
        }
        if first_id:
            params["first_id"] = first_id
        resp = await self._client.get(url, api_key=api_key, params=params)
        return resp.json()

    async def message_feedback(
        self,
        *,
        api_key: str,
        message_id: str,
        rating: str,
        user: str,
    ) -> Dict[str, Any]:
        url = f"/messages/{message_id}/feedbacks"
        body = {"rating": rating, "user": user}
        resp = await self._client.post(url, api_key=api_key, json_body=body)
        return resp.json()

    async def message_annotation(
        self,
        *,
        api_key: str,
        message_id: str,
        annotation: str,
        user: str,
    ) -> Dict[str, Any]:
        url = f"/messages/{message_id}/annotation"
        body = {"annotation": annotation, "user": user}
        resp = await self._client.post(url, api_key=api_key, json_body=body)
        return resp.json()

    async def get_suggested_questions(
        self,
        *,
        api_key: str,
        message_id: str,
    ) -> Dict[str, Any]:
        url = f"/messages/{message_id}/suggested"
        resp = await self._client.get(url, api_key=api_key)
        return resp.json()

    async def upload_chat_file(
        self,
        *,
        api_key: str,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        user: str,
    ) -> Dict[str, Any]:
        url = "/files/upload"
        files = {"file": (filename, file_bytes, content_type)}
        data = {"user": user}
        resp = await self._client.post(url, api_key=api_key, files=files, data=data)
        return resp.json()
