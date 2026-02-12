"""公文管理路由"""

import csv
import io
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
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
from app.services.doc_converter import (
    convert_bytes_to_markdown,
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
    file: UploadFile = File(..., description="支持 PDF/Word/Excel/PPT/TXT/HTML 等格式"),
    category: str = Form("doc"),
    doc_type: str = Form("report"),
    security: str = Form("internal"),
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """
    导入文档为公文/模板。

    使用 MarkItDown 将各类文档（PDF, DOCX, DOC, XLSX, CSV, TXT, MD, PPTX, HTML 等）
    转换为高质量 Markdown，自动保留标题、表格、列表等结构信息。
    """
    # ── 校验枚举参数 ──
    VALID_CATEGORIES = {"doc", "template"}
    VALID_DOC_TYPES = {"request", "report", "notice", "briefing", "ai_generated"}
    VALID_SECURITIES = {"public", "internal", "secret", "confidential"}

    if category not in VALID_CATEGORIES:
        return error(ErrorCode.PARAM_INVALID, f"category 必须为 {VALID_CATEGORIES} 之一，收到: '{category}'")
    if doc_type not in VALID_DOC_TYPES:
        return error(ErrorCode.PARAM_INVALID, f"doc_type 必须为 {VALID_DOC_TYPES} 之一，收到: '{doc_type}'")
    if security not in VALID_SECURITIES:
        return error(ErrorCode.PARAM_INVALID, f"security 必须为 {VALID_SECURITIES} 之一，收到: '{security}'")

    file_name = file.filename or "unknown.docx"
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

    if ext not in DOC_IMPORT_EXTENSIONS:
        supported = ", ".join(sorted(DOC_IMPORT_EXTENSIONS))
        return error(ErrorCode.PARAM_INVALID, f"不支持的文件格式 .{ext}，支持: {supported}")

    content_bytes = await file.read()
    if not content_bytes:
        return error(ErrorCode.PARAM_INVALID, "上传文件为空")

    # ── 使用统一文档转换服务将文件转为 Markdown ──
    convert_result = await convert_bytes_to_markdown(content_bytes, file_name)

    if not convert_result.success:
        return error(
            ErrorCode.FILE_UPLOAD_ERROR,
            f"文档解析失败: {convert_result.error_message}",
        )

    content = convert_result.markdown
    if not content.strip():
        return error(ErrorCode.FILE_UPLOAD_ERROR, "文档解析结果为空，请检查文件内容")

    # 提取标题（优先用文件名，Markdown 首个标题作为补充）
    title = file_name.rsplit(".", 1)[0] if "." in file_name else file_name

    # ── 创建文档记录（先 flush 获取 ID） ──
    doc = Document(
        creator_id=current_user.id,
        title=title,
        category=category,
        doc_type=doc_type,
        content=content,
        urgency="normal",
        security=security,
        source_format=ext,
    )
    db.add(doc)
    await db.flush()

    # ── 持久化源文件到磁盘 ──
    upload_dir = Path(settings.UPLOAD_DIR) / "documents" / str(doc.id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    source_path = upload_dir / f"source.{ext}"
    source_path.write_bytes(content_bytes)
    doc.source_file_path = str(source_path)

    # ── 持久化 Markdown 文件到磁盘 ──
    md_path = await save_markdown_file(content, upload_dir, "content")
    doc.md_file_path = str(md_path)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="导入公文", module="智能公文",
        detail=f"导入文件: {file_name} → {title} (格式: {ext}, 字符数: {convert_result.char_count})",
        ip_address=request.client.host if request.client else None,
    )

    return success(
        data={
            "id": str(doc.id),
            "title": title,
            "format": ext,
            "char_count": convert_result.char_count,
            "has_source_file": True,
            "has_markdown_file": True,
        },
        message="导入成功",
    )


@router.post("/export")
async def export_documents(
    body: DocumentExportRequest,
    current_user: User = Depends(require_permission("app:doc:write")),
    db: AsyncSession = Depends(get_db),
):
    """导出公文列表为 CSV 或 XLSX"""
    # 构建查询
    if body.ids:
        query = select(Document).where(Document.id.in_(body.ids))
    else:
        query = select(Document).where(Document.category == "doc")

    query = query.order_by(Document.updated_at.desc()).limit(5000)
    result = await db.execute(query)
    docs = result.scalars().all()

    # 批量查创建者姓名
    creator_ids = {d.creator_id for d in docs}
    creator_map = {}
    if creator_ids:
        cr = await db.execute(select(User.id, User.display_name).where(User.id.in_(creator_ids)))
        creator_map = {row[0]: row[1] for row in cr.all()}

    STATUS_MAP = {"draft": "草稿", "checked": "已检查", "optimized": "已优化", "archived": "已归档",
                  "unfilled": "未填写", "filled": "已填写"}
    TYPE_MAP = {"request": "请示", "report": "报告", "notice": "通知", "briefing": "简报", "ai_generated": "AI生成"}
    SECURITY_MAP = {"public": "公开", "internal": "内部", "secret": "秘密", "confidential": "机密"}
    URGENCY_MAP = {"normal": "普通", "urgent": "紧急", "very_urgent": "特急"}

    headers = ["标题", "类型", "状态", "密级", "紧急程度", "创建者", "创建时间", "更新时间"]
    rows = []
    for d in docs:
        rows.append([
            d.title,
            TYPE_MAP.get(d.doc_type, d.doc_type),
            STATUS_MAP.get(d.status, d.status),
            SECURITY_MAP.get(d.security, d.security),
            URGENCY_MAP.get(d.urgency, d.urgency),
            creator_map.get(d.creator_id, ""),
            d.created_at.strftime("%Y-%m-%d %H:%M:%S") if d.created_at else "",
            d.updated_at.strftime("%Y-%m-%d %H:%M:%S") if d.updated_at else "",
        ])

    if body.format == "xlsx":
        # XLSX 导出
        try:
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "公文列表"
            ws.append(headers)
            for row in rows:
                ws.append(row)
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=documents.xlsx"},
            )
        except ImportError:
            return error(ErrorCode.INTERNAL_ERROR, "服务器未安装 openpyxl，请使用 CSV 格式")
    else:
        # CSV 导出
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
        csv_bytes = output.getvalue().encode("utf-8-sig")
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=documents.csv"},
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
