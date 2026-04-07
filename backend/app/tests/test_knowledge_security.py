import io
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.api import knowledge
from app.core.response import ErrorCode
from app.models.knowledge import KBFile
from app.models.user import User
from app.schemas.knowledge import KBFileBatchExportRequest


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ListResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class _FakeDB:
    def __init__(self, resolver):
        self._resolver = resolver

    async def execute(self, stmt):
        return self._resolver(stmt)


class KnowledgeSecurityRegressionTest(unittest.IsolatedAsyncioTestCase):
    def _make_user(self, username="tester"):
        return User(
            id=uuid.uuid4(),
            username=username,
            password_hash="x",
            display_name=username,
            status="active",
        )

    def _make_kb_file(self, collection_id, *, file_path=None, md_file_path=None, file_type="pdf"):
        return KBFile(
            id=uuid.uuid4(),
            collection_id=collection_id,
            name="测试文件",
            file_type=file_type,
            status="indexed",
            file_path=file_path,
            md_file_path=md_file_path,
        )

    async def _read_streaming_bytes(self, response):
        data = b""
        async for chunk in response.body_iterator:
            data += chunk if isinstance(chunk, bytes) else chunk.encode()
        return data

    async def test_markdown_preview_rejects_unsafe_path(self):
        current_user = self._make_user()
        collection_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as upload_dir, tempfile.TemporaryDirectory() as unsafe_dir:
            md_path = Path(unsafe_dir) / "outside.md"
            md_path.write_text("# secret", encoding="utf-8")
            kb_file = self._make_kb_file(collection_id, md_file_path=str(md_path), file_type="md")
            db = _FakeDB(lambda _stmt: _ScalarResult(kb_file))

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:ref_all"])),
            ):
                response = await knowledge.get_kb_file_markdown(
                    file_id=kb_file.id,
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_preview_pdf_rejects_unsafe_path(self):
        current_user = self._make_user()
        collection_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as upload_dir, tempfile.TemporaryDirectory() as unsafe_dir:
            file_path = Path(unsafe_dir) / "outside.pdf"
            file_path.write_bytes(b"%PDF-1.4 test")
            kb_file = self._make_kb_file(collection_id, file_path=str(file_path), file_type="pdf")
            db = _FakeDB(lambda _stmt: _ScalarResult(kb_file))

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:ref_all"])),
            ):
                response = await knowledge.get_kb_file_preview_pdf(
                    file_id=kb_file.id,
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_reconvert_rejects_unsafe_path(self):
        current_user = self._make_user()
        collection_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as upload_dir, tempfile.TemporaryDirectory() as unsafe_dir:
            file_path = Path(unsafe_dir) / "outside.docx"
            file_path.write_bytes(b"fake-docx")
            kb_file = self._make_kb_file(collection_id, file_path=str(file_path), file_type="docx")
            db = _FakeDB(lambda _stmt: _ScalarResult(kb_file))

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:manage_all"])),
            ):
                response = await knowledge.reconvert_kb_file_to_markdown(
                    file_id=kb_file.id,
                    request=type("Req", (), {"client": None})(),
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], ErrorCode.PERMISSION_DENIED)

    async def test_batch_export_uses_placeholder_for_unsafe_path(self):
        current_user = self._make_user()
        collection_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as upload_dir, tempfile.TemporaryDirectory() as unsafe_dir:
            file_path = Path(unsafe_dir) / "outside.txt"
            file_path.write_text("secret", encoding="utf-8")
            kb_file = self._make_kb_file(collection_id, file_path=str(file_path), file_type="txt")
            db = _FakeDB(lambda _stmt: _ListResult([kb_file]))

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:ref_all"])),
            ):
                response = await knowledge.batch_export_kb_files(
                    body=KBFileBatchExportRequest(file_ids=[kb_file.id]),
                    current_user=current_user,
                    db=db,
                )

        payload = await self._read_streaming_bytes(response)
        with zipfile.ZipFile(io.BytesIO(payload), "r") as zf:
            names = set(zf.namelist())
            placeholder = zf.read("测试文件.txt").decode("utf-8")

        self.assertEqual(names, {"测试文件.txt"})
        self.assertIn("未在本地找到", placeholder)


if __name__ == "__main__":
    unittest.main()
