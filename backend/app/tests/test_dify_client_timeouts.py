import asyncio
import json
import unittest
from unittest.mock import patch

from app.services.dify.client import RealDifyService


class _FakeStreamResponse:
    status_code = 200

    async def aiter_text(self):
        if False:
            yield ""

    async def aiter_lines(self):
        yield 'data: {"event":"message","answer":"部分内容"}'


class _FakeStreamContext:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self.response

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        self.response = _FakeStreamResponse()

    def stream(self, *args, **kwargs):
        return _FakeStreamContext(self.response)

    async def aclose(self):
        return None


class _ChunkedStreamResponse:
    status_code = 200

    def __init__(self, payload_lines):
        self.payload_lines = payload_lines

    async def aiter_text(self):
        if False:
            yield ""

    async def aiter_lines(self):
        for line in self.payload_lines:
            yield line


class _ChunkedAsyncClient:
    def __init__(self, *args, **kwargs):
        self.response = _ChunkedStreamResponse(
            [
                'data: {"event":"message","answer":"{\\"paragraphs\\":["}',
                'data: {"event":"message","answer":"{\\"text\\":\\"第一段\\""}',
                'data: {"event":"message","answer":",\\"style_type\\":\\"body\\""}',
                'data: {"event":"message","answer":"},{"}',
                'data: {"event":"message","answer":"\\"text\\":\\"第二段\\""}',
                'data: {"event":"message","answer":",\\"style_type\\":\\"body\\""}',
                'data: {"event":"message","answer":"}]"}',
                'data: {"event":"message","answer":"}"}',
                'data: {"event":"message","answer":" "}',
                'data: {"event":"message","answer":" "}',
                'data: {"event":"message_end","metadata":{}}',
            ]
        )

    def stream(self, *args, **kwargs):
        return _FakeStreamContext(self.response)

    async def aclose(self):
        return None


class _ReviewAsyncClient:
    def __init__(self, *args, **kwargs):
        payload = json.dumps(
            {
                "suggestions": [
                    {
                        "category": "grammar",
                        "severity": "warning",
                        "original": "存在表述问题",
                        "suggestion": "调整为正式表述",
                        "reason": "更符合公文语气",
                        "context": "测试段落",
                        "paragraph_index": 0,
                    }
                ],
                "summary": "发现 1 处表达问题",
            },
            ensure_ascii=False,
        )
        self.response = _ChunkedStreamResponse(
            [
                f'data: {json.dumps({"event": "message", "answer": payload, "reasoning_content": "先检查语气和时效性"}, ensure_ascii=False)}',
                'data: {"event":"message_end","metadata":{"usage":{"completion_tokens":12}}}',
            ]
        )

    def stream(self, *args, **kwargs):
        return _FakeStreamContext(self.response)

    async def aclose(self):
        return None


class _FormatSuggestAsyncClient:
    def __init__(self, *args, **kwargs):
        payload = json.dumps(
            {
                "doc_type": "official",
                "doc_type_label": "公文",
                "structure_analysis": {"missing_elements": []},
                "summary": {
                    "overall": "存在 1 处排版问题",
                    "top_issues": ["标题未居中"],
                    "recommended_preset": "标准公文",
                },
                "suggestions": [
                    {
                        "category": "alignment",
                        "target": "标题",
                        "current": "左对齐",
                        "suggestion": "居中",
                        "standard": "GB/T 9704",
                        "priority": "high",
                    }
                ],
            },
            ensure_ascii=False,
        )
        self.response = _ChunkedStreamResponse(
            [
                f'data: {json.dumps({"event": "message", "answer": payload, "reasoning_content": "先识别文档类型和结构"}, ensure_ascii=False)}',
                'data: {"event":"message_end","metadata":{"usage":{"completion_tokens":9}}}',
            ]
        )

    def stream(self, *args, **kwargs):
        return _FakeStreamContext(self.response)

    async def aclose(self):
        return None


