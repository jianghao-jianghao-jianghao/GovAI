import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api import documents
from app.core.response import ErrorCode
from app.models.document import Document, DocumentVersion
from app.models.user import User


class _FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RoutingDB:
    def __init__(self, resolver):
        self._resolver = resolver
        self.flushed = False

    async def execute(self, stmt):
        return self._resolver(stmt)

    async def flush(self):
        self.flushed = True


class _FakeRedis:
    def __init__(self, store=None):
        self._store = dict(store or {})

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    async def get(self, key):
        return self._store.get(key)

    async def delete(self, key):
        return 1 if self._store.pop(key, None) is not None else 0


class DocumentWorkflowRulesRegressionTest(unittest.IsolatedAsyncioTestCase):
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
            content="正文",
            visibility="private",
            urgency="normal",
            security="internal",
        )

    async def test_update_document_rejects_status_transition_via_generic_endpoint(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        db = _RoutingDB(lambda _stmt: _FakeScalarResult(doc))

        with patch.object(documents, "log_action", new=AsyncMock()):
            response = await documents.update_document(
                doc_id=doc.id,
                body=documents.DocumentUpdateRequest(status="archived"),
                request=SimpleNamespace(client=None),
                current_user=user,
                db=db,
            )

        self.assertEqual(response["code"], ErrorCode.PARAM_INVALID)
        self.assertEqual(doc.status, "draft")
        self.assertFalse(db.flushed)

    async def test_restore_version_conflicts_with_existing_ai_lock(self):
        user = self._make_user()
        doc = self._make_doc(user.id)
        version = DocumentVersion(
            id=uuid.uuid4(),
            document_id=doc.id,
            version_number=2,
            content="回退内容",
            created_by=user.id,
        )

        def _resolver(stmt):
            sql = str(stmt)
            if "FROM documents " in sql:
                return _FakeScalarResult(doc)
            if "FROM document_versions" in sql:
                return _FakeScalarResult(version)
            return _FakeScalarResult(None)

        db = _RoutingDB(_resolver)
        redis = _FakeRedis({f"doc_ai_lock:{doc.id}": "other-user:draft"})

        with (
            patch.object(documents, "get_redis", return_value=redis),
            patch.object(documents, "_save_version", new=AsyncMock()),
        ):
            response = await documents.restore_document_version(
                doc_id=doc.id,
                version_id=version.id,
                current_user=user,
                db=db,
            )

        self.assertEqual(response["code"], ErrorCode.CONFLICT)
        self.assertFalse(db.flushed)


if __name__ == "__main__":
    unittest.main()
