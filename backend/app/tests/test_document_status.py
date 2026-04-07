import unittest
from unittest.mock import patch

from app import main as app_main
from app.api.documents import _resolve_initial_doc_status
from app.core import security


class DocumentStatusTest(unittest.TestCase):
    def test_blank_content_starts_as_unfilled(self):
        self.assertEqual(_resolve_initial_doc_status(None), "unfilled")
        self.assertEqual(_resolve_initial_doc_status(""), "unfilled")
        self.assertEqual(_resolve_initial_doc_status("   "), "unfilled")

    def test_non_blank_content_starts_as_draft(self):
        self.assertEqual(_resolve_initial_doc_status("正文"), "draft")

    def test_bcrypt_about_version_is_patched(self):
        self.assertTrue(hasattr(security._bcrypt, "__about__"))
        self.assertTrue(hasattr(security._bcrypt.__about__, "__version__"))


class DocumentStatusEnumBootstrapTest(unittest.IsolatedAsyncioTestCase):
    async def test_startup_backfills_reviewed_doc_status_enum(self):
        class _FakeSession:
            def __init__(self):
                self.sql = []
                self.committed = False

            async def execute(self, stmt):
                self.sql.append(str(stmt))

            async def commit(self):
                self.committed = True

        class _FakeSessionContext:
            def __init__(self, session):
                self.session = session

            async def __aenter__(self):
                return self.session

            async def __aexit__(self, exc_type, exc, tb):
                return False

        fake_session = _FakeSession()

        with patch("app.core.database.AsyncSessionLocal", return_value=_FakeSessionContext(fake_session)):
            await app_main._ensure_document_status_enum()

        self.assertTrue(fake_session.committed)
        self.assertEqual(
            fake_session.sql,
            ["ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'reviewed' AFTER 'optimized'"],
        )


if __name__ == "__main__":
    unittest.main()
