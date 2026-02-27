"""
高精度文档导出服务
- render_export_html(): 生成与前端 StructuredDocRenderer 1:1 一致的 HTML
- html_to_pdf_playwright(): Playwright Chromium 无头渲染 HTML → PDF
"""

import logging
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

# ── 模板目录 ──
_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

# ════════════════════════════════════════════════════════════
# 字体映射（与前端 StructuredDocRenderer FONT_MAP 完全一致）
# ════════════════════════════════════════════════════════════
_FONT_MAP: dict[str, str] = {
    "方正小标宋简体": '"FZXiaoBiaoSong-B05", "STSong", "SimSun", "Songti SC", serif',
    "方正小标宋": '"FZXiaoBiaoSong-B05", "STSong", "SimSun", "Songti SC", serif',
    "FZXiaoBiaoSong": '"FZXiaoBiaoSong-B05", "STSong", "SimSun", "Songti SC", serif',
    "黑体": '"SimHei", "STHeiti", "Heiti SC", "Microsoft YaHei", sans-serif',
    "SimHei": '"SimHei", "STHeiti", "Heiti SC", "Microsoft YaHei", sans-serif',
    "楷体_GB2312": '"KaiTi", "STKaiti", "Kaiti SC", serif',
    "楷体": '"KaiTi", "STKaiti", "Kaiti SC", serif',
    "KaiTi": '"KaiTi", "STKaiti", "Kaiti SC", serif',
    "华文楷体": '"STKaiti", "KaiTi", "Kaiti SC", serif',
    "仿宋_GB2312": '"FangSong", "STFangsong", "Fangsong SC", serif',
    "仿宋": '"FangSong", "STFangsong", "Fangsong SC", serif',
    "FangSong": '"FangSong", "STFangsong", "Fangsong SC", serif',
    "华文仿宋": '"STFangsong", "FangSong", "Fangsong SC", serif',
    "宋体": '"SimSun", "STSong", "Songti SC", serif',
    "SimSun": '"SimSun", "STSong", "Songti SC", serif',
    "华文中宋": '"STZhongsong", "SimSun", "STSong", serif',
    "微软雅黑": '"Microsoft YaHei", "PingFang SC", sans-serif',
}

# ════════════════════════════════════════════════════════════
# 颜色映射（与前端 COLOR_NAME_MAP 完全一致）
# ════════════════════════════════════════════════════════════
_COLOR_NAME_MAP: dict[str, str] = {
    "黑色": "#000000", "红色": "#CC0000", "深灰": "#333333",
    "灰色": "#666666", "蓝色": "#0033CC", "绿色": "#006600",
    "紫色": "#800080",
    "black": "#000000", "red": "#CC0000", "blue": "#0033CC",
    "green": "#006600", "purple": "#800080", "gray": "#666666",
    "grey": "#666666",
}

# ════════════════════════════════════════════════════════════
# 中文字号 → pt（与前端 CN_FONT_SIZE_PT 完全一致）
# ════════════════════════════════════════════════════════════
_CN_FONT_SIZE_PT: dict[str, float] = {
    "初号": 42, "小初": 36, "一号": 26, "小一": 24,
    "二号": 22, "小二": 18, "三号": 16, "小三": 15,
    "四号": 14, "小四": 12, "五号": 10.5, "小五": 9,
}

