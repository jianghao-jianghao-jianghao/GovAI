import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from app.api import documents
from app.models.document import Document
from app.models.user import User
from app.services.dify.base import SSEEvent


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, doc):
        self.doc = doc
        self.closed = False

    async def execute(self, _stmt):
        return _FakeResult(self.doc)

    async def close(self):
        self.closed = True


class _FakeRedis:
    def __init__(self):
        self._store = {}

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    async def get(self, key):
        return self._store.get(key)

    async def delete(self, key):
        return 1 if self._store.pop(key, None) is not None else 0

    async def expire(self, key, ttl):
        return key in self._store


class _FakeDifyService:
    async def run_format_suggest_stream(self, content: str, user_instruction: str = ""):
        suggestion = {
            "category": "alignment",
            "target": "标题",
            "current": "左对齐",
            "suggestion": "居中",
            "standard": "公文标题应居中",
            "priority": "high",
        }
        yield SSEEvent(event="progress", data={"message": "分析中…"})
        yield SSEEvent(event="format_suggestion", data=suggestion)
        yield SSEEvent(
            event="format_suggest_result",
            data={
                "doc_type": "official",
                "suggestions": [suggestion],
                "summary": {"overall": "存在 1 处标题对齐问题"},
                "usage": {"completion_tokens": 8},
            },
        )


class AiFormatSuggestFlowRegressionTest(unittest.IsolatedAsyncioTestCase):
    def _make_user(self):
        return User(
            id=uuid.uuid4(),
            username="tester",
            password_hash="x",
            display_name="测试用户",
            status="active",
        )

    def _make_doc(self, creator_id):
        return Document(
            id=uuid.uuid4(),
            creator_id=creator_id,
            title="测试公文",
            category="doc",
            doc_type="official",
            status="draft",
            content="关于开展专项工作的通知\n\n请各部门认真落实。",
            visibility="private",
            urgency="normal",
            security="internal",
        )

    async def _collect_events(self, response):
        raw = ""
        async for chunk in response.body_iterator:
            raw += chunk.decode() if isinstance(chunk, bytes) else chunk

        events = []
        for line in raw.splitlines():
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if payload == "[DONE]":
                continue
            events.append(json.loads(payload))
        return events

    async def test_format_suggest_stream_returns_suggestions_and_preview_paragraphs(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        db = _FakeDB(doc)
        redis = _FakeRedis()
        dify = _FakeDifyService()

        async def _fake_record_usage(**_kwargs):
            return None

        with (
            patch.object(documents, "get_redis", return_value=redis),
            patch.object(documents, "get_dify_service", return_value=dify),
            patch.object(documents, "record_usage", new=_fake_record_usage),
        ):
            response = await documents.ai_process_document(
                doc_id=doc.id,
                body=documents.AiProcessRequest(
                    stage="format_suggest",
                    user_instruction="请分析这份文档的排版问题",
                    existing_paragraphs=[
                        {"text": "关于开展专项工作的通知", "style_type": "title"},
                        {"text": "请各部门认真落实。", "style_type": "body"},
                    ],
                ),
                request=SimpleNamespace(),
                current_user=user,
                db=db,
            )
            events = await self._collect_events(response)

        event_types = [event["type"] for event in events]
        self.assertIn("status", event_types)
        self.assertIn("format_suggestion", event_types)
        self.assertIn("format_suggest_result", event_types)
        self.assertIn("format_suggest_paragraphs", event_types)
        self.assertIn("done", event_types)


if __name__ == "__main__":
    unittest.main()
