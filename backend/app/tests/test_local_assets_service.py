import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.services import local_assets


class LocalAssetsServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_pdf_preview_file_returns_source_for_pdf(self):
        with tempfile.TemporaryDirectory() as upload_dir:
            source_path = Path(upload_dir) / "documents" / "demo.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"%PDF-1.4 demo")

            with patch.object(local_assets.settings, "UPLOAD_DIR", upload_dir):
                preview_path = await local_assets.ensure_pdf_preview_file(
                    source_path,
                    source_name="demo.pdf",
                    source_ext="pdf",
                )

        self.assertEqual(preview_path, source_path)

    async def test_ensure_pdf_preview_file_reuses_existing_cache(self):
        with tempfile.TemporaryDirectory() as upload_dir:
            source_path = Path(upload_dir) / "documents" / "demo.docx"
            cache_path = source_path.parent / "preview.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"docx-bytes")
            cache_path.write_bytes(b"%PDF-1.4 cached")

            with (
                patch.object(local_assets.settings, "UPLOAD_DIR", upload_dir),
                patch.object(local_assets, "convert_to_pdf_bytes", new=AsyncMock()) as mocked_convert,
            ):
                preview_path = await local_assets.ensure_pdf_preview_file(
                    source_path,
                    source_name="demo.docx",
                    cache_path=cache_path,
                    source_ext="docx",
                )

        self.assertEqual(preview_path, cache_path)
        mocked_convert.assert_not_awaited()

    async def test_ensure_pdf_preview_file_creates_cache_via_converter(self):
        with tempfile.TemporaryDirectory() as upload_dir:
            source_path = Path(upload_dir) / "kb" / "demo.docx"
            cache_path = source_path.parent / "demo.preview.pdf"
            source_path.parent.mkdir(parents=True, exist_ok=True)
            source_path.write_bytes(b"docx-bytes")

            with (
                patch.object(local_assets.settings, "UPLOAD_DIR", upload_dir),
                patch.object(local_assets, "convert_to_pdf_bytes", new=AsyncMock(return_value=b"%PDF-1.4 generated")),
            ):
                preview_path = await local_assets.ensure_pdf_preview_file(
                    source_path,
                    source_name="demo.docx",
                    cache_path=cache_path,
                    source_ext="docx",
                )

                self.assertEqual(preview_path, cache_path)
                self.assertTrue(cache_path.exists())
                self.assertEqual(cache_path.read_bytes(), b"%PDF-1.4 generated")

    def test_read_safe_text_file_returns_none_for_unsafe_path(self):
        with tempfile.TemporaryDirectory() as upload_dir, tempfile.TemporaryDirectory() as unsafe_dir:
            unsafe_path = Path(unsafe_dir) / "outside.md"
            unsafe_path.write_text("secret", encoding="utf-8")

            with patch.object(local_assets.settings, "UPLOAD_DIR", upload_dir):
                content = local_assets.read_safe_text_file(unsafe_path)

        self.assertIsNone(content)


if __name__ == "__main__":
    unittest.main()
