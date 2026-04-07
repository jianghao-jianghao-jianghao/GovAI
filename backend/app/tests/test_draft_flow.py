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

    def scalar_one(self):
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


class _FakeDifyService:
    def __init__(self):
        self.calls = []

    async def run_doc_draft_stream(
        self,
        title,
        outline,
        doc_type,
        template_content="",
        kb_texts="",
        user_instruction="",
        file_bytes=None,
        file_name="",
        conversation_id="",
    ):
        self.calls.append(
            {
                "title": title,
                "outline": outline,
                "doc_type": doc_type,
                "user_instruction": user_instruction,
                "conversation_id": conversation_id,
            }
        )

        instruction = user_instruction or ""
        if "只生成文档的大纲结构" in instruction:
            outline_text = (
                "# 关于申请专项经费的请示\n\n"
                "## 一、申请依据\n"
                "- 项目推进需要专项经费支持\n\n"
                "## 二、经费安排\n"
                "- 用于设备采购和系统升级\n"
            )
            yield SSEEvent(event="text_chunk", data={"text": outline_text})
            yield SSEEvent(
                event="message_end",
                data={"full_text": outline_text, "usage": {"completion_tokens": 64}},
            )
            return

        full_text = (
            "# 关于申请专项经费的请示\n\n"
            "市财政局：\n\n"
            "为保障重点项目顺利推进，现申请专项经费支持。\n\n"
            "一、申请事项\n\n"
            "申请专项经费100万元，用于设备采购和系统升级。\n\n"
            "特此请示。\n\n"
            "XX单位\n\n"
            "2026年4月6日"
        )
        yield SSEEvent(event="text_chunk", data={"text": full_text})
        yield SSEEvent(
            event="message_end",
            data={"full_text": full_text, "usage": {"completion_tokens": 128}},
        )


class DraftFlowRegressionTest(unittest.IsolatedAsyncioTestCase):
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
            title="新建公文",
            category="doc",
            doc_type="official",
            status="unfilled",
            content="",
            visibility="private",
            urgency="normal",
            security="internal",
        )

    async def _collect_events(self, response, timeline=None):
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
            event = json.loads(payload)
            events.append(event)
            if timeline is not None and event.get("type"):
                timeline.append(f"event:{event['type']}")
        return events

    def _safe_update_stub(self, doc, timeline=None):
        async def _fake_safe_update_doc(doc_id, updates=None, **_kwargs):
            self.assertEqual(doc_id, doc.id)
            if updates:
                if timeline is not None:
                    timeline.append("save:update")
                for key, value in updates.items():
                    setattr(doc, key, value)
            elif _kwargs.get("save_version_before") and timeline is not None:
                timeline.append("save:version")
            return doc.content or ""

        return _fake_safe_update_doc

    async def _run_request(self, body):
        user = self._make_user()
        doc = self._make_doc(user.id)
        fake_db = _FakeDB(doc)
        fake_redis = _FakeRedis()
        fake_dify = _FakeDifyService()
        timeline = []

        async def _fake_record_usage(**_kwargs):
            return None

        with (
            patch.object(documents, "get_redis", return_value=fake_redis),
            patch.object(documents, "get_dify_service", return_value=fake_dify),
            patch.object(documents, "_safe_update_doc", new=self._safe_update_stub(doc, timeline)),
            patch.object(documents, "record_usage", new=_fake_record_usage),
        ):
            response = await documents.ai_process_document(
                doc_id=doc.id,
                body=body,
                request=SimpleNamespace(),
                current_user=user,
                db=fake_db,
            )
            events = await self._collect_events(response, timeline)

        return doc, fake_dify, events, timeline

    async def test_new_draft_generates_full_content_without_outline_roundtrip(self):
        body = documents.AiProcessRequest(
            stage="draft",
            user_instruction="请起草一份关于申请专项经费的请示",
        )

        doc, fake_dify, events, timeline = await self._run_request(body)
        event_types = [event["type"] for event in events]

        self.assertNotIn("outline", event_types)
        self.assertIn("done", event_types)
        self.assertIn("structured_paragraph", event_types)
        self.assertTrue(doc.content.strip())
        self.assertTrue(doc.formatted_paragraphs)
        persisted = json.loads(doc.formatted_paragraphs)
        self.assertGreater(len(persisted), 0)
        self.assertEqual(persisted[0]["style_type"], "title")
        self.assertIn("申请专项经费100万元", doc.content)
        self.assertEqual(len(fake_dify.calls), 1)
        self.assertNotIn("只生成文档的大纲结构", fake_dify.calls[0]["user_instruction"])
        self.assertLess(timeline.index("save:update"), timeline.index("event:done"))
        self.assertLess(timeline.index("save:version"), timeline.index("event:done"))

    async def test_confirmed_outline_still_expands_to_full_content(self):
        body = documents.AiProcessRequest(
            stage="draft",
            user_instruction="请根据确认后的结构展开正文",
            confirmed_outline="## 一、申请事项\n- 申请专项经费100万元",
        )

        doc, fake_dify, events, _timeline = await self._run_request(body)
        event_types = [event["type"] for event in events]

        self.assertNotIn("outline", event_types)
        self.assertIn("done", event_types)
        self.assertTrue(doc.content.strip())
        self.assertTrue(doc.formatted_paragraphs)
        self.assertIn("已确认的文档大纲", fake_dify.calls[0]["user_instruction"])
        self.assertIn("一、申请事项", fake_dify.calls[0]["user_instruction"])


if __name__ == "__main__":
    unittest.main()
