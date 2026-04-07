import io
import unittest
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile

from app.api import knowledge
from app.core.response import ErrorCode
from app.models.knowledge import KBCollection
from app.models.user import User


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, collection):
        self.collection = collection

    async def execute(self, *args, **kwargs):
        return _ScalarResult(self.collection)


class KnowledgeUploadLimitTest(unittest.IsolatedAsyncioTestCase):
    async def test_upload_rejects_when_file_count_exceeds_limit(self):
        collection = KBCollection(id=uuid4(), name="测试集合")
        current_user = User(
            id=uuid4(),
            username="tester",
            password_hash="hashed",
            display_name="测试用户",
        )
        request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
        files = [
            UploadFile(file=io.BytesIO(f"file-{idx}".encode("utf-8")), filename=f"file-{idx}.txt")
            for idx in range(3)
        ]

        with (
            patch.object(knowledge.settings, "KB_MAX_FILES_PER_UPLOAD", 2),
            patch.object(knowledge, "get_user_permissions", new=AsyncMock(return_value=["res:kb:manage_all"])),
            patch.object(knowledge, "get_dify_service") as get_dify_service,
        ):
            result = await knowledge.upload_kb_files(
                collection.id,
                request,
                files,
                current_user,
                _FakeDB(collection),
            )

        self.assertEqual(result["code"], ErrorCode.PARAM_INVALID)
        self.assertIn("最多上传 2 个文件", result["message"])
        get_dify_service.assert_not_called()


if __name__ == "__main__":
    unittest.main()
