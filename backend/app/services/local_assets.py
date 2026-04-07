"""本地文件安全访问与预览转换公共适配层。"""

from pathlib import Path

from app.core.config import settings
from app.services.doc_converter import convert_to_pdf_bytes


def is_safe_upload_path(file_path: str | Path) -> bool:
    """校验文件路径在 UPLOAD_DIR 范围内，防止路径遍历攻击。"""
    try:
        resolved = Path(file_path).resolve()
        upload_root = Path(settings.UPLOAD_DIR).resolve()
        return resolved.is_relative_to(upload_root)
    except (TypeError, ValueError, OSError):
        return False


def resolve_safe_existing_path(file_path: str | Path | None) -> Path | None:
    """返回安全且存在的本地文件路径；不满足时返回 None。"""
    if not file_path:
        return None
    path = Path(file_path)
    if not is_safe_upload_path(path):
        return None
    if not path.exists():
        return None
    return path


def read_safe_text_file(
    file_path: str | Path | None,
    *,
    encoding: str = "utf-8",
) -> str | None:
    """读取安全且存在的文本文件；不满足时返回 None。"""
    path = resolve_safe_existing_path(file_path)
    if not path:
        return None
    return path.read_text(encoding=encoding)


async def ensure_pdf_preview_file(
    source_path: Path,
    *,
    source_name: str,
    cache_path: Path | None = None,
    source_ext: str | None = None,
) -> Path | None:
    """返回可直接预览的 PDF 文件路径，必要时调用 converter 并写入缓存。"""
    if not source_path.exists():
        return None

    ext = (source_ext or source_path.suffix.lstrip(".")).lower()
    if ext == "pdf":
        return source_path

    preview_path = cache_path or (source_path.parent / "preview.pdf")
    if preview_path.exists() and preview_path.stat().st_size > 0:
        return preview_path

    pdf_bytes = await convert_to_pdf_bytes(source_path.read_bytes(), source_name)
    if not pdf_bytes:
        return None

    preview_path.write_bytes(pdf_bytes)
    return preview_path
