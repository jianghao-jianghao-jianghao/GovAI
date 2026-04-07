import asyncio
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api import documents
from app.core.response import ErrorCode
from app.models.document import Document
from app.models.user import User


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
    def __init__(self, *, set_result=True, lock_value="busy"):
        self.set_result = set_result
        self.lock_value = lock_value
        self.expire_calls = []
        self.delete_calls = []
        self._store = {}

    async def set(self, key, value, nx=False, ex=None):
        if self.set_result:
            self._store[key] = value
            return True
        self._store[key] = self.lock_value
        return False

    async def get(self, key):
        return self._store.get(key)

    async def delete(self, key):
        self.delete_calls.append(key)
        return 1 if self._store.pop(key, None) is not None else 0

    async def expire(self, key, ttl):
        self.expire_calls.append((key, ttl))
        return key in self._store


class AiProcessGuardRegressionTest(unittest.IsolatedAsyncioTestCase):
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
            status="unfilled",
            content="",
            visibility="private",
            urgency="normal",
            security="internal",
        )

    async def test_ai_process_invalid_stage_returns_http_400_json(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        db = _FakeDB(doc)

        response = await documents.ai_process_document(
            doc_id=doc.id,
            body=documents.AiProcessRequest(stage="unknown"),
            request=SimpleNamespace(),
            current_user=user,
            db=db,
        )

        self.assertEqual(response.status_code, 400)
        payload = json.loads(response.body)
        self.assertEqual(payload["code"], ErrorCode.PARAM_INVALID)

    async def test_ai_process_lock_conflict_returns_http_409_json(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        db = _FakeDB(doc)
        redis = _FakeRedis(set_result=False, lock_value="other-user:draft")

        with patch.object(documents, "get_redis", return_value=redis):
            response = await documents.ai_process_document(
                doc_id=doc.id,
                body=documents.AiProcessRequest(stage="draft"),
                request=SimpleNamespace(),
                current_user=user,
                db=db,
            )

        self.assertEqual(response.status_code, 409)
        payload = json.loads(response.body)
        self.assertEqual(payload["code"], ErrorCode.CONFLICT)
        self.assertIn("other-user:draft", payload["message"])

    async def test_renew_ai_lock_extends_owned_lock(self):
        redis = _FakeRedis()
        redis._store["doc_ai_lock:test"] = "user-1:draft"
        sleeps = [None, asyncio.CancelledError()]

        async def _fake_sleep(_seconds):
            outcome = sleeps.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome

        with patch("app.api.documents.asyncio.sleep", new=_fake_sleep):
            with self.assertRaises(asyncio.CancelledError):
                await documents._renew_ai_lock(
                    redis,
                    "doc_ai_lock:test",
                    "user-1:draft",
                    ttl=120,
                    interval=1,
                )

        self.assertEqual(redis.expire_calls, [("doc_ai_lock:test", 120)])

    async def test_renew_ai_lock_stops_when_lock_owner_changes(self):
        redis = _FakeRedis()
        redis._store["doc_ai_lock:test"] = "other-user:draft"

        async def _fake_sleep(_seconds):
            return None

        with patch("app.api.documents.asyncio.sleep", new=_fake_sleep):
            await documents._renew_ai_lock(
                redis,
                "doc_ai_lock:test",
                "user-1:draft",
                ttl=120,
                interval=1,
            )

        self.assertEqual(redis.expire_calls, [])


if __name__ == "__main__":
    unittest.main()
