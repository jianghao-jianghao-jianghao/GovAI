import json
import logging
import unittest
import uuid
from unittest.mock import patch

from app.api import documents
from app.models.document import Document
from app.models.user import User
from app.services.dify.base import SSEEvent


class _FakeFormatDifyService:
    def __init__(self):
        self.calls = []

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
                "content": content,
                "doc_type": doc_type,
                "user_instruction": user_instruction,
                "conversation_id": conversation_id,
            }
        )
        yield SSEEvent(
            event="structured_paragraph",
            data={"text": "关于申请专项经费的请示", "style_type": "title", "_index": 0},
        )
        yield SSEEvent(
            event="message_end",
            data={
                "full_text": '{"paragraphs":[{"_index":0,"style_type":"title","text":"关于申请专项经费的请示"}]}',
                "usage": {"completion_tokens": 16},
            },
        )


class AiFormatFlowRegressionTest(unittest.IsolatedAsyncioTestCase):
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
            status="draft",
            content="关于申请专项经费的请示",
            visibility="private",
            urgency="normal",
            security="internal",
        )

    def _safe_update_stub(self, doc):
        async def _fake_safe_update_doc(doc_id, updates=None, **_kwargs):
            self.assertEqual(doc_id, doc.id)
            if updates:
                for key, value in updates.items():
                    setattr(doc, key, value)
            return doc.content or ""

        return _fake_safe_update_doc

    async def test_format_stage_collects_partial_results_into_shared_buffer(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        dify = _FakeFormatDifyService()
        partial_paragraphs: list[dict] = []
        recorded_stages: list[str] = []
        usages: list[dict] = []

        def _fake_rules_format_paragraphs(paras, _doc_type, custom_template=None):
            formatted = [{**dict(p), "_rule_formatted": False} for p in paras]
            return formatted, [0]

        body = documents.AiProcessRequest(
            stage="format",
            existing_paragraphs=[{"text": "关于申请专项经费的请示", "style_type": "body"}],
        )

        with (
            patch.object(documents, "_safe_update_doc", new=self._safe_update_stub(doc)),
            patch.object(documents, "_rules_format_paragraphs", new=_fake_rules_format_paragraphs),
        ):
            events = [
                event
                async for event in documents._stream_ai_format_stage(
                    doc=doc,
                    body=body,
                    current_user=user,
                    dify=dify,
                    _sse=lambda data: data,
                    _capture_usage=usages.append,
                    _record_stage_usage=recorded_stages.append,
                    _logger=logging.getLogger("test_ai_format_flow"),
                    _compute_para_diff=lambda old_paras, new_paras: new_paras,
                    _partial_para_data=partial_paragraphs,
                )
            ]

        self.assertEqual(len(dify.calls), 1)
        self.assertTrue(partial_paragraphs)
        self.assertEqual(partial_paragraphs[0]["text"], "关于申请专项经费的请示")
        self.assertEqual(partial_paragraphs[0]["style_type"], "subtitle")
        self.assertEqual(doc.status, "formatted")
        self.assertTrue(doc.formatted_paragraphs)
        persisted = json.loads(doc.formatted_paragraphs)
        self.assertEqual(persisted[0]["style_type"], "subtitle")
        self.assertIn("format", recorded_stages)
        self.assertTrue(usages)
        self.assertIn("format_clear", [event["type"] for event in events])
        self.assertEqual(events[-1]["type"], "done")


if __name__ == "__main__":
    unittest.main()
