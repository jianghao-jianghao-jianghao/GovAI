import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.models.graph import GraphEntity, GraphRelationship
from app.services import doc_converter, html_export
from app.services.doc_converter import DocumentConvertResult
from app.services.dify.base import EntityTriple
from app.services.graph_service import GraphService


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _NestedTx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _GraphDB:
    def __init__(self):
        self.added = []
        self.flushed = 0

    async def execute(self, stmt):
        sql = str(stmt)
        if "FROM graph_entities" in sql:
            return _ScalarResult(None)
        raise AssertionError(f"unexpected execute: {sql}")

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self.flushed += 1
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()

    def begin_nested(self):
        return _NestedTx()


class GraphExportToolsRegressionTest(unittest.IsolatedAsyncioTestCase):
    async def test_ingest_triples_marks_age_sync_false_when_age_writes_fail(self):
        service = GraphService()
        db = _GraphDB()
        triple = EntityTriple(
            source="张三",
            source_type="人员",
            relation="任职于",
            target="办公室",
            target_type="机构",
        )

        with (
            patch.object(service, "_age_upsert_entity", new=AsyncMock(side_effect=RuntimeError("age down"))),
            patch.object(service, "_age_upsert_relationship", new=AsyncMock(side_effect=RuntimeError("age down"))),
        ):
            result = await service.ingest_triples(db, [triple], source_doc_id=uuid.uuid4())

        self.assertEqual(result["nodes_created"], 2)
        self.assertEqual(result["edges_created"], 1)
        self.assertEqual(result["nodes_total"], 2)
        self.assertEqual(result["edges_total"], 1)
        self.assertFalse(result["age_synced"])
        self.assertTrue(any("AGE写入实体失败" in err for err in result["errors"]))
        self.assertTrue(any("AGE写入关系失败" in err for err in result["errors"]))
        self.assertTrue(any(isinstance(obj, GraphEntity) for obj in db.added))
        self.assertTrue(any(isinstance(obj, GraphRelationship) for obj in db.added))

    async def test_convert_file_to_markdown_falls_back_to_csv_when_converter_unavailable(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "sample.csv"
            csv_path.write_text("姓名,部门\n张三,办公室", encoding="utf-8")

            with patch.object(
                doc_converter,
                "_call_converter",
                new=AsyncMock(side_effect=RuntimeError("converter unavailable")),
            ):
                result = await doc_converter.convert_file_to_markdown(csv_path, "sample.csv")

        self.assertTrue(result.success)
        self.assertEqual(result.source_format, "csv")
        self.assertEqual(result.title, "sample")
        self.assertEqual(result.markdown, "姓名\t部门\n张三\t办公室")

    async def test_convert_and_extract_falls_back_to_text_only_when_converter_fails(self):
        fallback = DocumentConvertResult(
            markdown="转换后的正文",
            title="sample",
            source_format="docx",
        )

        with (
            patch.object(
                doc_converter,
                "_call_converter",
                new=AsyncMock(side_effect=RuntimeError("converter unavailable")),
            ),
            patch.object(
                doc_converter,
                "convert_bytes_to_markdown",
                new=AsyncMock(return_value=fallback),
            ) as fallback_mock,
        ):
            result = await doc_converter.convert_and_extract(b"fake-docx-bytes", "sample.docx")

        self.assertEqual(result.markdown, "转换后的正文")
        self.assertEqual(result.pdf_path, "")
        fallback_mock.assert_awaited_once_with(b"fake-docx-bytes", "sample.docx")


class HtmlExportRegressionTest(unittest.TestCase):
    def test_render_export_html_escapes_title_and_body_text_and_keeps_red_line(self):
        html = html_export.render_export_html(
            [
                {"text": "XX大学", "style_type": "title"},
                {"text": "正文<script>alert(1)</script>", "style_type": "body"},
            ],
            title="<script>alert(1)</script>",
            preset="official",
        )

        self.assertNotIn("<title><script>alert(1)</script></title>", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", html)
        self.assertIn("class=\"red-line\"", html)


if __name__ == "__main__":
    unittest.main()
