import io
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile

from app.api import knowledge
from app.models.knowledge import KBCollection, KBFile
from app.models.user import User
from app.services.doc_converter import DocumentConvertResult


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _UploadDB:
    def __init__(self, collection):
        self.collection = collection
        self.added = []
        self.flushed = 0

    async def execute(self, stmt):
        sql = str(stmt)
        if "FROM kb_collections" in sql:
            return _ScalarResult(self.collection)
        raise AssertionError(f"unexpected execute: {sql}")

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self.flushed += 1
        for obj in self.added:
            if isinstance(obj, KBFile):
                if not obj.id:
                    obj.id = uuid.uuid4()
                if not obj.uploaded_at:
                    obj.uploaded_at = datetime.now(timezone.utc)


class _RoutingDB:
    def __init__(self, kb_file, collection):
        self.kb_file = kb_file
        self.collection = collection
        self.flushed = 0

    async def execute(self, stmt):
        sql = str(stmt)
        if "FROM kb_files" in sql:
            return _ScalarResult(self.kb_file)
        if "FROM kb_collections" in sql:
            return _ScalarResult(self.collection)
        raise AssertionError(f"unexpected execute: {sql}")

    async def flush(self):
        self.flushed += 1


class _FakeDifyService:
    def __init__(self):
        self.upload_document = AsyncMock(
            return_value=SimpleNamespace(document_id="doc-1", batch_id="batch-1")
        )
        self.get_indexing_status = AsyncMock(return_value="completed")


class KnowledgeLifecycleRegressionTest(unittest.IsolatedAsyncioTestCase):
    def _make_user(self):
        return User(
            id=uuid.uuid4(),
            username="tester",
            password_hash="x",
            display_name="测试用户",
            status="active",
        )

    async def test_upload_kb_file_success_persists_local_and_markdown_artifacts(self):
        current_user = self._make_user()
        collection = KBCollection(
            id=uuid.uuid4(),
            name="测试集合",
            dify_dataset_id="dataset-1",
        )
        request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
        db = _UploadDB(collection)
        dify = _FakeDifyService()
        scheduled = []

        def _fake_create_task(coro):
            scheduled.append(coro)
            coro.close()
            return SimpleNamespace(cancel=lambda: None)

        with tempfile.TemporaryDirectory() as upload_dir:
            upload = UploadFile(
                file=io.BytesIO(b"hello knowledge base"),
                filename="sample.txt",
            )

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:manage_all"])),
                patch.object(knowledge, "get_dify_service", return_value=dify),
                patch.object(
                    knowledge,
                    "convert_file_to_markdown",
                    new=AsyncMock(
                        return_value=DocumentConvertResult(
                            markdown="# sample\n\nhello knowledge base",
                            title="sample",
                            source_format="txt",
                        )
                    ),
                ),
                patch.object(knowledge.asyncio, "create_task", side_effect=_fake_create_task),
                patch.object(knowledge, "log_action", new=AsyncMock()),
            ):
                response = await knowledge.upload_kb_files(
                    collection_id=collection.id,
                    request=request,
                    files=[upload],
                    current_user=current_user,
                    db=db,
                )

                self.assertEqual(response["code"], 0)
                self.assertEqual(len(response["data"]["uploaded"]), 1)
                self.assertEqual(response["data"]["failed"], [])
                self.assertEqual(len(db.added), 1)
                kb_file = db.added[0]
                self.assertEqual(kb_file.status, "indexing")
                self.assertEqual(kb_file.dify_document_id, "doc-1")
                self.assertEqual(kb_file.dify_batch_id, "batch-1")
                self.assertTrue(Path(kb_file.file_path).exists())
                self.assertTrue(Path(kb_file.md_file_path).exists())

        self.assertEqual(len(scheduled), 1)
        dify.upload_document.assert_awaited_once()

    async def test_get_file_indexing_status_refreshes_completed_result(self):
        current_user = self._make_user()
        collection = KBCollection(
            id=uuid.uuid4(),
            name="测试集合",
            dify_dataset_id="dataset-1",
        )
        kb_file = KBFile(
            id=uuid.uuid4(),
            collection_id=collection.id,
            name="sample.txt",
            file_type="txt",
            status="indexing",
            dify_batch_id="batch-1",
        )
        db = _RoutingDB(kb_file, collection)
        dify = _FakeDifyService()

        with (
            patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:ref_all"])),
            patch.object(knowledge, "get_dify_service", return_value=dify),
        ):
            response = await knowledge.get_file_indexing_status(
                file_id=kb_file.id,
                current_user=current_user,
                db=db,
            )

        self.assertEqual(response["code"], 0)
        self.assertEqual(response["data"]["status"], "indexed")
        self.assertEqual(kb_file.status, "indexed")
        self.assertEqual(db.flushed, 1)
        dify.get_indexing_status.assert_awaited_once_with("dataset-1", "batch-1")

    async def test_markdown_preview_returns_saved_content_for_authorized_user(self):
        current_user = self._make_user()
        collection_id = uuid.uuid4()

        with tempfile.TemporaryDirectory() as upload_dir:
            md_path = Path(upload_dir) / "kb" / str(collection_id) / f"{uuid.uuid4()}.md"
            md_path.parent.mkdir(parents=True, exist_ok=True)
            md_path.write_text("# 标题\n\n正文", encoding="utf-8")
            kb_file = KBFile(
                id=uuid.uuid4(),
                collection_id=collection_id,
                name="sample.md",
                file_type="md",
                status="indexed",
                md_file_path=str(md_path),
            )
            db = _RoutingDB(kb_file, KBCollection(id=collection_id, name="测试集合"))

            with (
                patch.object(knowledge.settings, "UPLOAD_DIR", upload_dir),
                patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:ref_all"])),
            ):
                response = await knowledge.get_kb_file_markdown(
                    file_id=kb_file.id,
                    current_user=current_user,
                    db=db,
                )

        self.assertEqual(response["code"], 0)
        self.assertEqual(response["data"]["file_name"], "sample.md")
        self.assertIn("正文", response["data"]["markdown"])
        self.assertEqual(response["data"]["char_count"], len("# 标题\n\n正文"))


if __name__ == "__main__":
    unittest.main()