# ════════════════════════════════════════════════════════════
# 样式预设（与前端 STYLE_PRESETS + 后端 _STYLE_PRESETS 完全一致）
# ════════════════════════════════════════════════════════════
_STYLE_PRESETS: dict[str, dict[str, dict]] = {
    "official": {
        "title":      {"font_family": "方正小标宋简体", "font_size_pt": 22, "alignment": "center", "indent_em": 0, "line_height": 2.0, "bold": False},
        "recipient":  {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 0, "line_height": 2.0, "bold": False},
        "heading1":   {"font_family": "黑体",           "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False},
        "heading2":   {"font_family": "楷体_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False},
        "heading3":   {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": True},
        "heading4":   {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False},
        "body":       {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False},
        "signature":  {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False},
        "date":       {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False},
        "attachment": {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False},
        "closing":    {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False},
    },
    "academic": {
        "title":    {"font_family": "黑体",        "font_size_pt": 18, "alignment": "center", "indent_em": 0, "line_height": 1.8, "bold": True},
        "heading1": {"font_family": "黑体",        "font_size_pt": 15, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True},
        "heading2": {"font_family": "黑体",        "font_size_pt": 14, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True},
        "heading3": {"font_family": "楷体_GB2312", "font_size_pt": 14, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True},
        "body":     {"font_family": "仿宋_GB2312", "font_size_pt": 12, "alignment": "justify","indent_em": 2, "line_height": 1.8, "bold": False},
        "signature":{"font_family": "仿宋_GB2312", "font_size_pt": 12, "alignment": "right",  "indent_em": 0, "line_height": 1.8, "bold": False},
    },
    "legal": {
        "title":    {"font_family": "方正小标宋简体","font_size_pt": 26, "alignment": "center", "indent_em": 0, "line_height": 2.2, "bold": False},
        "heading1": {"font_family": "黑体",        "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False},
        "body":     {"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False},
        "signature":{"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False},
        "date":     {"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False},
    },
}

# ════════════════════════════════════════════════════════════
# 合法 style_type 集合
# ════════════════════════════════════════════════════════════
_VALID_STYLE_TYPES = {
    "title", "heading1", "heading2", "heading3", "heading4",
    "body", "recipient", "signature", "date", "attachment", "closing",
}


# ════════════════════════════════════════════════════════════
# 工具函数（1:1 移植自前端 StructuredDocRenderer.tsx）
# ════════════════════════════════════════════════════════════

def _get_font_family(font_cn: str, font_en: str = "Times New Roman") -> str:
    """构建 CSS font-family（与前端 getFontFamily 完全一致）"""
    cn = _FONT_MAP.get(font_cn) or _FONT_MAP.get(font_cn.strip()) or f'"{font_cn}", serif'
    return f'"{font_en}", {cn}'


def _pt_to_css(pt: float) -> str:
    """pt → CSS pt 值（直接使用 pt 单位，LibreOffice 兼容性最佳）"""
    if pt == int(pt):
        return f"{int(pt)}pt"
    return f"{pt:.1f}pt"


def _resolve_font_size(raw: str | None) -> str | None:
    """解析字号字符串为 CSS fontSize（与前端 resolveFontSize 完全一致）"""
    if not raw:
        return None
    trimmed = str(raw).strip()
    if not trimmed:
        return None
    # 中文字号
    if trimmed in _CN_FONT_SIZE_PT:
        return _pt_to_css(_CN_FONT_SIZE_PT[trimmed])
    # "16pt"
    m = re.match(r'^([\d.]+)\s*pt$', trimmed, re.IGNORECASE)
    if m:
        return _pt_to_css(float(m.group(1)))
    # 带 px/rem/em 直接透传
    if re.match(r'^[\d.]+\s*(px|rem|em)$', trimmed, re.IGNORECASE):
        return trimmed
    # 纯数字 → pt
    if re.match(r'^[\d.]+$', trimmed):
        return _pt_to_css(float(trimmed))
    return trimmed


def _resolve_font_size_pt(raw: str | None) -> float | None:
    """解析字号为 pt 数值（用于行距计算）"""
    if not raw:
        return None
    trimmed = str(raw).strip()
    if trimmed in _CN_FONT_SIZE_PT:
        return _CN_FONT_SIZE_PT[trimmed]
    m = re.match(r'^([\d.]+)\s*pt$', trimmed, re.IGNORECASE)
    if m:
        return float(m.group(1))
    if re.match(r'^[\d.]+$', trimmed):
        return float(trimmed)
    return None


# 保留旧名称别名，以防其他模块引用
_pt_to_rem = _pt_to_css


def _resolve_color(raw: str | None) -> str | None:
    """解析颜色值（与前端 resolveColor 完全一致）"""
    if not raw:
        return None
    c = str(raw).strip()
    mapped = _COLOR_NAME_MAP.get(c.lower()) or _COLOR_NAME_MAP.get(c)
    if mapped:
        return mapped
    if not c.startswith("#"):
        c = "#" + c
    c = c.upper()
    if re.match(r'^#[0-9A-F]{6}$', c):
        return c
    return None


def _resolve_line_height(raw: str | None) -> str | None:
    """解析行高为 CSS lineHeight（与前端 resolveLineHeight 完全一致）"""
    if not raw:
        return None
    trimmed = str(raw).strip()
    if not trimmed:
        return None
    m = re.match(r'^([\d.]+)\s*pt$', trimmed, re.IGNORECASE)
    if m:
        return _pt_to_css(float(m.group(1)))
    if re.match(r'^[\d.]+\s*(px|rem|em|%)$', trimmed, re.IGNORECASE):
        return trimmed
    if re.match(r'^[\d.]+$', trimmed):
        return trimmed
    return trimmed


def _normalize_style_type(raw: str | None) -> str:
    """归一化 style_type（与前端 normalizeStyleType 完全一致）"""
    if not raw:
        return "body"
    t = str(raw).strip().lower()
    if t in _VALID_STYLE_TYPES:
        return t
    if "title" in t or t == "标题":
        return "title"
    if re.search(r'heading\s*1|一级', t):
        return "heading1"
    if re.search(r'heading\s*2|二级', t):
        return "heading2"
    if re.search(r'heading\s*3|三级', t):
        return "heading3"
    if re.search(r'heading\s*4|四级', t):
        return "heading4"
    if "body" in t or t == "正文":
        return "body"
    if "signature" in t or "落款" in t or "署名" in t:
        return "signature"
    if "date" in t or t == "日期":
        return "date"
    if "recipient" in t or "主送" in t:
        return "recipient"
    if "attachment" in t or "附件" in t:
        return "attachment"
    if "closing" in t or "结束" in t:
        return "closing"
    return "body"


def _normalize_alignment(raw: str | None) -> str | None:
    """归一化对齐方式"""
    if not raw:
        return None
    t = str(raw).strip().lower()
    if t in ("left", "center", "right", "justify"):
        return t
    mapping = {"居中": "center", "居右": "right", "右对齐": "right",
               "居左": "left", "左对齐": "left", "两端对齐": "justify", "两端": "justify"}
    return mapping.get(t)


def _normalize_indent(raw) -> str | None:
    """归一化缩进"""
    if raw is None:
        return None
    t = str(raw).strip()
    if t in ("", "none", "无"):
        return "0"
    if t == "0":
        return "0"
    if re.match(r'^[\d.]+\s*(em|px|rem|pt|cm|mm|%)$', t):
        return t
    if re.match(r'^[\d.]+$', t):
        return f"{t}em"
    return t


def _tag_for_style(st: str) -> str:
    """选择 HTML 标签（与前端 tagForStyle 完全一致）"""
    if st == "title":
        return "h1"
    if st == "heading1":
        return "h2"
    if st == "heading2":
        return "h3"
    if st in ("heading3", "heading4"):
        return "h4"
    return "p"


def _get_spacing_top(cur_type: str, prev_type: str | None) -> str:
    """段落间距（与前端 getSpacingTop 完全一致）"""
    if not prev_type:
        return "0"
    if cur_type == "title":
        return "0"
    if cur_type == "recipient" and prev_type == "title":
        return "0.8em"
    if cur_type.startswith("heading") and not prev_type.startswith("heading"):
        return "1em"
    if cur_type.startswith("heading") and prev_type.startswith("heading"):
        return "0.4em"
    if cur_type in ("signature", "date") and prev_type not in ("signature", "date"):
        return "1.5em"
    if cur_type == "attachment" and prev_type != "attachment":
        return "1.2em"
    return "0"


# ════════════════════════════════════════════════════════════
# 核心渲染函数
# ════════════════════════════════════════════════════════════

def render_export_html(paragraphs: list[dict], title: str, preset: str = "official") -> str:
    """
    将段落数据渲染为与前端 StructuredDocRenderer 完全一致的 HTML。
    用于 Playwright PDF 导出。
    """
    preset_styles = _STYLE_PRESETS.get(preset, _STYLE_PRESETS["official"])
    body_default = preset_styles.get("body", _STYLE_PRESETS["official"]["body"])

    # 展开段内换行
    expanded: list[dict] = []
    for p in paragraphs:
        text = str(p.get("text", ""))
        if "\n" in text:
            for line in text.splitlines():
                np = dict(p)
                np["text"] = line
                expanded.append(np)
        else:
            expanded.append(p)

    # 过滤空段落
    valid: list[dict] = [p for p in expanded if str(p.get("text", "")).strip()]

    # 构建模板数据
    rendered_paragraphs: list[dict] = []
    prev_st: str | None = None

    for idx, para_data in enumerate(valid):
        text = str(para_data.get("text", ""))
        st = _normalize_style_type(para_data.get("style_type"))
        defaults = preset_styles.get(st, body_default)
        tag = _tag_for_style(st)

        # ── 合并样式：preset 默认 → LLM 覆盖 ──
        style_parts: list[str] = []

        # font-family
        llm_font = para_data.get("font_family")
        font_cn = llm_font if llm_font else defaults["font_family"]
        font_family = _get_font_family(font_cn)
        style_parts.append(f"font-family: {font_family}")

        # font-size
        llm_fs = _resolve_font_size(para_data.get("font_size"))
        if llm_fs:
            style_parts.append(f"font-size: {llm_fs}")
        else:
            style_parts.append(f"font-size: {_pt_to_css(defaults['font_size_pt'])}")

        # font-weight
        llm_bold = para_data.get("bold")
        bold = llm_bold if llm_bold is not None else defaults.get("bold", False)
        style_parts.append(f"font-weight: {'bold' if bold else 'normal'}")

        # font-style
        llm_italic = para_data.get("italic")
        if llm_italic:
            style_parts.append("font-style: italic")

        # color
        llm_color = _resolve_color(para_data.get("color"))
        style_parts.append(f"color: {llm_color or '#000000'}")

        # text-align（短行左对齐逻辑与 _build_formatted_docx 一致）
        llm_align = _normalize_alignment(para_data.get("alignment"))
        alignment = llm_align or defaults["alignment"]
        if alignment == "justify":
            t = text.strip()
            if len(t) <= 20 or t.endswith("：") or t.endswith(":"):
                alignment = "left"
        style_parts.append(f"text-align: {alignment}")

        # text-indent
        llm_indent = _normalize_indent(para_data.get("indent"))
        if llm_indent is not None:
            style_parts.append(f"text-indent: {llm_indent}")
        elif defaults.get("indent_em", 0) > 0:
            style_parts.append(f"text-indent: {defaults['indent_em']}em")

        # line-height
        llm_lh = _resolve_line_height(para_data.get("line_height"))
        if llm_lh:
            style_parts.append(f"line-height: {llm_lh}")
        else:
            style_parts.append(f"line-height: {defaults['line_height']}")

        # margin-top（段间距）
        spacing = _get_spacing_top(st, prev_st)
        if spacing != "0":
            style_parts.append(f"margin-top: {spacing}")

        # margin-bottom（标题额外间距）
        if st == "title":
            style_parts.append("margin-bottom: 0.5em")

        # 红色分隔线
        para_red_line = para_data.get("red_line")
        need_red_line = (
            preset == "official"
            and st == "title"
            and para_red_line is not False
            and idx < len(valid) - 1
        )

        rendered_paragraphs.append({
            "tag": tag,
            "style": "; ".join(style_parts),
            "text": text,
            "red_line": need_red_line,
        })

        prev_st = st

    # 渲染 Jinja2 模板
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=False,  # 我们在模板中用 {{ para.text | e }} 手动转义
    )
    template = env.get_template("doc_export.html")
    return template.render(title=title, paragraphs=rendered_paragraphs)


# ════════════════════════════════════════════════════════════
# Playwright PDF 渲染
# ════════════════════════════════════════════════════════════

async def html_to_pdf_playwright(html: str) -> bytes:
    """
    使用 Playwright Chromium 将 HTML 渲染为 PDF。
    页面边距由 HTML @page CSS 控制，Playwright margin 设为 0。
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--font-render-hinting=none",
            ],
        )
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")

            # 等待字体加载完成
            await page.evaluate("() => document.fonts.ready")

            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                # 边距由 HTML @page 规则控制
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                prefer_css_page_size=True,
            )
            return pdf_bytes
        finally:
            await browser.close()