class DifyClientTimeoutRegressionTest(unittest.IsolatedAsyncioTestCase):
    async def test_draft_stream_timeout_emits_error_instead_of_message_end(self):
        wait_for_calls = {"count": 0}

        async def _fake_wait_for(coro, timeout):
            wait_for_calls["count"] += 1
            if wait_for_calls["count"] == 1:
                return await coro
            raise asyncio.TimeoutError()

        with (
            patch("app.services.dify.client.httpx.AsyncClient", new=_FakeAsyncClient),
            patch("app.services.dify.client.asyncio.wait_for", new=_fake_wait_for),
        ):
            service = RealDifyService()
            events = []
            async for event in service.run_doc_draft_stream(
                title="测试公文",
                outline="",
                doc_type="official",
                user_instruction="请起草",
            ):
                events.append(event)
            await service.close()

        event_names = [event.event for event in events]
        self.assertIn("text_chunk", event_names)
        self.assertIn("error", event_names)
        self.assertNotIn("message_end", event_names)

    async def test_incremental_parse_only_runs_when_new_chunk_can_close_structure(self):
        with patch("app.services.dify.client.httpx.AsyncClient", new=_ChunkedAsyncClient):
            service = RealDifyService()
            parse_inputs = []

            def _fake_incremental_parse(accumulated, already_sent):
                parse_inputs.append((accumulated, already_sent))
                return []

            with (
                patch.object(service, "_try_parse_incremental_paragraphs", side_effect=_fake_incremental_parse),
                patch.object(service, "_parse_structured_paragraphs", return_value=[]),
            ):
                events = []
                async for event in service.run_doc_format_stream(
                    content="测试内容",
                    doc_type="official",
                    user_instruction="请排版",
                ):
                    events.append(event)
            await service.close()

        self.assertEqual(len(parse_inputs), 3)
        self.assertLess(len(parse_inputs[0][0]), len(parse_inputs[1][0]))
        self.assertLess(len(parse_inputs[1][0]), len(parse_inputs[2][0]))
        self.assertIn("第二段", parse_inputs[-1][0])
        progress_messages = [event.data.get("message", "") for event in events if event.event == "progress"]
        self.assertTrue(any("字符" in message for message in progress_messages))

    async def test_review_stream_emits_reasoning_incremental_suggestion_and_summary(self):
        with patch("app.services.dify.client.httpx.AsyncClient", new=_ReviewAsyncClient):
            service = RealDifyService()
            service.doc_optimize_key = "test-review-key"
            events = []
            async for event in service.run_doc_review_stream(
                content="测试公文内容",
                user_instruction="请重点检查表达是否正式",
            ):
                events.append(event)
            await service.close()

        event_names = [event.event for event in events]
        self.assertIn("reasoning", event_names)
        self.assertIn("review_suggestion", event_names)
        self.assertIn("review_result", event_names)
        review_result = next(event for event in events if event.event == "review_result")
        self.assertEqual(review_result.data["summary"], "发现 1 处表达问题")
        self.assertEqual(len(review_result.data["suggestions"]), 1)

    async def test_format_suggest_stream_emits_reasoning_suggestions_and_result(self):
        with patch("app.services.dify.client.httpx.AsyncClient", new=_FormatSuggestAsyncClient):
            service = RealDifyService()
            service.format_suggest_key = "test-format-suggest-key"
            events = []
            async for event in service.run_format_suggest_stream(
                content="测试公文内容",
                user_instruction="请分析版式问题",
            ):
                events.append(event)
            await service.close()

        event_names = [event.event for event in events]
        self.assertIn("reasoning", event_names)
        self.assertIn("format_suggestion", event_names)
        self.assertIn("format_suggest_result", event_names)
        suggest_result = next(event for event in events if event.event == "format_suggest_result")
        self.assertEqual(suggest_result.data["doc_type_label"], "公文")
        self.assertEqual(suggest_result.data["summary"]["recommended_preset"], "标准公文")
        self.assertEqual(len(suggest_result.data["suggestions"]), 1)


if __name__ == "__main__":
    unittest.main()
