"""公文管理路由"""

import csv
import io
import json
import logging
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission, get_current_user
from app.core.audit import log_action
from app.models.user import User
from app.models.document import Document, DocumentVersion
from app.schemas.document import (
    DocumentCreateRequest, DocumentUpdateRequest, DocProcessRequest,
    DocumentListItem, DocumentDetail, DocumentVersionItem, DocumentVersionDetail,
    DocumentExportRequest,
)
from app.services.dify.factory import get_dify_service
from app.services.docformat.service import DocFormatService
from app.services.doc_converter import (
    convert_bytes_to_markdown,
    convert_and_extract,
    convert_to_pdf_bytes,
    save_markdown_file,
    DOC_IMPORT_EXTENSIONS,
)

router = APIRouter(prefix="/documents", tags=["Documents"])

# MIME 映射
_MIME_MAP = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "csv": "text/csv",
    "txt": "text/plain",
    "md": "text/markdown",
    "html": "text/html",
    "htm": "text/html",
    "json": "application/json",
    "xml": "application/xml",
}


@router.get("")
async def list_documents(
    category: str = Query(..., description="doc 或 template"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    doc_type: str = Query(None),
    status: str = Query(None),
    security: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """公文列表"""
    query = select(Document).where(Document.category == category)

    if keyword:
        query = query.where(Document.title.ilike(f"%{keyword}%"))
    if doc_type:
        query = query.where(Document.doc_type == doc_type)
    if status:
        query = query.where(Document.status == status)
    if security:
        query = query.where(Document.security == security)
    if start_date:
        query = query.where(Document.updated_at >= start_date)
    if end_date:
        query = query.where(Document.updated_at <= end_date + " 23:59:59")

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Document.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    docs = result.scalars().all()

    # 批量查创建者姓名
    creator_ids = {d.creator_id for d in docs}
    creator_map = {}
    if creator_ids:
        from app.models.user import User as U
        cr = await db.execute(select(U.id, U.display_name).where(U.id.in_(creator_ids)))
        creator_map = {row[0]: row[1] for row in cr.all()}

    items = [
        {
            **DocumentListItem.model_validate(d).model_dump(mode="json"),
            "creator_name": creator_map.get(d.creator_id, ""),
        }
        for d in docs
    ]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("")
async def create_document(
    body: DocumentCreateRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """创建公文"""
    doc = Document(
        creator_id=current_user.id,
        title=body.title,
        category=body.category,
        doc_type=body.doc_type,
        content=body.content,
        urgency=body.urgency,
        security=body.security,
    )
    db.add(doc)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建公文", module="智能公文",
        detail=f"创建{'公文' if body.category == 'doc' else '模板'}: {body.title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(doc.id)}, message="创建成功")


@router.post("/import")
async def import_document(
    request: Request,
    file: UploadFile = File(None, description="支持 PDF/Word/Excel/PPT/TXT/HTML 等格式，可为空"),
    category: str = Form("doc"),
    doc_type: str = Form("report"),
    security: str = Form("internal"),
    title: str = Form("", description="文档标题（不上传文件时使用）"),
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """
    导入文档为公文/模板。

    通过 converter 微服务将各类文档（PDF, DOCX, DOC, XLSX, CSV, TXT, MD, PPTX, HTML 等）
    提取文本内容，并生成 PDF 预览缓存。文件参数可为空，此时创建空白文档。
    """
    # ── 校验枚举参数 ──
    VALID_CATEGORIES = {"doc", "template"}
    VALID_DOC_TYPES = {"request", "report", "notice", "briefing", "ai_generated", "official", "academic", "legal", "custom"}
    VALID_SECURITIES = {"public", "internal", "secret", "confidential"}

    if category not in VALID_CATEGORIES:
        return error(ErrorCode.PARAM_INVALID, f"category 必须为 {VALID_CATEGORIES} 之一，收到: '{category}'")
    if doc_type not in VALID_DOC_TYPES:
        return error(ErrorCode.PARAM_INVALID, f"doc_type 必须为 {VALID_DOC_TYPES} 之一，收到: '{doc_type}'")
    if security not in VALID_SECURITIES:
        return error(ErrorCode.PARAM_INVALID, f"security 必须为 {VALID_SECURITIES} 之一，收到: '{security}'")

    # ── 判断是否有文件上传 ──
    has_file = file is not None and file.filename
    content_bytes = b""
    content = ""
    file_name = ""
    ext = ""
    char_count = 0
    convert_result = None

    if has_file:
        file_name = file.filename or "unknown.docx"
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

        if ext not in DOC_IMPORT_EXTENSIONS:
            supported = ", ".join(sorted(DOC_IMPORT_EXTENSIONS))
            return error(ErrorCode.PARAM_INVALID, f"不支持的文件格式 .{ext}，支持: {supported}")

        content_bytes = await file.read()
        if content_bytes:
            # ── 使用 converter 微服务提取文本 + 生成 PDF ──
            convert_result = await convert_and_extract(content_bytes, file_name)

            if not convert_result.success:
                return error(
                    ErrorCode.FILE_UPLOAD_ERROR,
                    f"文档解析失败: {convert_result.error_message}",
                )

            content = convert_result.markdown or ""
            char_count = convert_result.char_count

    # 提取标题：优先用传入的 title 参数，其次用文件名，最后用默认值
    doc_title = title.strip() if title and title.strip() else (
        file_name.rsplit(".", 1)[0] if file_name and "." in file_name else (
            file_name or "新建公文"
        )
    )

    # ── 创建文档记录（先 flush 获取 ID） ──
    doc = Document(
        creator_id=current_user.id,
        title=doc_title,
        category=category,
        doc_type=doc_type,
        content=content,
        urgency="normal",
        security=security,
        source_format=ext or "txt",
    )
    db.add(doc)
    await db.flush()

    # ── 持久化源文件到磁盘（仅在有文件时） ──
    upload_dir = Path(settings.UPLOAD_DIR) / "documents" / str(doc.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    if content_bytes:
        source_path = upload_dir / f"source.{ext}"
        source_path.write_bytes(content_bytes)
        doc.source_file_path = str(source_path)

    # ── 如果 converter 返回了 PDF 路径，复制为预览缓存 ──
    if convert_result and convert_result.pdf_path:
        try:
            import shutil
            pdf_src = Path(convert_result.pdf_path)
            if pdf_src.exists():
                pdf_cache = upload_dir / "preview.pdf"
                shutil.copy2(pdf_src, pdf_cache)
        except Exception as e:
            logging.getLogger(__name__).warning(f"PDF 缓存复制失败: {e}")

    # ── 持久化提取的文本到磁盘 ──
    if content:
        md_path = await save_markdown_file(content, upload_dir, "content")
        doc.md_file_path = str(md_path)
    await db.flush()

    action_detail = (
        f"导入文件: {file_name} → {doc_title} (格式: {ext}, 字符数: {char_count})"
        if has_file else f"创建空白文档: {doc_title}"
    )
    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="导入公文", module="智能公文",
        detail=action_detail,
        ip_address=request.client.host if request.client else None,
    )

    return success(
        data={
            "id": str(doc.id),
            "title": doc_title,
            "format": ext or "txt",
            "char_count": char_count,
            "has_source_file": bool(content_bytes),
            "has_markdown_file": bool(content),
        },
        message="导入成功" if has_file else "空白文档创建成功",
    )


@router.post("/export")
async def export_documents(
    body: DocumentExportRequest,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """导出公文为 ZIP 压缩包（包含原始文件或文本内容）"""
    # 构建查询
    if body.ids:
        query = select(Document).where(Document.id.in_(body.ids))
    else:
        query = select(Document).where(Document.category == "doc")

    query = query.order_by(Document.updated_at.desc()).limit(5000)
    result = await db.execute(query)
    docs = result.scalars().all()

    if not docs:
        return error(ErrorCode.PARAM_INVALID, "没有可导出的文档")

    # 创建 ZIP 压缩包
    buf = io.BytesIO()
    seen_names: set[str] = set()

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for d in docs:
            base_name = d.title or "未命名"
            ext = d.source_format or "txt"

            # 生成唯一文件名
            file_name = f"{base_name}.{ext}"
            counter = 1
            while file_name in seen_names:
                file_name = f"{base_name}_{counter}.{ext}"
                counter += 1
            seen_names.add(file_name)

            if d.source_file_path and Path(d.source_file_path).exists():
                # 有原始文件 → 直接添加到 ZIP
                zf.write(d.source_file_path, file_name)
            elif d.content:
                # 无原始文件 → 将内容保存为 .md
                md_name = f"{base_name}.md"
                cnt = 1
                while md_name in seen_names:
                    md_name = f"{base_name}_{cnt}.md"
                    cnt += 1
                seen_names.add(md_name)
                zf.writestr(md_name, d.content)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=documents_export.zip"},
    )


# ── 结构化排版导出 DOCX ──

# 字号名 → pt 映射
_FONT_SIZE_PT = {
    "初号": 42, "小初": 36, "一号": 26, "小一": 24,
    "二号": 22, "小二": 18, "三号": 16, "小三": 15,
    "四号": 14, "小四": 12, "五号": 10.5, "小五": 9,
}

# ── style_type 归一化（与前端 StructuredDocRenderer 保持一致）──
_VALID_STYLE_TYPES = {
    "title", "heading1", "heading2", "heading3", "heading4",
    "body", "recipient", "signature", "date", "attachment", "closing",
}

def _normalize_style_type(raw: str | None) -> str:
    if not raw:
        return "body"
    t = raw.strip().lower()
    if t in _VALID_STYLE_TYPES:
        return t
    if "title" in t or t == "标题":
        return "title"
    if "heading" in t and "1" in t or "一级" in t:
        return "heading1"
    if "heading" in t and "2" in t or "二级" in t:
        return "heading2"
    if "heading" in t and "3" in t or "三级" in t:
        return "heading3"
    if "heading" in t and "4" in t or "四级" in t:
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


# ════════════════════════════════════════════════════════════
# GB/T 9704 公文样式预设（与前端 StructuredDocRenderer.STYLE_PRESETS 完全对齐）
# 每种 preset 下按 style_type 定义默认：font_family, font_size_pt, alignment,
# indent_em, line_height, bold, space_before_pt, space_after_pt
# ════════════════════════════════════════════════════════════
_STYLE_PRESETS: dict[str, dict[str, dict]] = {
    "official": {
        # space_before / space_after 单位 pt，与前端 em 换算：1em ≈ 当前字号(pt)
        # title: 首段，space_before=0；space_after 由红线逻辑覆盖
        "title":      {"font_family": "方正小标宋简体", "font_size_pt": 22, "alignment": "center", "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 8},
        # recipient: 前端 marginTop 0.8em=12.8pt（由 getSpacingTop 动态规则覆盖）
        "recipient":  {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
        # heading1: 前端入场 1em=16pt, heading→heading 0.4em=6pt
        "heading1":   {"font_family": "黑体",           "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 14, "space_after_pt": 2},
        "heading2":   {"font_family": "楷体_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 14, "space_after_pt": 2},
        "heading3":   {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": True,  "space_before_pt": 8,  "space_after_pt": 2},
        "heading4":   {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 8,  "space_after_pt": 2},
        "body":       {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
        # signature: 前端入场 1.5em=24pt
        "signature":  {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 20, "space_after_pt": 0},
        "date":       {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
        # attachment: 前端入场 1.2em=19.2pt
        "attachment": {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 16, "space_after_pt": 0},
        "closing":    {"font_family": "仿宋_GB2312",    "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
    },
    "academic": {
        "title":    {"font_family": "黑体",        "font_size_pt": 18, "alignment": "center", "indent_em": 0, "line_height": 1.8, "bold": True,  "space_before_pt": 20, "space_after_pt": 20},
        "heading1": {"font_family": "黑体",        "font_size_pt": 15, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True,  "space_before_pt": 10, "space_after_pt": 6},
        "heading2": {"font_family": "黑体",        "font_size_pt": 14, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True,  "space_before_pt": 8,  "space_after_pt": 4},
        "heading3": {"font_family": "楷体_GB2312", "font_size_pt": 14, "alignment": "left",   "indent_em": 0, "line_height": 1.8, "bold": True,  "space_before_pt": 6,  "space_after_pt": 4},
        "body":     {"font_family": "仿宋_GB2312", "font_size_pt": 12, "alignment": "justify","indent_em": 2, "line_height": 1.8, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
        "signature":{"font_family": "仿宋_GB2312", "font_size_pt": 12, "alignment": "right",  "indent_em": 0, "line_height": 1.8, "bold": False, "space_before_pt": 12, "space_after_pt": 0},
    },
    "legal": {
        "title":    {"font_family": "方正小标宋简体","font_size_pt": 26, "alignment": "center", "indent_em": 0, "line_height": 2.2, "bold": False, "space_before_pt": 20, "space_after_pt": 20},
        "heading1": {"font_family": "黑体",        "font_size_pt": 16, "alignment": "left",   "indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 10, "space_after_pt": 6},
        "body":     {"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "justify","indent_em": 2, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
        "signature":{"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 12, "space_after_pt": 0},
        "date":     {"font_family": "仿宋_GB2312", "font_size_pt": 16, "alignment": "right",  "indent_em": 0, "line_height": 2.0, "bold": False, "space_before_pt": 0,  "space_after_pt": 0},
    },
}

# alignment 归一化
_ALIGN_ALIAS = {
    "居中": "center", "居右": "right", "居左": "left",
    "右对齐": "right", "左对齐": "left", "两端对齐": "justify", "两端": "justify",
}


def _resolve_font_size_pt(raw: str | None) -> float | None:
    """将 LLM 的 font_size 字符串解析为 pt 数值"""
    if not raw:
        return None
    t = raw.strip()
    if t in _FONT_SIZE_PT:
        return _FONT_SIZE_PT[t]
    # "16pt"
    import re
    m = re.match(r'^([\d.]+)\s*pt$', t, re.IGNORECASE)
    if m:
        return float(m.group(1))
    # 纯数字 → pt
    if re.match(r'^[\d.]+$', t):
        return float(t)
    return None


def _resolve_alignment(raw: str | None) -> str | None:
    if not raw:
        return None
    t = raw.strip().lower()
    if t in ("center", "right", "left", "justify"):
        return t
    return _ALIGN_ALIAS.get(t)


def _resolve_indent_em(raw: str | None) -> float | None:
    """解析首行缩进值（em），返回 None 表示未指定"""
    if raw is None:
        return None
    t = str(raw).strip()
    if t in ("", "none", "无"):
        return 0.0
    if t == "0":
        return 0.0
    import re
    m = re.match(r'^([\d.]+)\s*(em)?$', t)
    if m:
        return float(m.group(1))
    return None


def _resolve_line_height(raw: str | None) -> float | None:
    """解析行高为倍数值"""
    if not raw:
        return None
    t = str(raw).strip()
    import re
    m = re.match(r'^([\d.]+)\s*pt$', t, re.IGNORECASE)
    if m:
        return None  # pt 行高需要另行处理
    if re.match(r'^[\d.]+$', t):
        val = float(t)
        if val <= 5:
            return val  # 倍数
    return None


def _build_formatted_docx(paragraphs: list[dict], title: str, preset: str = "official"):
    """
    根据 StructuredDocRenderer 的 STYLE_PRESETS 逻辑生成高质量 DOCX。
    与前端实时预览保持像素级一致：
    - 先取 preset 默认值，再用 LLM 显式输出的属性覆盖
    - 固定行距（Exactly）精确匹配 CSS lineHeight（font_size × multiplier）
    - 四槽字体设置（ascii / hAnsi / eastAsia / cs）
    - GB/T 9704 红头文件红线直接附在标题段落底边框上（无多余空段落）
    - 署名右缩进、页码等细节
    """
    from docx import Document as DocxDocument
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    import re as _re

    doc = DocxDocument()

    # ── 全局默认样式：清理 Normal 样式避免干扰 ──
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Times New Roman'
    normal_style.font.size = Pt(16)
    # 通过 XML 统一设置段落间距 + 固定行距，避免 python-docx API 生成重复节点
    nPr = normal_style.element.get_or_add_pPr()
    existing_spacing = nPr.find(qn('w:spacing'))
    if existing_spacing is not None:
        nPr.remove(existing_spacing)
    nSpacing = OxmlElement('w:spacing')
    nSpacing.set(qn('w:line'), '640')     # 16pt * 2.0 * 20 twips = 640
    nSpacing.set(qn('w:lineRule'), 'exact')
    nSpacing.set(qn('w:before'), '0')
    nSpacing.set(qn('w:after'), '0')
    nPr.append(nSpacing)
    normal_style.element.rPr.rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')

    # ── 页面设置（GB/T 9704-2012 标准） ──
    for section in doc.sections:
        section.top_margin = Cm(3.7)
        section.bottom_margin = Cm(3.5)
        section.left_margin = Cm(2.8)
        section.right_margin = Cm(2.6)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        # 页码（居中，— n — 格式）
        footer = section.footer
        footer.is_linked_to_previous = False
        fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        # 页码前缀
        run_prefix = fp.add_run("— ")
        run_prefix.font.size = Pt(9)
        run_prefix.font.name = 'Times New Roman'
        # PAGE 域: begin
        run_begin = fp.add_run()
        run_begin.font.size = Pt(9)
        fld_begin = OxmlElement('w:fldChar')
        fld_begin.set(qn('w:fldCharType'), 'begin')
        run_begin._element.append(fld_begin)
        # PAGE 域: instrText
        run_instr = fp.add_run()
        run_instr.font.size = Pt(9)
        instr = OxmlElement('w:instrText')
        instr.set(qn('xml:space'), 'preserve')
        instr.text = ' PAGE '
        run_instr._element.append(instr)
        # PAGE 域: end
        run_end = fp.add_run()
        run_end.font.size = Pt(9)
        fld_end = OxmlElement('w:fldChar')
        fld_end.set(qn('w:fldCharType'), 'end')
        run_end._element.append(fld_end)
        # 页码后缀
        run_suffix = fp.add_run(" —")
        run_suffix.font.size = Pt(9)
        run_suffix.font.name = 'Times New Roman'

    alignment_map = {
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }

    # 字体别名归一化
    _FONT_ALIAS = {
        "仿宋": "仿宋_GB2312", "fangsong": "仿宋_GB2312", "FangSong": "仿宋_GB2312",
        "华文仿宋": "仿宋_GB2312", "STFangsong": "仿宋_GB2312",
        "楷体": "楷体_GB2312", "kaiti": "楷体_GB2312", "KaiTi": "楷体_GB2312",
        "华文楷体": "楷体_GB2312", "STKaiti": "楷体_GB2312",
        "黑体": "黑体", "SimHei": "黑体", "heiti": "黑体",
        "宋体": "宋体", "SimSun": "宋体", "songti": "宋体",
        "方正小标宋简体": "方正小标宋简体", "FZXiaoBiaoSong": "方正小标宋简体",
        "方正小标宋": "方正小标宋简体",
        "微软雅黑": "微软雅黑", "Microsoft YaHei": "微软雅黑",
        "华文中宋": "华文中宋", "STZhongsong": "华文中宋",
    }

    def _normalize_font(raw: str) -> str:
        return _FONT_ALIAS.get(raw.strip(), raw.strip())

    def _set_run_font(run, cn_font: str, en_font: str | None = None):
        """精确设置 run 的四槽字体（ASCII/Latin 统一用 Times New Roman）"""
        if en_font is None:
            en_font = 'Times New Roman'
        run.font.name = en_font
        rPr = run._element.get_or_add_rPr()
        rFonts = rPr.find(qn('w:rFonts'))
        if rFonts is None:
            rFonts = OxmlElement('w:rFonts')
            rPr.insert(0, rFonts)
        rFonts.set(qn('w:ascii'), en_font)
        rFonts.set(qn('w:hAnsi'), en_font)
        rFonts.set(qn('w:eastAsia'), cn_font)
        rFonts.set(qn('w:cs'), en_font)

    def _set_exact_line_spacing(para, font_size_pt: float, multiplier: float):
        """
        设置固定行距以精确匹配 CSS lineHeight。
        CSS lineHeight: N = N × font-size。
        Word Exactly: line 值单位为 twips（1pt = 20 twips）。
        exact_pt = font_size_pt × multiplier → twips = exact_pt × 20
        """
        exact_twips = int(font_size_pt * multiplier * 20)
        pPr = para._element.get_or_add_pPr()
        spacing = pPr.find(qn('w:spacing'))
        if spacing is None:
            spacing = OxmlElement('w:spacing')
            pPr.append(spacing)
        spacing.set(qn('w:line'), str(exact_twips))
        spacing.set(qn('w:lineRule'), 'exact')

    def _add_bottom_border_to_para(para, color: str = 'CC0000', sz: str = '18'):
        """直接给段落添加底边框（红线），不创建额外空段落"""
        pPr = para._element.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), sz)      # 1/8pt 为单位, 18 = 2.25pt
        bottom.set(qn('w:space'), '6')  # 边框与文字间距（pt）
        bottom.set(qn('w:color'), color)
        pBdr.append(bottom)
        pPr.append(pBdr)

    preset_styles = _STYLE_PRESETS.get(preset, _STYLE_PRESETS["official"])
    body_default = preset_styles.get("body", _STYLE_PRESETS["official"]["body"])

    prev_style_type = None

    # 将段内换行拆分为多个段落，避免 Word 内部换行导致格式混乱
    expanded_paragraphs: list[dict] = []
    for _p in paragraphs:
        _text = str(_p.get("text", ""))
        if "\n" in _text:
            for _line in _text.splitlines():
                _np = dict(_p)
                _np["text"] = _line
                expanded_paragraphs.append(_np)
        else:
            expanded_paragraphs.append(_p)

    for para_data in expanded_paragraphs:
        text = para_data.get("text", "")
        if not text.strip():
            # 空段落：最小高度，避免占用整行
            empty_p = doc.add_paragraph("")
            empty_p.paragraph_format.space_before = Pt(0)
            empty_p.paragraph_format.space_after = Pt(0)
            _set_exact_line_spacing(empty_p, 6, 1.0)  # 6pt 极小行高
            continue

        # 1) 归一化 style_type
        style_type = _normalize_style_type(para_data.get("style_type"))

        # 2) 取 preset 默认值
        defaults = preset_styles.get(style_type, body_default)

        # 3) 解析 LLM 显式属性
        llm_font_family = para_data.get("font_family") or None
        llm_font_size_pt = _resolve_font_size_pt(para_data.get("font_size"))
        llm_alignment = _resolve_alignment(para_data.get("alignment"))
        llm_indent_em = _resolve_indent_em(para_data.get("indent"))
        llm_line_height = _resolve_line_height(para_data.get("line_height"))
        llm_bold = para_data.get("bold")
        llm_italic = para_data.get("italic")
        llm_color = para_data.get("color")

        # 4) 合并：LLM → preset → global default
        final_cn_font = _normalize_font(llm_font_family) if llm_font_family else defaults["font_family"]
        final_font_size_pt = llm_font_size_pt if llm_font_size_pt is not None else defaults["font_size_pt"]
        final_alignment = llm_alignment or defaults["alignment"]
        final_indent_em = llm_indent_em if llm_indent_em is not None else defaults["indent_em"]
        final_line_height = llm_line_height if llm_line_height is not None else defaults["line_height"]
        final_bold = llm_bold if llm_bold is not None else defaults.get("bold", False)
        final_italic = llm_italic if llm_italic is not None else False

        # 解析颜色
        final_color = None
        if llm_color:
            c = str(llm_color).strip()
            _COLOR_NAME_MAP = {
                "黑色": "#000000", "红色": "#CC0000", "蓝色": "#0033CC",
                "绿色": "#006600", "紫色": "#800080", "深灰": "#333333",
                "灰色": "#666666",
                "black": "#000000", "red": "#CC0000", "blue": "#0033CC",
                "green": "#006600", "purple": "#800080",
            }
            if c.lower() in _COLOR_NAME_MAP:
                c = _COLOR_NAME_MAP[c.lower()]
            elif c in _COLOR_NAME_MAP:
                c = _COLOR_NAME_MAP[c]
            if not c.startswith("#"):
                c = "#" + c
            if _re.match(r'^#[0-9A-Fa-f]{6}$', c):
                final_color = c

        # ── 构建段落 ──
        p = doc.add_paragraph()

        # 对齐：短行使用左对齐，避免 Word 分散对齐导致字间距异常
        _effective_alignment = final_alignment
        if final_alignment == "justify":
            _t = text.strip()
            if len(_t) <= 20 or _t.endswith("：") or _t.endswith(":"):
                _effective_alignment = "left"
        p.alignment = alignment_map.get(_effective_alignment, WD_ALIGN_PARAGRAPH.JUSTIFY)

        # 首行缩进
        if final_indent_em and final_indent_em > 0:
            p.paragraph_format.first_line_indent = Pt(final_font_size_pt * final_indent_em)

        # ── 固定行距（精确匹配 CSS lineHeight） ──
        if final_line_height and final_line_height > 0:
            _set_exact_line_spacing(p, final_font_size_pt, final_line_height)

        # ── 段前段后间距 ──
        space_before = defaults.get("space_before_pt", 0)
        space_after = defaults.get("space_after_pt", 0)

        # 动态间距规则（与前端 getSpacingTop 完全对齐）
        if prev_style_type:
            if style_type == "title":
                pass
            elif style_type == "recipient" and prev_style_type == "title":
                space_before = max(space_before, 8)
            elif style_type.startswith("heading") and not prev_style_type.startswith("heading"):
                space_before = max(space_before, 12)
            elif style_type.startswith("heading") and prev_style_type.startswith("heading"):
                space_before = max(space_before, 4)
            elif style_type in ("signature", "date") and prev_style_type not in ("signature", "date"):
                space_before = max(space_before, 18)
            elif style_type == "attachment" and prev_style_type != "attachment":
                space_before = max(space_before, 14)

        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)

        # heading / title 保持与下段不分页
        if style_type.startswith("heading") or style_type == "title":
            p.paragraph_format.keep_with_next = True

        # 署名/日期右缩进
        if style_type in ("signature", "date") and final_alignment == "right":
            p.paragraph_format.right_indent = Cm(2.0)

        # ── 添加文本 Run ──
        run = p.add_run(text)

        # 字号
        run.font.size = Pt(final_font_size_pt)

        # 四槽字体（ASCII/Latin 也使用中文字体，避免细微差异）
        _set_run_font(run, final_cn_font)

        # 加粗
        run.font.bold = True if final_bold else False

        # 斜体
        if final_italic:
            run.font.italic = True

        # 颜色
        if final_color:
            try:
                r_val = int(final_color[1:3], 16)
                g_val = int(final_color[3:5], 16)
                b_val = int(final_color[5:7], 16)
                run.font.color.rgb = RGBColor(r_val, g_val, b_val)
            except (ValueError, TypeError):
                pass

        # ── 标题段落直接加底边框作红色分隔线（不创建多余空段落） ──
        # red_line 字段由 AI 控制：None/True → 显示, False → 隐藏
        para_red_line = para_data.get("red_line")
        if style_type == "title" and preset == "official" and para_red_line is not False:
            _add_bottom_border_to_para(p)
            # 标题底边框后需要额外段后间距让红线与正文拉开
            p.paragraph_format.space_after = Pt(14)

        prev_style_type = style_type

    # 输出到内存
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


class _ExportDocxRequest(BaseModel):
    paragraphs: list[dict]
    title: str = "排版文档"
    preset: str = "official"


@router.post("/{doc_id}/export-docx")
async def export_formatted_docx(
    doc_id: UUID,
    body: _ExportDocxRequest,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """将结构化段落数据导出为带格式的 DOCX 文件（与前端 StructuredDocRenderer 效果对齐）"""
    buf = _build_formatted_docx(body.paragraphs, body.title, body.preset)

    safe_title = body.title.replace("/", "_").replace("\\", "_")[:100]
    from urllib.parse import quote
    encoded_name = quote(f"{safe_title}.docx")

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=\"document.docx\"; filename*=UTF-8''{encoded_name}"
        },
    )


@router.post("/{doc_id}/export-pdf")
async def export_formatted_pdf(
    doc_id: UUID,
    body: _ExportDocxRequest,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """将结构化段落数据导出为高精度 PDF（Playwright Chromium 渲染，与前端预览像素级一致）"""
    from app.services.html_export import render_export_html, html_to_pdf_playwright

    try:
        html = render_export_html(body.paragraphs, body.title, body.preset)
        pdf_bytes = await html_to_pdf_playwright(html)
    except Exception as e:
        logging.getLogger(__name__).error(f"Playwright PDF 导出失败: {e}")
        # 降级：走 python-docx → converter 微服务
        buf = _build_formatted_docx(body.paragraphs, body.title, body.preset)
        docx_bytes = buf.getvalue()
        safe_title = body.title.replace("/", "_").replace("\\", "_")[:100]
        pdf_bytes = await convert_to_pdf_bytes(docx_bytes, f"{safe_title}.docx")
        if not pdf_bytes:
            return error(ErrorCode.INTERNAL_ERROR, "PDF 导出失败（Playwright 和 converter 均不可用）")

    safe_title = body.title.replace("/", "_").replace("\\", "_")[:100]
    pdf_buf = io.BytesIO(pdf_bytes)
    from urllib.parse import quote
    encoded_name = quote(f"{safe_title}.pdf")

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"document.pdf\"; filename*=UTF-8''{encoded_name}"
        },
    )


# ── 源文件下载 & Markdown 预览 ──


@router.get("/{doc_id}/source")
async def download_document_source(
    doc_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """
    下载公文的原始上传文件（PDF/DOCX/XLSX 等）。

    仅对通过 /import 导入的公文有效。
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    if not doc.source_file_path:
        return error(ErrorCode.NOT_FOUND, "此公文没有关联的源文件（可能是手动创建的公文）")

    source_path = Path(doc.source_file_path)
    if not source_path.exists():
        return error(ErrorCode.NOT_FOUND, "源文件已被删除或不可用")

    ext = doc.source_format or "bin"
    media_type = _MIME_MAP.get(ext, "application/octet-stream")
    # 文件名: 标题.原始扩展名
    download_name = f"{doc.title}.{ext}"

    return FileResponse(
        path=str(source_path),
        media_type=media_type,
        filename=download_name,
    )


@router.get("/{doc_id}/markdown")
async def get_document_markdown(
    doc_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """
    获取公文的 Markdown 文件内容（用于预览/对比）。

    返回磁盘上保存的 .md 文件内容。
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    if not doc.md_file_path:
        return error(ErrorCode.NOT_FOUND, "此公文没有关联的 Markdown 文件")

    md_path = Path(doc.md_file_path)
    if not md_path.exists():
        return error(ErrorCode.NOT_FOUND, "Markdown 文件已被删除或不可用")

    md_content = md_path.read_text(encoding="utf-8")
    return success(data={
        "document_id": str(doc_id),
        "title": doc.title,
        "source_format": doc.source_format,
        "markdown": md_content,
        "char_count": len(md_content),
    })


@router.get("/{doc_id}/preview-pdf")
async def preview_document_pdf(
    doc_id: UUID,
    token: str = Query(None, description="JWT token（用于 iframe 内嵌预览）"),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    获取公文的 PDF 预览。
    支持 Bearer header 或 ?token= 查询参数（iframe 场景）。

    策略:
      1. 如果源文件本身就是 PDF → 直接返回
      2. 如果有源文件（DOCX/XLSX 等）→ 通过 converter 微服务转为 PDF → 返回
      3. 如果仅有文本内容 → 返回 404（前端降级到 Markdown 预览）
    """
    # ── 手动鉴权：优先 header，降级到 query param ──
    from app.core.security import decode_access_token
    from app.core.redis import get_redis
    jwt_token = None
    auth_header = request.headers.get("authorization", "") if request else ""
    if auth_header.lower().startswith("bearer "):
        jwt_token = auth_header[7:]
    elif token:
        jwt_token = token
    if not jwt_token:
        return error(ErrorCode.TOKEN_INVALID, "未提供认证令牌")
    r = await get_redis()
    if await r.get(f"token_blacklist:{jwt_token}"):
        return error(ErrorCode.TOKEN_INVALID, "令牌已失效")
    user_id_str = decode_access_token(jwt_token)
    if not user_id_str:
        return error(ErrorCode.TOKEN_EXPIRED, "令牌已过期或无效")

    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    # 检查是否有源文件
    if not doc.source_file_path:
        return error(ErrorCode.NOT_FOUND, "此公文没有源文件，无法生成 PDF 预览")

    source_path = Path(doc.source_file_path)
    if not source_path.exists():
        return error(ErrorCode.NOT_FOUND, "源文件已被删除")

    ext = doc.source_format or ""

    # 如果源文件就是 PDF，直接返回
    if ext == "pdf":
        return FileResponse(
            path=str(source_path),
            media_type="application/pdf",
            filename=f"{doc.title}.pdf",
        )

    # 检查是否已有缓存的 PDF
    pdf_cache_path = source_path.parent / "preview.pdf"
    if pdf_cache_path.exists():
        return FileResponse(
            path=str(pdf_cache_path),
            media_type="application/pdf",
            filename=f"{doc.title}.pdf",
        )

    # 调用 converter 微服务转换
    source_bytes = source_path.read_bytes()
    pdf_bytes = await convert_to_pdf_bytes(source_bytes, f"{doc.title}.{ext}")

    if not pdf_bytes:
        return error(ErrorCode.SYSTEM_ERROR, "PDF 转换失败，converter 微服务不可用")

    # 缓存 PDF 到磁盘
    pdf_cache_path.write_bytes(pdf_bytes)

    return FileResponse(
        path=str(pdf_cache_path),
        media_type="application/pdf",
        filename=f"{doc.title}.pdf",
    )


@router.get("/{doc_id}")
async def get_document(
    doc_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """公文详情"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    # 查创建者姓名
    creator_name = ""
    cr = await db.execute(select(User.display_name).where(User.id == doc.creator_id))
    row = cr.scalar_one_or_none()
    if row:
        creator_name = row

    data = {
        **DocumentDetail.model_validate(doc).model_dump(mode="json"),
        "creator_name": creator_name,
        "has_source_file": bool(doc.source_file_path),
        "has_markdown_file": bool(doc.md_file_path),
    }
    return success(data=data)


@router.put("/{doc_id}")
async def update_document(
    doc_id: UUID,
    body: DocumentUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """更新公文"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    update_data = body.model_dump(exclude_unset=True)

    # 内容变更时自动保存版本快照
    if "content" in update_data and update_data["content"] != doc.content and doc.content:
        await _save_version(db, doc, current_user.id, change_summary="手动编辑")

    for field, value in update_data.items():
        setattr(doc, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新公文", module="智能公文",
        detail=f"更新公文: {doc.title}, 字段: {list(update_data.keys())}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """删除公文"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    title = doc.title

    # 清理本地文件（源文件 + Markdown 文件 + 整个目录）
    doc_upload_dir = Path(settings.UPLOAD_DIR) / "documents" / str(doc_id)
    for path_str in (doc.source_file_path, doc.md_file_path):
        if path_str:
            try:
                Path(path_str).unlink(missing_ok=True)
            except Exception:
                pass
    # 尝试清理空目录
    try:
        if doc_upload_dir.exists():
            doc_upload_dir.rmdir()  # 仅当目录为空时才会成功
    except Exception:
        pass

    # 删除版本历史
    versions = await db.execute(select(DocumentVersion).where(DocumentVersion.document_id == doc_id))
    for v in versions.scalars().all():
        await db.delete(v)

    await db.delete(doc)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除公文", module="智能公文",
        detail=f"删除公文: {title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")


@router.post("/{doc_id}/archive")
async def archive_document(
    doc_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """归档公文"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    doc.status = "archived"
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="归档公文", module="智能公文",
        detail=f"归档公文: {doc.title}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="归档成功")


@router.post("/{doc_id}/process")
async def process_document(
    doc_id: UUID,
    body: DocProcessRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """AI 公文处理（起草/检查/优化）"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    dify = get_dify_service()

    try:
        if body.process_type == "draft":
            wf_result = await dify.run_doc_draft(
                title=doc.title,
                outline=doc.content or "",
                doc_type=doc.doc_type,
            )
            # 保存旧版本
            if doc.content:
                await _save_version(db, doc, current_user.id, change_type="draft", change_summary="AI起草前版本")

            doc.content = wf_result.output_text
            doc.status = "draft"
            await db.flush()

            return success(data={
                "document_id": str(doc_id),
                "process_type": "draft",
                "content": wf_result.output_text,
                "new_status": "draft",
                "review_result": None,
            })

        elif body.process_type == "check":
            if not doc.content:
                return error(ErrorCode.PARAM_INVALID, "公文内容为空，无法检查")

            review = await dify.run_doc_check(doc.content)

            doc.status = "checked"
            await db.flush()

            return success(data={
                "document_id": str(doc_id),
                "process_type": "check",
                "content": doc.content,
                "new_status": "checked",
                "review_result": {
                    "typos": [{"text": i.text, "suggestion": i.suggestion, "context": i.context} for i in review.typos],
                    "grammar": [{"text": i.text, "suggestion": i.suggestion, "context": i.context} for i in review.grammar],
                    "sensitive": [{"text": i.text, "suggestion": i.suggestion, "context": i.context} for i in review.sensitive],
                },
            })

        elif body.process_type == "optimize":
            if not doc.content:
                return error(ErrorCode.PARAM_INVALID, "公文内容为空，无法优化")

            # 保存旧版本
            await _save_version(db, doc, current_user.id, change_type="optimize", change_summary="AI优化前版本")

            wf_result = await dify.run_doc_optimize(doc.content)
            doc.content = wf_result.output_text
            doc.status = "optimized"
            await db.flush()

            return success(data={
                "document_id": str(doc_id),
                "process_type": "optimize",
                "content": wf_result.output_text,
                "new_status": "optimized",
                "review_result": None,
            })

        elif body.process_type == "format":
            # 格式化处理 — 使用本地 python-docx，不走 Dify
            if not doc.source_file_path:
                return error(ErrorCode.PARAM_INVALID, "该文档无原始文件，无法进行格式化")
            source_path = Path(doc.source_file_path)
            if not source_path.exists():
                return error(ErrorCode.PARAM_INVALID, "原始文件已丢失")
            if source_path.suffix.lower() != '.docx':
                return error(ErrorCode.PARAM_INVALID, f"格式化仅支持 .docx 文件，当前格式: {source_path.suffix}")

            try:
                output_path, stats = DocFormatService.smart_format(
                    str(source_path), preset_name="official"
                )
                # 保存格式化后的文件覆盖原始文件路径
                import shutil
                formatted_dir = source_path.parent / "formatted"
                formatted_dir.mkdir(parents=True, exist_ok=True)
                formatted_path = formatted_dir / source_path.name
                shutil.move(str(output_path), str(formatted_path))

                # 保存版本
                if doc.content:
                    await _save_version(db, doc, current_user.id, change_type="format", change_summary="格式化前版本")

                doc.status = "formatted"
                await db.flush()

                return success(data={
                    "document_id": str(doc_id),
                    "process_type": "format",
                    "content": doc.content,
                    "new_status": "formatted",
                    "review_result": None,
                    "format_stats": stats,
                    "formatted_file": str(formatted_path),
                })
            except Exception as fmt_err:
                return error(ErrorCode.INTERNAL_ERROR, f"格式化处理失败: {str(fmt_err)}")

        else:
            return error(ErrorCode.PARAM_INVALID, f"不支持的处理类型: {body.process_type}")

    except Exception as e:
        return error(ErrorCode.DIFY_ERROR, f"AI处理失败: {str(e)}")

    finally:
        await log_action(
            db, user_id=current_user.id, user_display_name=current_user.display_name,
            action=f"AI公文{body.process_type}", module="智能公文",
            detail=f"{body.process_type} 公文: {doc.title}",
            ip_address=request.client.host if request.client else None,
        )


# ── 对话式 AI 处理（SSE 流式） ──

class AiProcessRequest(BaseModel):
    """对话式 AI 处理请求"""
    stage: str  # draft / check / optimize / format
    user_instruction: str = ""  # 用户对话式指令
    existing_paragraphs: list[dict] | None = None  # 已有格式化段落（增量修改时传入）


@router.post("/{doc_id}/ai-process")
async def ai_process_document(
    doc_id: UUID,
    body: AiProcessRequest,
    request: Request,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """
    对话式 AI 公文处理（SSE 流式）。

    每个阶段(draft/check/optimize/format)都有独立的对话输入框，
    用户描述需求后，AI 流式输出处理结果。

    SSE 事件格式:
      data: {"type":"status","message":"正在处理..."}
      data: {"type":"text","text":"增量文本片段"}
      data: {"type":"done","full_content":"完整结果文本"}
      data: [DONE]
    """
    _logger = logging.getLogger(__name__)

    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    valid_stages = {"draft", "review", "format"}
    if body.stage not in valid_stages:
        return error(ErrorCode.PARAM_INVALID, f"stage 必须为 {valid_stages} 之一")

    dify = get_dify_service()

    def _para_to_dict(p) -> dict:
        """将 StructuredParagraph 转为 SSE 字典，包含富格式属性"""
        d = {"text": p.text, "style_type": p.style_type}
        for key in ("font_size", "font_family", "bold", "italic", "indent", "alignment", "line_height"):
            val = getattr(p, key, None)
            if val is not None:
                d[key] = val
        return d

    def _compute_para_diff(
        old_paras: list[dict] | None,
        new_paras: list[dict],
    ) -> list[dict]:
        """
        Copilot-style 段落级 diff 计算。

        比对 old_paras 与 new_paras：
        - 完全一致 → 无标记
        - old 中有而 new 中无 → 插入 _change=deleted 的段落
        - new 中有而 old 中无 → _change=added
        - 同位置文本不同 → _change=modified + _original_text
        """
        if not old_paras:
            # 全部为新增
            for p in new_paras:
                p["_change"] = "added"
            return new_paras

        # 构建旧段落文本 → 索引映射
        old_texts = [p.get("text", "").strip() for p in old_paras]
        old_used = [False] * len(old_paras)
        result: list[dict] = []

        for new_p in new_paras:
            new_text = new_p.get("text", "").strip()
            # 精确匹配查找
            matched_idx = None
            for i, ot in enumerate(old_texts):
                if not old_used[i] and ot == new_text:
                    matched_idx = i
                    break
            if matched_idx is not None:
                # 完全一致
                old_used[matched_idx] = True
                result.append(new_p)  # 无 _change
            else:
                # 尝试模糊匹配（同位置或文本相似）
                # 按顺序查找第一个未使用且文本有交集的旧段落
                fuzzy_idx = None
                for i, ot in enumerate(old_texts):
                    if old_used[i]:
                        continue
                    # 简单相似度：共同子串 > 30%
                    shorter = min(len(ot), len(new_text))
                    if shorter == 0:
                        continue
                    common = sum(1 for a, b in zip(ot, new_text) if a == b)
                    if common / max(shorter, 1) > 0.3:
                        fuzzy_idx = i
                        break
                if fuzzy_idx is not None:
                    old_used[fuzzy_idx] = True
                    new_p["_change"] = "modified"
                    new_p["_original_text"] = old_texts[fuzzy_idx]
                    result.append(new_p)
                else:
                    new_p["_change"] = "added"
                    result.append(new_p)

        # 未匹配的旧段落 → deleted
        for i, used in enumerate(old_used):
            if not used and old_texts[i]:
                deleted_p = {**old_paras[i], "_change": "deleted"}
                # 插入到结果中合适的位置（尽量保持原始顺序）
                # 简化处理：追加到末尾
                result.append(deleted_p)

        return result

    async def event_generator():
        def _sse(data: dict) -> str:
            return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            yield _sse({"type": "status", "message": f"正在执行{_STAGE_NAMES.get(body.stage, body.stage)}..."})

            if body.stage == "draft":
                # 起草 — 流式 SSE 纯文本输出（只关注内容，不含格式信息）
                if doc.content:
                    await _save_version(db, doc, current_user.id, change_type="draft", change_summary="AI对话起草前版本")

                full_text = ""

                # ── 如果前端传入了已格式化的结构化段落，基于结构化数据起草 ──
                has_structured = body.existing_paragraphs and len(body.existing_paragraphs) > 0

                # 多模态：只有在没有结构化数据时，才读取源文件
                draft_file_bytes: bytes | None = None
                draft_file_name: str = ""
                if not has_structured and doc.source_file_path:
                    try:
                        source_path = Path(doc.source_file_path)
                        if source_path.exists():
                            draft_file_bytes = source_path.read_bytes()
                            ext = doc.source_format or source_path.suffix.lstrip(".")
                            draft_file_name = f"{doc.title}.{ext}" if ext else source_path.name
                            _logger.info(f"多模态起草：读取源文件 {source_path.name} ({len(draft_file_bytes)} bytes)")
                    except Exception as e:
                        _logger.warning(f"源文件读取失败，降级为纯文本模式: {e}")

                # 如果有结构化段落，构建紧凑文本列表替代完整 JSON（减少 80%+ token）
                draft_instruction = body.user_instruction or ""
                if has_structured:
                    _compact_lines = []
                    for _i, _p in enumerate(body.existing_paragraphs):
                        _text = _p.get("text", "")
                        _st = _p.get("style_type", "body")
                        _compact_lines.append(f"[{_i}] ({_st}) {_text}")
                    _compact_listing = "\n".join(_compact_lines)
                    structured_prefix = (
                        "【重要：基于已有文档修改】\n"
                        f"当前文档共 {len(body.existing_paragraphs)} 个段落：\n"
                        f"{_compact_listing}\n\n"
                        "请在此基础上修改用户要求的部分，未提及的段落**逐字保持原样**。\n"
                        "输出纯文本，保持相同的段落顺序和结构。\n\n"
                    )
                    if draft_instruction:
                        draft_instruction = structured_prefix + f"【用户起草/修改要求】：\n{draft_instruction}"
                    else:
                        draft_instruction = structured_prefix + "请在此基础上优化文字内容。"

                async for sse_event in dify.run_doc_draft_stream(
                    title=doc.title,
                    outline=doc.content or "",
                    doc_type=doc.doc_type,
                    user_instruction=draft_instruction,
                    file_bytes=draft_file_bytes,
                    file_name=draft_file_name,
                ):
                    if sse_event.event == "text_chunk":
                        yield _sse({"type": "text", "text": sse_event.data.get("text", "")})
                    elif sse_event.event == "message_end":
                        full_text = sse_event.data.get("full_text", "")
                    elif sse_event.event == "progress":
                        yield _sse({"type": "status", "message": sse_event.data.get("message", "生成中…")})
                    elif sse_event.event == "error":
                        yield _sse({"type": "error", "message": sse_event.data.get("message", "起草失败")})
                        return

                # 保存到数据库（记录旧内容以便 needs_more_info 时回退）
                _prev_content = doc.content
                if full_text:
                    doc.content = full_text
                doc.status = "draft"
                await db.flush()
                await db.commit()

                # ── 起草阶段：检测 AI 是否返回了 JSON（而非纯文本） ──
                _parsed_as_structured = False
                if full_text:
                    _stripped = full_text.strip()
                    if _stripped.startswith("{") and _stripped.endswith("}"):
                        try:
                            from json_repair import loads as jr_loads
                            _parsed = jr_loads(_stripped)
                            if isinstance(_parsed, dict):
                                _ai_paras = _parsed.get("paragraphs", [])
                                _has_valid_paras = (
                                    isinstance(_ai_paras, list)
                                    and len(_ai_paras) > 0
                                    and all(isinstance(p, dict) and "text" in p for p in _ai_paras)
                                )

                                if _has_valid_paras:
                                    # ── Case 1: 有效的 paragraphs 数组 → 提取纯文本存入 doc.content ──
                                    _parsed_as_structured = True
                                    _logger.info(f"起草阶段：AI 返回了结构化 JSON，共 {len(_ai_paras)} 段，提取纯文本")
                                    _plain_text = "\n".join(p.get("text", "") for p in _ai_paras)
                                    doc.content = _plain_text
                                    await db.flush()
                                    await db.commit()
                                    # 起草阶段只关注内容，用 replace_streaming_text 替换流式 JSON 为纯文本
                                    yield _sse({"type": "replace_streaming_text", "text": _plain_text})
                                else:
                                    # ── Case 2: JSON 但无有效 paragraphs（含 request_more / message 等） ──
                                    _parsed_as_structured = True
                                    _friendly_lines: list[str] = []
                                    _req = _parsed.get("request_more", [])
                                    if isinstance(_req, list) and _req:
                                        for _item in _req:
                                            if isinstance(_item, str) and _item.strip():
                                                _friendly_lines.append(_item.strip())
                                    _msg = _parsed.get("message", "") or _parsed.get("msg", "")
                                    if isinstance(_msg, str) and _msg.strip():
                                        _friendly_lines.append(_msg.strip())
                                    if not _friendly_lines:
                                        _friendly_lines.append("请提供更详细的指令。")
                                    _logger.info(f"起草阶段：AI 需要更多信息，发送 needs_more_info")
                                    # 不存入 doc.content，回退到旧内容
                                    doc.content = _prev_content
                                    await db.flush()
                                    await db.commit()
                                    yield _sse({"type": "needs_more_info", "suggestions": _friendly_lines})
                        except Exception as e:
                            _logger.debug(f"起草结果非有效 JSON，按纯文本处理: {e}")

                # ── 起草阶段：纯文本模式——只关注内容，不做排版解析 ──
                # 流式文本已通过 text_chunk 事件送达前端，无需额外发送 structured_paragraph
                # 结构化解析留给格式化阶段处理

                if not _parsed_as_structured or (full_text and doc.content == full_text):
                    # 正常文本或有效 paragraphs → 发 done
                    yield _sse({"type": "done", "full_content": doc.content or full_text})
                else:
                    # needs_more_info → 仍发 done 但不带内容，前端不标记阶段完成
                    yield _sse({"type": "done", "needs_more_info": True})

            elif body.stage == "review":
                # 审查&优化（合并版） — 流式调用，支持文件上传 + 逐条推送建议
                if not doc.content:
                    yield _sse({"type": "error", "message": "公文内容为空，无法审查"})
                    return

                await _save_version(db, doc, current_user.id, change_type="review", change_summary="AI审查优化前版本")

                # ── 如果有结构化段落，基于结构化数据审查（不再上传源文件）──
                has_structured = body.existing_paragraphs and len(body.existing_paragraphs) > 0

                review_file_bytes: bytes | None = None
                review_file_name: str = ""
                if not has_structured and doc.source_file_path:
                    try:
                        source_path = Path(doc.source_file_path)
                        if source_path.exists():
                            review_file_bytes = source_path.read_bytes()
                            ext = doc.source_format or source_path.suffix.lstrip(".")
                            review_file_name = f"{doc.title}.{ext}" if ext else source_path.name
                            _logger.info(f"审查优化：读取源文件 {source_path.name} ({len(review_file_bytes)} bytes)")
                    except Exception as e:
                        _logger.warning(f"审查优化：源文件读取失败，仅使用文本: {e}")

                # 审查内容：优先用结构化段落的文本，否则用 doc.content
                review_content = doc.content or ""
                review_instruction = body.user_instruction or ""
                if has_structured:
                    # 提取纯文本段落列表替代完整 JSON（减少 70%+ token）
                    _text_lines = []
                    for _p in body.existing_paragraphs:
                        _text = _p.get("text", "").strip()
                        if _text:
                            _text_lines.append(_text)
                    review_content = "\n\n".join(_text_lines)

                async for sse_event in dify.run_doc_review_stream(
                    content=review_content,
                    user_instruction=review_instruction,
                    file_bytes=review_file_bytes,
                    file_name=review_file_name,
                ):
                    if sse_event.event == "review_suggestion":
                        # 单条建议实时推送
                        yield _sse({
                            "type": "review_suggestion",
                            "suggestion": sse_event.data,
                        })
                    elif sse_event.event == "review_result":
                        # 最终汇总推送（包含 summary + 全部 suggestions）
                        yield _sse({
                            "type": "review_suggestions",
                            "suggestions": sse_event.data.get("suggestions", []),
                            "summary": sse_event.data.get("summary", ""),
                        })
                        doc.status = "reviewed"
                        await db.flush()
                        await db.commit()
                    elif sse_event.event == "progress":
                        yield _sse({"type": "status", "message": sse_event.data.get("message", "审查中…")})
                    elif sse_event.event == "error":
                        yield _sse({"type": "error", "message": sse_event.data.get("message", "审查失败")})
                        return

                yield _sse({"type": "done", "full_content": doc.content})

            elif body.stage == "format":
                # 格式化 — Dify 流式返回结构化段落（支持文件上传到 Dify 文档提取器）
                if not doc.content:
                    yield _sse({"type": "error", "message": "公文内容为空，无法排版"})
                    return

                doc_text = doc.content

                # 读取源文件字节（如果有），用于上传到 Dify 文档提取器
                # 如果已有结构化段落，不再上传源文件
                format_file_bytes = None
                format_file_name = ""
                has_structured = body.existing_paragraphs and len(body.existing_paragraphs) > 0
                if not has_structured and doc.source_file_path:
                    source_path = Path(doc.source_file_path)
                    if source_path.exists():
                        try:
                            format_file_bytes = source_path.read_bytes()
                            format_file_name = source_path.name
                            _logger.info(f"排版阶段读取源文件: {format_file_name} ({len(format_file_bytes)} bytes)")
                        except Exception as e:
                            _logger.warning(f"排版阶段读取源文件失败: {e}")
                        # 同时尝试用 docx 提取纯文本兜底
                        if source_path.suffix.lower() == ".docx":
                            try:
                                from app.api.docformat import _extract_docx_text
                                doc_text = _extract_docx_text(str(source_path))
                            except Exception:
                                pass

                doc_type = "official"
                user_format_instruction = ""
                if body.user_instruction:
                    # 智能识别：如果用户指令恰好是预设类型名，提取 doc_type
                    instruction_lower = body.user_instruction.strip().lower()
                    if instruction_lower in ("official", "academic", "legal"):
                        doc_type = instruction_lower
                    else:
                        # 通过关键词推断 doc_type
                        if any(kw in body.user_instruction for kw in ("学术", "论文", "academic")):
                            doc_type = "academic"
                        elif any(kw in body.user_instruction for kw in ("法律", "法规", "legal")):
                            doc_type = "legal"
                        # 将完整的用户指令传给 Dify
                        user_format_instruction = body.user_instruction

                # ── 增量修改：仅输出被修改的段落（索引增量模式，大幅提速） ──
                if body.existing_paragraphs and len(body.existing_paragraphs) > 0:
                    # 构建紧凑的索引式段落列表（替代完整 JSON，减少 token 消耗）
                    _compact_lines = []
                    for _i, _p in enumerate(body.existing_paragraphs):
                        _attrs = [_p.get("style_type", "body")]
                        if _p.get("font_size"): _attrs.append(_p["font_size"])
                        if _p.get("font_family"): _attrs.append(_p["font_family"])
                        if _p.get("bold"): _attrs.append("bold")
                        if _p.get("alignment") and _p["alignment"] != "left": _attrs.append(_p["alignment"])
                        if _p.get("indent"): _attrs.append(f'indent={_p["indent"]}')
                        if _p.get("line_height"): _attrs.append(f'lh={_p["line_height"]}')
                        if _p.get("color") and _p["color"] != "#000000": _attrs.append(f'color={_p["color"]}')
                        if _p.get("red_line") is not None: _attrs.append(f'red_line={"true" if _p["red_line"] else "false"}')
                        _text = _p.get("text", "")
                        _compact_lines.append(f'[{_i}] ({", ".join(_attrs)}) {_text}')
                    _compact_listing = "\n".join(_compact_lines)

                    incremental_prefix = (
                        "【重要：增量修改模式 — 仅输出被修改的段落】\n"
                        f"当前文档共 {len(body.existing_paragraphs)} 个段落，索引与内容如下：\n"
                        f"{_compact_listing}\n\n"
                        "【输出规则】\n"
                        "1. **仅输出需要修改的段落**，每个 JSON 对象必须包含 \"_index\" 字段（整数，对应上方 [N] 序号）。\n"
                        "2. 每个输出段落须包含完整属性：text, style_type, font_size, font_family, bold, italic, color, indent, alignment, line_height。\n"
                        "3. 如果涉及红色分隔线，须包含 red_line 字段（true/false）。\n"
                        "   - 用户提到删掉/去掉/移除「红线」「红色横线」「横线」「分隔线」时，设对应 title 段落 red_line=false。\n"
                        "   - 用户提到添加/加上「红线」「红色横线」「红色分隔线」时，设对应 title 段落 red_line=true。\n"
                        "4. **未被修改的段落不要输出**。如果无需任何修改，输出 {\"paragraphs\": []}。\n\n"
                    )
                    if user_format_instruction:
                        user_format_instruction = incremental_prefix + f"【用户修改要求】:\n{user_format_instruction}"
                    else:
                        user_format_instruction = incremental_prefix + "请保持当前排版不变。"

                # 收集所有结构化段落
                _format_paragraphs: list[str] = []
                _all_para_data: list[dict] = []

                async for sse_event in dify.run_doc_format_stream(
                    "" if has_structured else doc_text,
                    doc_type, user_format_instruction,
                    file_bytes=format_file_bytes, file_name=format_file_name,
                ):
                    if sse_event.event == "structured_paragraph":
                        para_data = {
                            "text": sse_event.data.get("text", ""),
                            "style_type": sse_event.data.get("style_type", "body"),
                        }
                        # 透传富格式属性（含 color, red_line, _index）
                        for key in ("font_size", "font_family", "bold", "italic", "color", "indent", "alignment", "line_height", "red_line", "_index"):
                            if key in sse_event.data and sse_event.data[key] is not None:
                                para_data[key] = sse_event.data[key]
                        _all_para_data.append(para_data)

                        # 非增量模式：仍然实时推送（无 diff 标记）
                        if not has_structured:
                            yield _sse({"type": "structured_paragraph", "paragraph": para_data})
                            if para_data["text"]:
                                _format_paragraphs.append(para_data["text"])
                    elif sse_event.event == "progress":
                        yield _sse({"type": "status", "message": sse_event.data.get("message", "排版中…")})
                    elif sse_event.event == "text_chunk":
                        # 降级：纯文本输出
                        yield _sse({"type": "text", "text": sse_event.data.get("text", "")})
                    elif sse_event.event == "message_end":
                        # ── 后端兜底：红线删除关键词检测 ──
                        _user_instr_lower = (body.user_instruction or "").lower()
                        _want_remove_redline = any(
                            kw in _user_instr_lower
                            for kw in ("删掉红线", "去掉红线", "移除红线", "删除红线",
                                       "删掉横线", "去掉横线", "移除横线", "删除横线",
                                       "删掉红色横线", "去掉红色横线", "移除红色横线", "删除红色横线",
                                       "删掉红色分隔线", "去掉红色分隔线", "删掉分隔线", "去掉分隔线",
                                       "不要红线", "不需要红线", "不要横线", "不需要横线")
                        )

                        # ── 增量模式：基于 _index 合并或回退全量 diff ──
                        if has_structured:
                            _has_index = any(p.get("_index") is not None for p in _all_para_data) if _all_para_data else False
                            if _has_index:
                                # ★ 快速路径：AI 仅返回了被修改的段落（带 _index）
                                _modified_map: dict[int, dict] = {}
                                for p in _all_para_data:
                                    idx = p.pop("_index", None)
                                    if idx is not None and isinstance(idx, int) and 0 <= idx < len(body.existing_paragraphs):
                                        _modified_map[idx] = p
                                _format_paragraphs = []
                                for i, old_p in enumerate(body.existing_paragraphs):
                                    if i in _modified_map:
                                        new_p = _modified_map[i]
                                        if _want_remove_redline and new_p.get("style_type") == "title":
                                            new_p["red_line"] = False
                                        new_p["_change"] = "modified"
                                        new_p["_original_text"] = old_p.get("text", "")
                                        yield _sse({"type": "structured_paragraph", "paragraph": new_p})
                                        _format_paragraphs.append(new_p.get("text", ""))
                                    else:
                                        out_p = {k: v for k, v in old_p.items() if k not in ("_change", "_original_text", "_change_reason")}
                                        if _want_remove_redline and out_p.get("style_type") == "title":
                                            out_p["red_line"] = False
                                        yield _sse({"type": "structured_paragraph", "paragraph": out_p})
                                        _format_paragraphs.append(out_p.get("text", ""))
                                _logger.info(f"增量排版完成（索引模式）: 修改 {len(_modified_map)} / {len(body.existing_paragraphs)} 段")
                            elif _all_para_data:
                                # 回退路径：AI 输出了全部段落（无 _index），使用传统 diff
                                if _want_remove_redline:
                                    for pd in _all_para_data:
                                        if pd.get("style_type") == "title":
                                            pd["red_line"] = False
                                diffed = _compute_para_diff(body.existing_paragraphs, _all_para_data)
                                _format_paragraphs = []
                                for dp in diffed:
                                    yield _sse({"type": "structured_paragraph", "paragraph": dp})
                                    if dp.get("text"):
                                        _format_paragraphs.append(dp["text"])
                                _logger.info(f"增量排版完成（回退全量diff）: 共 {len(_all_para_data)} 段")
                            else:
                                # AI 无输出，保持原样
                                _format_paragraphs = [p.get("text", "") for p in body.existing_paragraphs if p.get("text")]
                                for old_p in body.existing_paragraphs:
                                    out_p = {k: v for k, v in old_p.items() if k not in ("_change", "_original_text", "_change_reason")}
                                    yield _sse({"type": "structured_paragraph", "paragraph": out_p})
                        else:
                            # 非增量模式：红线兜底
                            if _want_remove_redline and _all_para_data:
                                for pd in _all_para_data:
                                    if pd.get("style_type") == "title":
                                        pd["red_line"] = False
                        # 保存格式化前版本快照
                        if doc.content:
                            await _save_version(db, doc, current_user.id, change_type="format", change_summary="格式化前版本")
                        # 将排版后的段落文本合并保存到 doc.content
                        if _format_paragraphs:
                            doc.content = "\n\n".join(_format_paragraphs)
                        doc.status = "formatted"
                        await db.flush()
                        await db.commit()
                        yield _sse({"type": "done", "full_content": doc.content or ""})
                    elif sse_event.event == "error":
                        yield _sse({"type": "error", "message": sse_event.data.get("message", "排版失败")})

            yield "data: [DONE]\n\n"

        except Exception as e:
            _logger.exception(f"AI对话处理异常 [{body.stage}]")
            yield _sse({"type": "error", "message": f"AI处理异常: {str(e)}"})
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


_STAGE_NAMES = {
    "draft": "公文起草",
    "review": "审查优化",
    "format": "格式规范",
}


@router.get("/{doc_id}/versions")
async def list_document_versions(
    doc_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """公文版本历史"""
    # 验证公文存在
    doc_result = await db.execute(select(Document).where(Document.id == doc_id))
    if not doc_result.scalar_one_or_none():
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    versions = result.scalars().all()

    # 批量查创建者姓名
    user_ids = {v.created_by for v in versions}
    user_map = {}
    if user_ids:
        ur = await db.execute(select(User.id, User.display_name).where(User.id.in_(user_ids)))
        user_map = {row[0]: row[1] for row in ur.all()}

    items = [
        {
            **DocumentVersionItem.model_validate(v).model_dump(mode="json"),
            "created_by_name": user_map.get(v.created_by, ""),
        }
        for v in versions
    ]

    return success(data=items)


@router.get("/{doc_id}/versions/{version_id}")
async def get_document_version(
    doc_id: UUID,
    version_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """获取指定版本详情"""
    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        return error(ErrorCode.NOT_FOUND, "版本不存在")

    # 查创建者姓名
    ur = await db.execute(select(User.display_name).where(User.id == version.created_by))
    created_by_name = ur.scalar_one_or_none() or ""

    data = {
        **DocumentVersionDetail.model_validate(version).model_dump(mode="json"),
        "created_by_name": created_by_name,
    }
    return success(data=data)


@router.post("/{doc_id}/versions/{version_id}/restore")
async def restore_document_version(
    doc_id: UUID,
    version_id: UUID,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """恢复到指定版本（回退），先保存当前内容为新版本快照"""
    doc_result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = doc_result.scalar_one_or_none()
    if not doc:
        return error(ErrorCode.NOT_FOUND, "公文不存在")

    ver_result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    version = ver_result.scalar_one_or_none()
    if not version:
        return error(ErrorCode.NOT_FOUND, "版本不存在")

    # 先把当前内容保存为快照
    if doc.content:
        await _save_version(db, doc, current_user.id, change_type="restore", change_summary=f"回退前备份")

    # 恢复内容
    doc.content = version.content
    await db.flush()
    await db.commit()

    # 保存恢复后的版本记录
    await _save_version(db, doc, current_user.id, change_type="restore", change_summary=f"恢复到版本 v{version.version_number}")

    return success(data={"content": doc.content, "version_number": version.version_number})


# ── 辅助函数 ──


async def _save_version(
    db: AsyncSession,
    doc: Document,
    user_id: UUID,
    change_type: str | None = None,
    change_summary: str | None = None,
):
    """保存公文版本快照"""
    # 获取最新版本号
    result = await db.execute(
        select(func.max(DocumentVersion.version_number))
        .where(DocumentVersion.document_id == doc.id)
    )
    max_ver = result.scalar() or 0

    version = DocumentVersion(
        document_id=doc.id,
        version_number=max_ver + 1,
        content=doc.content or "",
        change_type=change_type,
        change_summary=change_summary,
        created_by=user_id,
    )
    db.add(version)
    await db.flush()
