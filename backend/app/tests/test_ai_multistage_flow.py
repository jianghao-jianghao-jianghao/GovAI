import json
import unittest
import uuid
from contextlib import ExitStack
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

    async def execute(self, _stmt):
        return _FakeResult(self.doc)

    async def close(self):
        return None


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
                "stage": "draft",
                "title": title,
                "outline": outline,
                "doc_type": doc_type,
                "user_instruction": user_instruction,
            }
        )
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

    async def run_doc_review_stream(self, content: str, user_instruction: str = ""):
        self.calls.append(
            {
                "stage": "review",
                "content": content,
                "user_instruction": user_instruction,
            }
        )
        suggestion = {
            "category": "wording",
            "severity": "info",
            "original": "专项经费支持",
            "suggestion": "专项经费保障",
            "reason": "表述更正式",
            "context": "为保障重点项目顺利推进，现申请专项经费支持。",
        }
        yield SSEEvent(event="review_suggestion", data=suggestion)
        yield SSEEvent(
            event="review_result",
            data={
                "suggestions": [suggestion],
                "summary": "发现 1 处可优化表述",
                "usage": {"completion_tokens": 32},
            },
        )

    async def run_doc_format_stream(
        self,
        content: str,
        doc_type: str = "official",
        user_instruction: str = "",
        file_bytes: bytes | None = None,
        file_name: str = "",
        conversation_id: str = "",
    ):
        self.calls.append(
            {
                "stage": "format",
                "content": content,
                "doc_type": doc_type,
                "user_instruction": user_instruction,
                "conversation_id": conversation_id,
            }
        )
        yield SSEEvent(
            event="message_end",
            data={"full_text": '{"paragraphs":[]}', "usage": {"completion_tokens": 16}},
        )


class AiMultistageFlowRegressionTest(unittest.IsolatedAsyncioTestCase):
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

    def _safe_update_stub(self, doc, timeline):
        async def _fake_safe_update_doc(doc_id, updates=None, **kwargs):
            self.assertEqual(doc_id, doc.id)
            if kwargs.get("save_version_before"):
                timeline.append("save:version")
            if updates:
                timeline.append("save:update")
                for key, value in updates.items():
                    setattr(doc, key, value)
            return doc.content or ""

        return _fake_safe_update_doc

    async def _run_stage(self, *, doc, user, db, redis, dify, body, timeline, extra_patches=()):
        async def _fake_record_usage(**_kwargs):
            return None

        with ExitStack() as stack:
            stack.enter_context(patch.object(documents, "get_redis", return_value=redis))
            stack.enter_context(patch.object(documents, "get_dify_service", return_value=dify))
            stack.enter_context(
                patch.object(documents, "_safe_update_doc", new=self._safe_update_stub(doc, timeline))
            )
            stack.enter_context(patch.object(documents, "record_usage", new=_fake_record_usage))
            for ctx in extra_patches:
                stack.enter_context(ctx)
            response = await documents.ai_process_document(
                doc_id=doc.id,
                body=body,
                request=SimpleNamespace(),
                current_user=user,
                db=db,
            )
            return await self._collect_events(response, timeline)

    async def test_ai_process_multistage_flow_persists_before_done(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        db = _FakeDB(doc)
        redis = _FakeRedis()
        dify = _FakeDifyService()

        draft_timeline: list[str] = []
        draft_events = await self._run_stage(
            doc=doc,
            user=user,
            db=db,
            redis=redis,
            dify=dify,
            body=documents.AiProcessRequest(
                stage="draft",
                user_instruction="请起草一份关于申请专项经费的请示",
            ),
            timeline=draft_timeline,
        )

        self.assertEqual(doc.status, "draft")
        self.assertTrue(doc.content.strip())
        self.assertTrue(doc.formatted_paragraphs)
        self.assertIn("done", [event["type"] for event in draft_events])
        self.assertLess(draft_timeline.index("save:update"), draft_timeline.index("event:done"))
        self.assertLess(draft_timeline.index("save:version"), draft_timeline.index("event:done"))

        review_timeline: list[str] = []
        review_events = await self._run_stage(
            doc=doc,
            user=user,
            db=db,
            redis=redis,
            dify=dify,
            body=documents.AiProcessRequest(
                stage="review",
                user_instruction="请审查并指出可优化表述",
            ),
            timeline=review_timeline,
        )

        self.assertEqual(doc.status, "reviewed")
        self.assertIn("review_suggestion", [event["type"] for event in review_events])
        self.assertIn("review_suggestions", [event["type"] for event in review_events])
        self.assertLess(review_timeline.index("save:version"), review_timeline.index("save:update"))
        self.assertLess(review_timeline.index("save:update"), review_timeline.index("event:done"))

        def _fake_rules_format_paragraphs(paras, _doc_type, custom_template=None):
            return ([{**dict(p), "_rule_formatted": True} for p in paras], [])

        format_timeline: list[str] = []
        format_events = await self._run_stage(
            doc=doc,
            user=user,
            db=db,
            redis=redis,
            dify=dify,
            body=documents.AiProcessRequest(stage="format"),
            timeline=format_timeline,
            extra_patches=(
                patch.object(documents, "_rules_format_paragraphs", new=_fake_rules_format_paragraphs),
            ),
        )

        self.assertEqual(doc.status, "formatted")
        self.assertIn("format_stats", [event["type"] for event in format_events])
        self.assertIn("done", [event["type"] for event in format_events])
        self.assertTrue(doc.formatted_paragraphs)
        formatted = json.loads(doc.formatted_paragraphs)
        self.assertGreater(len(formatted), 0)
        self.assertEqual(formatted[0]["style_type"], "title")
        self.assertLess(format_timeline.index("save:version"), format_timeline.index("save:update"))
        self.assertLess(format_timeline.index("save:update"), format_timeline.index("event:done"))

        self.assertEqual([call["stage"] for call in dify.calls[:2]], ["draft", "review"])
        self.assertIn("专项经费支持", dify.calls[1]["content"])
        if len(dify.calls) > 2:
            self.assertEqual(dify.calls[2]["stage"], "format")
            self.assertEqual(dify.calls[2]["doc_type"], doc.doc_type)


if __name__ == "__main__":
    unittest.main()
