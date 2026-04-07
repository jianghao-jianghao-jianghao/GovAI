import io
import json
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
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

    def scalar_one(self):
        return self._value


class _FakeListResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return self

    def all(self):
        return list(self._values)

    def scalar_one_or_none(self):
        return self._values[0] if self._values else None


class _RoutingDB:
    def __init__(self, resolver):
        self._resolver = resolver
        self.closed = False

    async def execute(self, stmt):
        return self._resolver(stmt)

    async def close(self):
        self.closed = True


class _FakeRedis:
    def __init__(self, store=None):
        self._store = dict(store or {})

    async def get(self, key):
        return self._store.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self._store:
            return False
        self._store[key] = value
        return True

    async def delete(self, key):
        return 1 if self._store.pop(key, None) is not None else 0


class DocumentSecurityRegressionTest(unittest.IsolatedAsyncioTestCase):
    def _make_user(self, username="tester"):
        return User(
            id=uuid.uuid4(),
            username=username,
            password_hash="x",
            display_name=username,
            status="active",
        )

    def _make_doc(
        self,
        creator_id,
        title,
        *,
        visibility="private",
        content="正文",
        source_file_path=None,
        md_file_path=None,
        source_format="md",
    ):
        return Document(
            id=uuid.uuid4(),
            creator_id=creator_id,
            title=title,
            category="doc",
            doc_type="official",
            status="draft",
            content=content,
            visibility=visibility,
            urgency="normal",
            security="internal",
            source_file_path=source_file_path,
            md_file_path=md_file_path,
            source_format=source_format,
        )

    async def _read_streaming_bytes(self, response):
        data = b""
        async for chunk in response.body_iterator:
            data += chunk if isinstance(chunk, bytes) else chunk.encode()
        return data

    async def test_export_without_ids_only_includes_owned_documents(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        own_doc = self._make_doc(current_user.id, "我的公文", content="我的内容")
        other_private = self._make_doc(other_user.id, "他人私有", content="私密内容")
        other_public = self._make_doc(
            other_user.id, "他人公开", visibility="public", content="公开内容"
        )

        def _resolver(stmt):
            sql = str(stmt)
            if "documents.creator_id" in sql:
                return _FakeListResult([own_doc])
            return _FakeListResult([own_doc, other_private, other_public])

        db = _RoutingDB(_resolver)
        response = await documents.export_documents(
            body=documents.DocumentExportRequest(),
            current_user=current_user,
            db=db,
        )

        payload = await self._read_streaming_bytes(response)
        with zipfile.ZipFile(io.BytesIO(payload), "r") as zf:
            names = set(zf.namelist())

        self.assertEqual(names, {"我的公文.md"})

    async def test_export_with_ids_excludes_other_private_documents(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        own_doc = self._make_doc(current_user.id, "我的公文", content="我的内容")
        other_private = self._make_doc(other_user.id, "他人私有", content="私密内容")
        other_public = self._make_doc(
            other_user.id, "他人公开", visibility="public", content="公开内容"
        )

        db = _RoutingDB(lambda _stmt: _FakeListResult([own_doc, other_private, other_public]))
        response = await documents.export_documents(
            body=documents.DocumentExportRequest(
                ids=[own_doc.id, other_private.id, other_public.id]
            ),
            current_user=current_user,
            db=db,
        )

        payload = await self._read_streaming_bytes(response)
        with zipfile.ZipFile(io.BytesIO(payload), "r") as zf:
            names = set(zf.namelist())

        self.assertIn("我的公文.md", names)
        self.assertIn("他人公开.md", names)
        self.assertNotIn("他人私有.md", names)

    async def test_source_download_denies_other_private_document(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        with tempfile.TemporaryDirectory() as tmpdir:
            source_path = Path(tmpdir) / "documents" / str(uuid.uuid4()) / "source.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"%PDF-1.4 test")
            doc = self._make_doc(
                other_user.id,
                "他人私有",
                visibility="private",
                source_file_path=str(source_path),
                source_format="pdf",
            )
            db = _RoutingDB(lambda _stmt: _FakeScalarResult(doc))

            with patch.object(documents.settings, "UPLOAD_DIR", tmpdir):
                response = await documents.download_document_source(
                    doc_id=doc.id,
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_markdown_preview_denies_other_private_document(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        with tempfile.TemporaryDirectory() as tmpdir:
            md_path = Path(tmpdir) / "documents" / str(uuid.uuid4()) / "content.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text("# 私密内容", encoding="utf-8")
            doc = self._make_doc(
                other_user.id,
                "他人私有",
                visibility="private",
                md_file_path=str(md_path),
            )
            db = _RoutingDB(lambda _stmt: _FakeScalarResult(doc))

            with patch.object(documents.settings, "UPLOAD_DIR", tmpdir):
                response = await documents.get_document_markdown(
                    doc_id=doc.id,
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_pdf_preview_denies_other_private_document(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        with tempfile.TemporaryDirectory() as tmpdir:
            source_path = Path(tmpdir) / "documents" / str(uuid.uuid4()) / "preview.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"%PDF-1.4 test")
            doc = self._make_doc(
                other_user.id,
                "他人私有",
                visibility="private",
                source_file_path=str(source_path),
                source_format="pdf",
            )
            db = _RoutingDB(lambda _stmt: _FakeScalarResult(doc))

            with (
                patch.object(documents.settings, "UPLOAD_DIR", tmpdir),
                patch("app.core.redis.get_redis", new=AsyncMock(return_value=_FakeRedis())),
                patch("app.core.security.decode_access_token", return_value=str(current_user.id)),
            ):
                response = await documents.preview_document_pdf(
                    doc_id=doc.id,
                    db=db,
                    request=SimpleNamespace(headers={"authorization": "Bearer valid-token"}),
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_pdf_preview_rejects_query_token(self):
        current_user = self._make_user("owner")
        with tempfile.TemporaryDirectory() as tmpdir:
            source_path = Path(tmpdir) / "documents" / str(uuid.uuid4()) / "preview.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"%PDF-1.4 test")
            doc = self._make_doc(
                current_user.id,
                "我的公文",
                source_file_path=str(source_path),
                source_format="pdf",
            )
            db = _RoutingDB(lambda _stmt: _FakeScalarResult(doc))

            with (
                patch.object(documents.settings, "UPLOAD_DIR", tmpdir),
                patch("app.core.redis.get_redis", new=AsyncMock(return_value=_FakeRedis())),
                patch("app.core.security.decode_access_token", return_value=str(current_user.id)),
            ):
                response = await documents.preview_document_pdf(
                    doc_id=doc.id,
                    db=db,
                    request=SimpleNamespace(headers={}),
                )

        self.assertEqual(response["code"], ErrorCode.TOKEN_INVALID)
        self.assertIn("Bearer", response["message"])

    async def test_version_list_denies_other_private_document(self):
        current_user = self._make_user("owner")
        other_user = self._make_user("other")
        doc = self._make_doc(other_user.id, "他人私有", visibility="private")
        version = DocumentVersion(
            id=uuid.uuid4(),
            document_id=doc.id,
            version_number=1,
            content="历史版本",
            created_by=other_user.id,
        )

        def _resolver(stmt):
            sql = str(stmt)
            if "FROM documents " in sql:
                return _FakeScalarResult(doc)
            if "FROM document_versions" in sql:
                return _FakeListResult([version])
            if "FROM users" in sql:
                return _FakeListResult([(other_user.id, other_user.display_name)])
            return _FakeListResult([])

        db = _RoutingDB(_resolver)
        response = await documents.list_document_versions(
            doc_id=doc.id,
            current_user=current_user,
            db=db,
        )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_invalid_visibility_returns_param_invalid(self):
        current_user = self._make_user("owner")
        response = await documents.toggle_doc_visibility(
            doc_id=uuid.uuid4(),
            body=SimpleNamespace(visibility="hidden"),
            request=SimpleNamespace(client=None),
            current_user=current_user,
            db=None,
        )

        self.assertEqual(response["code"], ErrorCode.PARAM_INVALID)

    async def test_batch_delete_empty_ids_returns_param_invalid(self):
        current_user = self._make_user("owner")
        response = await documents.batch_delete_documents(
            body=SimpleNamespace(ids=[]),
            request=SimpleNamespace(client=None),
            current_user=current_user,
            db=None,
        )

        self.assertEqual(response["code"], ErrorCode.PARAM_INVALID)


if __name__ == "__main__":
    unittest.main()
