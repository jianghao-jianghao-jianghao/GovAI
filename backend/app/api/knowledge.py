"""知识库管理路由"""

import io
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import get_current_user, get_user_permissions
from app.core.audit import log_action
from app.models.user import User
from app.models.knowledge import KBCollection, KBFile
from app.schemas.knowledge import (
    KBCollectionCreateRequest, KBCollectionUpdateRequest,
    KBCollectionListItem, KBFileListItem, KBFileRenameRequest,
    KBFileBatchExportRequest,
)
from app.services.dify.factory import get_dify_service
from app.services.doc_converter import (
    convert_file_to_markdown,
    save_markdown_file,
    KB_ALLOWED_EXTENSIONS,
)

router = APIRouter(prefix="/kb", tags=["KBCollections", "KBFiles"])


# ── 权限辅助 ──

def _can_manage(permissions: list[str], collection_id: UUID) -> bool:
    if "res:kb:manage_all" in permissions:
        return True
    return f"res:kb:manage:{collection_id}" in permissions


def _can_ref(permissions: list[str], collection_id: UUID) -> bool:
    if "res:kb:ref_all" in permissions:
        return True
    return f"res:kb:ref:{collection_id}" in permissions


# ── Collections ──


@router.get("/collections")
async def list_kb_collections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """知识库集合列表"""
    from app.core.deps import get_user_permissions
    permissions = await get_user_permissions(current_user, db)

    if "res:kb:view_module" not in permissions:
        return error(ErrorCode.PERMISSION_DENIED, "无权访问知识库")

    result = await db.execute(select(KBCollection).order_by(KBCollection.created_at))
    collections = result.scalars().all()

    # 批量查文件数
    file_counts = await db.execute(
        select(KBFile.collection_id, func.count(KBFile.id)).group_by(KBFile.collection_id)
    )
    count_map = {row[0]: row[1] for row in file_counts.all()}

    items = [
        {
            **KBCollectionListItem.model_validate(c).model_dump(mode="json"),
            "file_count": count_map.get(c.id, 0),
            "can_manage": _can_manage(permissions, c.id),
            "can_ref": _can_ref(permissions, c.id),
        }
        for c in collections
    ]

    return success(data=items)


