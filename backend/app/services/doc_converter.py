"""
统一文档转 Markdown 服务
========================
使用 Microsoft MarkItDown 将各类文档（PDF, DOCX, DOC, XLSX, CSV, TXT, HTML, PPTX 等）
转换为高质量的 Markdown 文本，保留标题、表格、列表、公式等结构信息。

主入口:
    - convert_file_to_markdown(file_path, file_name)    —— 从磁盘文件转换
    - convert_bytes_to_markdown(content_bytes, file_name) —— 从内存字节转换

降级策略:
    MarkItDown 失败时自动降级到内置解析器（python-docx, openpyxl, csv 等）。

依赖:
    pip install 'markitdown[all]'  (核心引擎)
    pip install python-docx openpyxl  (降级备选)
"""

import asyncio
import csv as csv_mod
import logging
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ── 格式常量 ──

# MarkItDown 支持的所有格式
SUPPORTED_EXTENSIONS: set[str] = {
    # 文档
    "pdf", "docx", "doc", "pptx", "ppt",
    # 表格
    "xlsx", "xls", "csv",
    # 网页 / 文本
    "html", "htm", "txt", "md",
    # 数据
    "json", "xml",
    # 图片（仅提取 EXIF 元数据）
    "jpg", "jpeg", "png", "gif", "bmp", "tiff",
}

# 纯文本格式——直接读取无需转换
_PLAINTEXT_EXTENSIONS: set[str] = {"txt", "md"}

# 知识库上传允许的子集（与 knowledge.py ALLOWED_TYPES 保持一致 + 新增）
KB_ALLOWED_EXTENSIONS: set[str] = {
    "pdf", "docx", "doc", "txt", "md", "csv", "xlsx", "xls",
    "pptx", "ppt", "html", "htm", "json", "xml",
}

# 公文导入允许的子集
DOC_IMPORT_EXTENSIONS: set[str] = {
    "pdf", "docx", "doc", "txt", "md", "csv", "xlsx",
    "pptx", "html", "htm",
}


# ── 结果数据类 ──

@dataclass
class DocumentConvertResult:
    """文档转换结果"""
    markdown: str = ""
    title: str = ""
    success: bool = True
    error_message: str = ""
    source_format: str = ""
    char_count: int = 0

    def __post_init__(self):
        self.char_count = len(self.markdown)


# ── 公开 API ──

async def convert_file_to_markdown(
    file_path: str | Path,
    file_name: str = "",
) -> DocumentConvertResult:
    """
    将本地文件转换为 Markdown（异步）。

    Args:
        file_path: 本地文件绝对路径
        file_name: 原始文件名（用于推断格式和标题）

    Returns:
        DocumentConvertResult
    """
    file_path = Path(file_path)
    if not file_path.exists():
        return DocumentConvertResult(
            success=False,
            error_message=f"文件不存在: {file_path}",
        )

    ext = file_path.suffix.lstrip(".").lower()
    title = Path(file_name).stem if file_name else file_path.stem

    # ── 纯文本直接读取 ──
    if ext in _PLAINTEXT_EXTENSIONS:
        content = _read_text_safe(file_path)
        return DocumentConvertResult(markdown=content, title=title, source_format=ext)

    # ── MarkItDown 转换（线程池避免阻塞事件循环） ──
    loop = asyncio.get_running_loop()
    try:
        md_text = await loop.run_in_executor(
            None,
            _sync_convert_with_markitdown,
            str(file_path),
        )
        md_text = _post_process_markdown(md_text)
        return DocumentConvertResult(markdown=md_text, title=title, source_format=ext)

    except Exception as e:
        logger.warning(f"MarkItDown 转换失败 [{file_name or file_path.name}]: {e}")

        # ── 降级处理 ──
        fallback_text = await _run_fallback(file_path, ext)
        if fallback_text is not None:
            logger.info(f"降级转换成功 [{file_name or file_path.name}]")
            return DocumentConvertResult(
                markdown=_post_process_markdown(fallback_text),
                title=title,
                source_format=ext,
            )

        return DocumentConvertResult(
            success=False,
            title=title,
            error_message=f"文档转换失败: {str(e)}",
            source_format=ext,
        )


async def convert_bytes_to_markdown(
    content_bytes: bytes,
    file_name: str,
) -> DocumentConvertResult:
    """
    将文件字节内容转换为 Markdown。

    内部先写入临时文件（MarkItDown 需要文件路径），转换完成后自动清理。

    Args:
        content_bytes: 文件二进制内容
        file_name:     原始文件名（含扩展名）

    Returns:
        DocumentConvertResult
    """
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    suffix = f".{ext}"

    # 写入临时文件
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(content_bytes)
        tmp.close()
        return await convert_file_to_markdown(tmp.name, file_name)
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:
            pass


