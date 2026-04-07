import unittest

from app.api import documents


class FormatRulesRegressionTest(unittest.TestCase):
    def test_parse_markdown_to_paragraphs_merges_body_lines_and_strips_markdown(self):
        markdown = (
            "# 关于申请专项经费的请示\n\n"
            "市财政局：\n\n"
            "- 为保障项目推进，现申请专项经费支持。\n"
            "- 用于设备采购和系统升级。\n\n"
            "特此报告。\n\n"
            "XX单位\n\n"
            "2026年4月6日"
        )

        paragraphs = documents._parse_markdown_to_paragraphs(markdown)

        self.assertEqual([para["style_type"] for para in paragraphs[:3]], ["title", "recipient", "body"])
        self.assertEqual(paragraphs[0]["text"], "关于申请专项经费的请示")
        self.assertEqual(paragraphs[2]["text"], "为保障项目推进，现申请专项经费支持。用于设备采购和系统升级。")
        self.assertIn("_confidence", paragraphs[2])

    def test_build_custom_template_and_apply_template_force_body_fallback(self):
        custom_template = documents._build_custom_template(
            {"body": {"font_size": "四号", "alignment": "left"}},
            base_doc_type="official",
        )

        self.assertEqual(custom_template["body"]["font_size"], "四号")
        self.assertEqual(custom_template["body"]["alignment"], "left")

        paragraph = {
            "text": "测试正文",
            "style_type": "unknown_style",
            "font_size": "小五",
            "alignment": "right",
        }
        formatted = documents._apply_format_template(paragraph, "official", custom_template)

        self.assertEqual(formatted["font_size"], "四号")
        self.assertEqual(formatted["alignment"], "left")
        self.assertEqual(formatted["font_family"], "仿宋_GB2312")

    def test_apply_format_template_enforces_redhead_title_and_subtitle_rules(self):
        title_para = {
            "text": "XX大学",
            "style_type": "title",
            "color": "#000000",
            "alignment": "left",
        }
        subtitle_para = {
            "text": "关于做好校园安全检查的通知",
            "style_type": "subtitle",
            "color": "#FF0000",
            "alignment": "left",
            "indent": "2em",
        }

        documents._apply_format_template(title_para, "school_notice_redhead")
        documents._apply_format_template(subtitle_para, "school_notice_redhead")

        self.assertEqual(title_para["color"], "#CC0000")
        self.assertEqual(title_para["alignment"], "center")
        self.assertEqual(title_para["letter_spacing"], "0.6em")
        self.assertEqual(subtitle_para["color"], "#000000")
        self.assertEqual(subtitle_para["alignment"], "center")
        self.assertEqual(subtitle_para["indent"], "0")

    def test_rules_format_paragraphs_redhead_fixes_title_and_attachment_block(self):
        paragraphs = [
            {"text": "关于做好校园安全检查的通知"},
            {"text": "联系人：张三"},
            {"text": "2.经费预算明细表"},
            {"text": "校长办公室 2026年4月6日印发"},
        ]

        formatted, llm_needed = documents._rules_format_paragraphs(
            paragraphs,
            doc_type="school_notice_redhead",
        )

        self.assertEqual(formatted[0]["style_type"], "subtitle")
        self.assertEqual(formatted[0]["alignment"], "center")
        self.assertEqual(formatted[0]["color"], "#000000")
        self.assertEqual(
            [para["style_type"] for para in formatted[1:]],
            ["attachment", "attachment", "attachment"],
        )
        self.assertTrue(formatted[1]["footer_line"])
        self.assertFalse(formatted[2]["footer_line"])
        self.assertTrue(formatted[3]["footer_line_bottom"])
        self.assertEqual(llm_needed, [])

    def test_rules_format_paragraphs_splits_long_heading_body(self):
        paragraphs = [
            {
                "text": "（一）工作目标。围绕校园安全治理，持续完善制度机制，确保责任落实到位，全面提升风险防控水平，并形成校院两级常态化联动机制。"
            }
        ]

        formatted, llm_needed = documents._rules_format_paragraphs(paragraphs, doc_type="official")

        self.assertEqual(len(formatted), 2)
        self.assertEqual(formatted[0]["style_type"], "heading2")
        self.assertEqual(formatted[0]["text"], "（一）工作目标")
        self.assertEqual(formatted[1]["style_type"], "body")
        self.assertTrue(formatted[1]["text"].startswith("围绕校园安全治理"))
        self.assertEqual(llm_needed, [])


if __name__ == "__main__":
    unittest.main()