@router.post("/collections")
async def create_kb_collection(
    body: KBCollectionCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建知识库集合"""
    permissions = await get_user_permissions(current_user, db)
    if "res:kb:manage_all" not in permissions:
        return error(ErrorCode.PERMISSION_DENIED, "无权创建知识库集合")

    # 在 Dify 创建 Dataset
    dify = get_dify_service()
    try:
        dataset_info = await dify.create_dataset(body.name)
    except Exception as e:
        return error(ErrorCode.DIFY_ERROR, f"创建Dify知识库失败: {str(e)}")

    collection = KBCollection(
        name=body.name,
        parent_id=body.parent_id,
        description=body.description,
        dify_dataset_id=dataset_info.dataset_id,
        created_by=current_user.id,
    )
    db.add(collection)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="创建知识库集合", module="知识库",
        detail=f"创建集合: {body.name} (dify_dataset_id={dataset_info.dataset_id})",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"id": str(collection.id), "dify_dataset_id": dataset_info.dataset_id}, message="创建成功")


@router.put("/collections/{collection_id}")
async def update_kb_collection(
    collection_id: UUID,
    body: KBCollectionUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新知识库集合"""
    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此集合")

    result = await db.execute(select(KBCollection).where(KBCollection.id == collection_id))
    coll = result.scalar_one_or_none()
    if not coll:
        return error(ErrorCode.NOT_FOUND, "集合不存在")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(coll, field, value)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="更新知识库集合", module="知识库",
        detail=f"更新集合: {coll.name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="更新成功")


@router.delete("/collections/{collection_id}")
async def delete_kb_collection(
    collection_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除知识库集合"""
    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此集合")

    result = await db.execute(select(KBCollection).where(KBCollection.id == collection_id))
    coll = result.scalar_one_or_none()
    if not coll:
        return error(ErrorCode.NOT_FOUND, "集合不存在")

    # 先删 Dify Dataset
    if coll.dify_dataset_id:
        dify = get_dify_service()
        try:
            await dify.delete_dataset(coll.dify_dataset_id)
        except Exception:
            pass  # Dify 删除失败不阻塞本地删除

    # 删除集合下所有文件
    files_result = await db.execute(select(KBFile).where(KBFile.collection_id == collection_id))
    for f in files_result.scalars().all():
        await db.delete(f)

    name = coll.name
    await db.delete(coll)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除知识库集合", module="知识库",
        detail=f"删除集合: {name} 及其所有文件",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")


# ── Files ──


@router.get("/collections/{collection_id}/files")
async def list_kb_files(
    collection_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    keyword: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """文件列表"""
    permissions = await get_user_permissions(current_user, db)
    if not (_can_manage(permissions, collection_id) or _can_ref(permissions, collection_id)):
        return error(ErrorCode.PERMISSION_DENIED, "无权访问此集合")

    query = select(KBFile).where(KBFile.collection_id == collection_id)
    if status:
        query = query.where(KBFile.status == status)
    if keyword:
        query = query.where(KBFile.name.ilike(f"%{keyword}%"))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(KBFile.uploaded_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    files = result.scalars().all()

    # 批量查上传者姓名
    uploader_ids = {f.uploaded_by for f in files if f.uploaded_by}
    uploader_map = {}
    if uploader_ids:
        ur = await db.execute(select(User.id, User.display_name).where(User.id.in_(uploader_ids)))
        uploader_map = {row[0]: row[1] for row in ur.all()}

    items = [
        {
            **KBFileListItem.model_validate(f).model_dump(mode="json"),
            "uploader_name": uploader_map.get(f.uploaded_by, ""),
        }
        for f in files
    ]

    return success(data={"items": items, "total": total, "page": page, "page_size": page_size})


@router.post("/collections/{collection_id}/files")
async def upload_kb_files(
    collection_id: UUID,
    request: Request,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    上传文件（支持批量）。

    流程：保存原始文件 → MarkItDown 转为 Markdown → 保存 MD 文件 → 上传至 Dify。
    支持格式: PDF, DOCX, DOC, TXT, MD, CSV, XLSX, XLS, PPTX, PPT, HTML, JSON, XML
    """
    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此集合")

    # 检查集合存在
    coll_result = await db.execute(select(KBCollection).where(KBCollection.id == collection_id))
    coll = coll_result.scalar_one_or_none()
    if not coll:
        return error(ErrorCode.NOT_FOUND, "集合不存在")

    dify = get_dify_service()
    uploaded = []
    failed = []

    for upload_file in files:
        file_name = upload_file.filename or "unknown"
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

        if ext not in KB_ALLOWED_EXTENSIONS:
            supported = ", ".join(sorted(KB_ALLOWED_EXTENSIONS))
            failed.append({"name": file_name, "error": f"不支持的文件类型 .{ext}，支持: {supported}"})
            continue

        content = await upload_file.read()
        file_size = len(content)

        if file_size == 0:
            failed.append({"name": file_name, "error": "文件内容为空"})
            continue

        # 1. 本地持久化原始文件
        upload_dir = Path(settings.UPLOAD_DIR) / "kb" / str(collection_id)
        upload_dir.mkdir(parents=True, exist_ok=True)

        kb_file = KBFile(
            collection_id=collection_id,
            name=file_name,
            file_type=ext,
            file_size=file_size,
            status="uploading",
            uploaded_by=current_user.id,
        )
        db.add(kb_file)
        await db.flush()

        # 保存原始文件到 uploads/kb/{collection_id}/{file_id}.{ext}
        local_path = upload_dir / f"{kb_file.id}.{ext}"
        local_path.write_bytes(content)
        kb_file.file_path = str(local_path)

        # 2. 文档转 Markdown
        try:
            convert_result = await convert_file_to_markdown(local_path, file_name)
            if convert_result.success and convert_result.markdown.strip():
                # 保存 Markdown 文件到 uploads/kb/{collection_id}/{file_id}.md
                md_path = await save_markdown_file(
                    convert_result.markdown,
                    upload_dir,
                    str(kb_file.id),
                )
                kb_file.md_file_path = str(md_path)
            else:
                # 转换失败不阻塞上传流程，仅记录警告
                import logging
                logging.getLogger(__name__).warning(
                    f"文件 Markdown 转换失败 [{file_name}]: {convert_result.error_message}"
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Markdown 转换异常 [{file_name}]: {e}")

        # 3. 上传到 Dify
        try:
            if coll.dify_dataset_id:
                upload_result = await dify.upload_document(
                    dataset_id=coll.dify_dataset_id,
                    file_name=file_name,
                    file_content=content,
                    file_type=ext,
                )
                kb_file.dify_document_id = upload_result.document_id
                kb_file.dify_batch_id = upload_result.batch_id
                kb_file.status = "indexing"
            else:
                kb_file.status = "indexed"  # Mock 模式无 dataset_id 直接标记完成

            await db.flush()

            file_item = KBFileListItem.model_validate(kb_file).model_dump(mode="json")
            file_item["has_markdown"] = bool(kb_file.md_file_path)
            uploaded.append(file_item)
        except Exception as e:
            kb_file.status = "failed"
            kb_file.error_message = str(e)
            await db.flush()
            failed.append({"name": file_name, "error": str(e)})

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="上传知识库文件", module="知识库",
        detail=f"集合: {coll.name}, 成功: {len(uploaded)}, 失败: {len(failed)}",
        ip_address=request.client.host if request.client else None,
    )

    return success(data={"uploaded": uploaded, "failed": failed})


@router.put("/files/{file_id}")
async def rename_kb_file(
    file_id: UUID,
    body: KBFileRenameRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """重命名文件"""
    new_name = body.name

    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, kb_file.collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此文件")

    old_name = kb_file.name
    kb_file.name = new_name
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="重命名知识库文件", module="知识库",
        detail=f"重命名: {old_name} → {new_name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="重命名成功")


@router.delete("/files/{file_id}")
async def delete_kb_file(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除文件"""
    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, kb_file.collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此文件")

    # 先删 Dify 文档
    if kb_file.dify_document_id:
        coll_result = await db.execute(
            select(KBCollection).where(KBCollection.id == kb_file.collection_id)
        )
        coll = coll_result.scalar_one_or_none()
        if coll and coll.dify_dataset_id:
            dify = get_dify_service()
            try:
                await dify.delete_document(coll.dify_dataset_id, kb_file.dify_document_id)
            except Exception:
                pass

    # 清理本地文件（原始文件 + Markdown）
    for path_str in (kb_file.file_path, kb_file.md_file_path):
        if path_str:
            try:
                Path(path_str).unlink(missing_ok=True)
            except Exception:
                pass

    name = kb_file.name
    await db.delete(kb_file)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="删除知识库文件", module="知识库",
        detail=f"删除文件: {name}",
        ip_address=request.client.host if request.client else None,
    )

    return success(message="删除成功")


# ── 批量导出 ──


@router.post("/files/batch-export")
async def batch_export_kb_files(
    body: KBFileBatchExportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """批量导出知识库文件（ZIP 打包下载）"""
    permissions = await get_user_permissions(current_user, db)

    # 查询所有指定文件
    result = await db.execute(
        select(KBFile).where(KBFile.id.in_(body.file_ids))
    )
    files = result.scalars().all()
    if not files:
        return error(ErrorCode.NOT_FOUND, "未找到任何文件")

    # 权限检查：用户对每个集合至少有引用权限
    collection_ids = {f.collection_id for f in files}
    for cid in collection_ids:
        if not (_can_manage(permissions, cid) or _can_ref(permissions, cid)):
            return error(ErrorCode.PERMISSION_DENIED, f"无权访问集合 {cid} 中的文件")

    # 打包为 ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            file_path = Path(f.file_path) if f.file_path else None
            if file_path and file_path.exists():
                zf.write(file_path, f.name)
            else:
                # 文件不在本地（旧数据或异常），写入占位说明
                zf.writestr(
                    f"{f.name}.txt",
                    f"文件 '{f.name}' 未在本地找到 (file_id={f.id})\n"
                    f"可能需要从 Dify 重新下载 (dify_document_id={f.dify_document_id})\n",
                )

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=kb_files_export.zip"},
    )


# ── Markdown 预览 & 重新转换 ──


@router.get("/files/{file_id}/markdown")
async def get_kb_file_markdown(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取知识库文件的 Markdown 内容预览"""
    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not (_can_manage(permissions, kb_file.collection_id) or _can_ref(permissions, kb_file.collection_id)):
        return error(ErrorCode.PERMISSION_DENIED, "无权访问此文件")

    if not kb_file.md_file_path:
        return error(ErrorCode.NOT_FOUND, "此文件尚未生成 Markdown 版本")

    md_path = Path(kb_file.md_file_path)
    if not md_path.exists():
        return error(ErrorCode.NOT_FOUND, "Markdown 文件不存在（可能已被清理）")

    md_content = md_path.read_text(encoding="utf-8")

    return success(data={
        "file_id": str(file_id),
        "file_name": kb_file.name,
        "markdown": md_content,
        "char_count": len(md_content),
    })


@router.post("/files/{file_id}/reconvert")
async def reconvert_kb_file_to_markdown(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    重新将知识库文件转换为 Markdown。

    适用场景：转换引擎升级后，对旧文件重新生成更高质量的 Markdown。
    """
    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, kb_file.collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此文件")

    if not kb_file.file_path or not Path(kb_file.file_path).exists():
        return error(ErrorCode.NOT_FOUND, "原始文件不存在，无法重新转换")

    convert_result = await convert_file_to_markdown(kb_file.file_path, kb_file.name)

    if not convert_result.success:
        return error(ErrorCode.INTERNAL_ERROR, f"重新转换失败: {convert_result.error_message}")

    # 保存新的 Markdown 文件
    upload_dir = Path(kb_file.file_path).parent
    md_path = await save_markdown_file(convert_result.markdown, upload_dir, str(kb_file.id))
    kb_file.md_file_path = str(md_path)
    await db.flush()

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="重新转换知识库文件", module="知识库",
        detail=f"重新转换: {kb_file.name} (字符数: {convert_result.char_count})",
        ip_address=request.client.host if request.client else None,
    )

    return success(
        data={
            "file_id": str(file_id),
            "char_count": convert_result.char_count,
            "md_file_path": str(md_path),
        },
        message="重新转换成功",
    )