async def save_markdown_file(
    md_content: str,
    target_dir: str | Path,
    file_id: str,
) -> Path:
    """
    将 Markdown 内容保存到指定目录。

    Args:
        md_content: Markdown 文本
        target_dir: 目标目录路径
        file_id:    文件标识（不含扩展名）

    Returns:
        保存后的文件 Path
    """
    target_dir = Path(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    md_path = target_dir / f"{file_id}.md"

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        lambda: md_path.write_text(md_content, encoding="utf-8"),
    )
    return md_path


# ── 工具函数 ──

def is_supported_format(ext: str) -> bool:
    """检查扩展名是否受支持"""
    return ext.lower().lstrip(".") in SUPPORTED_EXTENSIONS


def get_supported_formats() -> list[str]:
    """返回所有支持的文件扩展名（已排序）"""
    return sorted(SUPPORTED_EXTENSIONS)


# ── 内部实现 ──

def _sync_convert_with_markitdown(file_path: str) -> str:
    """同步调用 MarkItDown 进行转换（在 run_in_executor 中被调用）"""
    from markitdown import MarkItDown

    md_converter = MarkItDown(enable_plugins=False)
    result = md_converter.convert(file_path)
    return result.text_content or ""


def _read_text_safe(file_path: Path) -> str:
    """安全读取文本文件，自动探测编码"""
    for encoding in ("utf-8", "utf-8-sig", "gbk", "gb2312", "gb18030", "latin-1"):
        try:
            return file_path.read_text(encoding=encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    # 最终兜底：用 errors='replace' 强制读取
    return file_path.read_text(encoding="utf-8", errors="replace")


def _post_process_markdown(text: str) -> str:
    """清理/规范化 Markdown 文本"""
    if not text:
        return ""

    lines = text.split("\n")
    cleaned: list[str] = []
    consecutive_blank = 0

    for line in lines:
        if line.strip() == "":
            consecutive_blank += 1
            if consecutive_blank <= 2:
                cleaned.append("")
        else:
            consecutive_blank = 0
            cleaned.append(line)

    result = "\n".join(cleaned).strip()

    # 确保标题前有空行（更好的 Markdown 格式）
    result = re.sub(r"([^\n])\n(#{1,6}\s)", r"\1\n\n\2", result)

    return result


# ── 降级转换器 ──

async def _run_fallback(file_path: Path, ext: str) -> str | None:
    """根据文件类型尝试降级转换"""
    loop = asyncio.get_running_loop()
    try:
        if ext in ("csv",):
            return await loop.run_in_executor(None, _fallback_csv, file_path)
        elif ext in ("xlsx", "xls"):
            return await loop.run_in_executor(None, _fallback_xlsx, file_path)
        elif ext in ("docx",):
            return await loop.run_in_executor(None, _fallback_docx, file_path)
        elif ext in ("html", "htm"):
            return await loop.run_in_executor(None, _fallback_html, file_path)
        elif ext in ("json",):
            return await loop.run_in_executor(None, _fallback_json, file_path)
        elif ext in ("xml",):
            return await loop.run_in_executor(None, _fallback_xml, file_path)
    except Exception as e:
        logger.warning(f"降级转换也失败 [{ext}]: {e}")
    return None


def _fallback_csv(file_path: Path) -> str:
    """CSV → Markdown 表格"""
    text = _read_text_safe(file_path)
    reader = csv_mod.reader(text.splitlines())
    rows = list(reader)
    if not rows:
        return ""

    header = rows[0]
    col_count = len(header)
    md_lines = [
        "| " + " | ".join(h.strip() for h in header) + " |",
        "| " + " | ".join(["---"] * col_count) + " |",
    ]
    for row in rows[1:]:
        padded = (row + [""] * col_count)[:col_count]
        md_lines.append("| " + " | ".join(c.strip() for c in padded) + " |")

    return "\n".join(md_lines)


def _fallback_xlsx(file_path: Path) -> str:
    """XLSX → Markdown 表格（每个 Sheet 一个节）"""
    from openpyxl import load_workbook

    wb = load_workbook(str(file_path), read_only=True, data_only=True)
    md_parts: list[str] = []

    for ws in wb.worksheets:
        md_parts.append(f"## {ws.title}\n")
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            md_parts.append("_(空表)_\n")
            continue

        header = [str(c) if c is not None else "" for c in rows[0]]
        col_count = len(header)
        md_parts.append("| " + " | ".join(header) + " |")
        md_parts.append("| " + " | ".join(["---"] * col_count) + " |")

        for row in rows[1:]:
            cells = [str(c) if c is not None else "" for c in row]
            padded = (cells + [""] * col_count)[:col_count]
            md_parts.append("| " + " | ".join(padded) + " |")

        md_parts.append("")

    wb.close()
    return "\n".join(md_parts)


def _fallback_docx(file_path: Path) -> str:
    """DOCX → Markdown（保留标题层级和表格）"""
    import docx

    doc = docx.Document(str(file_path))
    parts: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            parts.append("")
            continue

        # 根据 Word 样式推断标题级别
        style_name = para.style.name if para.style else ""
        if style_name.startswith("Heading"):
            try:
                level = int(style_name.replace("Heading", "").strip().split()[0])
                level = max(1, min(level, 6))
            except (ValueError, IndexError):
                level = 1
            parts.append(f"\n{'#' * level} {text}\n")
        elif style_name == "Title":
            parts.append(f"\n# {text}\n")
        elif style_name == "Subtitle":
            parts.append(f"\n## {text}\n")
        elif style_name.startswith("List"):
            parts.append(f"- {text}")
        else:
            # 处理粗体/斜体（简单探测）
            runs_md = _docx_runs_to_markdown(para)
            parts.append(runs_md if runs_md else text)

    # 处理表格
    for table in doc.tables:
        parts.append("")
        for i, row in enumerate(table.rows):
            cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
            parts.append("| " + " | ".join(cells) + " |")
            if i == 0:
                parts.append("| " + " | ".join(["---"] * len(cells)) + " |")
        parts.append("")

    return "\n".join(parts)


def _docx_runs_to_markdown(para) -> str:
    """将 Word 段落的 runs 转为 Markdown 格式文本（粗体/斜体）"""
    if not para.runs:
        return ""

    parts: list[str] = []
    for run in para.runs:
        text = run.text
        if not text:
            continue
        if run.bold and run.italic:
            parts.append(f"***{text}***")
        elif run.bold:
            parts.append(f"**{text}**")
        elif run.italic:
            parts.append(f"*{text}*")
        else:
            parts.append(text)

    return "".join(parts)


def _fallback_html(file_path: Path) -> str:
    """HTML → Markdown（简易标签剥离）"""
    content = _read_text_safe(file_path)

    # 移除 script / style
    content = re.sub(r"<script[^>]*>.*?</script>", "", content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r"<style[^>]*>.*?</style>", "", content, flags=re.DOTALL | re.IGNORECASE)

    # 段落 / 换行
    content = re.sub(r"<br\s*/?>", "\n", content, flags=re.IGNORECASE)
    content = re.sub(r"</p>", "\n\n", content, flags=re.IGNORECASE)
    content = re.sub(r"</div>", "\n", content, flags=re.IGNORECASE)

    # 标题
    for level in range(1, 7):
        content = re.sub(
            rf"<h{level}[^>]*>(.*?)</h{level}>",
            rf"\n\n{'#' * level} \1\n\n",
            content,
            flags=re.IGNORECASE | re.DOTALL,
        )

    # 列表项
    content = re.sub(r"<li[^>]*>(.*?)</li>", r"\n- \1", content, flags=re.IGNORECASE | re.DOTALL)

    # 链接
    content = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r"[\2](\1)", content, flags=re.IGNORECASE | re.DOTALL)

    # 粗体 / 斜体
    content = re.sub(r"<(strong|b)[^>]*>(.*?)</\1>", r"**\2**", content, flags=re.IGNORECASE | re.DOTALL)
    content = re.sub(r"<(em|i)[^>]*>(.*?)</\1>", r"*\2*", content, flags=re.IGNORECASE | re.DOTALL)

    # 剥离剩余标签
    content = re.sub(r"<[^>]+>", "", content)

    # HTML 实体
    content = content.replace("&nbsp;", " ").replace("&amp;", "&")
    content = content.replace("&lt;", "<").replace("&gt;", ">")
    content = content.replace("&quot;", '"')

    # 清理多余空白
    content = re.sub(r"\n{3,}", "\n\n", content)
    return content.strip()


def _fallback_json(file_path: Path) -> str:
    """JSON → Markdown 代码块"""
    import json

    text = _read_text_safe(file_path)
    try:
        parsed = json.loads(text)
        formatted = json.dumps(parsed, ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        formatted = text

    return f"```json\n{formatted}\n```"


def _fallback_xml(file_path: Path) -> str:
    """XML → Markdown 代码块"""
    text = _read_text_safe(file_path)
    return f"```xml\n{text}\n```"
