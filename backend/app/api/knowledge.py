"""知识库管理路由"""

import asyncio
import io
import logging
import zipfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
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
from app.services.graph_service import get_graph_service
from app.services.doc_converter import (
    convert_file_to_markdown,
    save_markdown_file,
    KB_ALLOWED_EXTENSIONS,
)

logger = logging.getLogger(__name__)

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


# ── 索引状态后台轮询 ──


async def _poll_indexing_status(
    file_id: UUID,
    dataset_id: str,
    batch_id: str,
    max_retries: int = 60,
    interval: float = 3.0,
):
    """
    后台任务：轮询 Dify 文档索引状态，更新 kb_files.status。
    索引完成后自动触发知识图谱实体抽取。

    - 每 interval 秒查一次 dify.get_indexing_status()
    - 状态变为 completed → 更新为 "indexed" → 触发实体抽取
    - 状态变为 error → 更新为 "failed"
    - 超过 max_retries 次仍为 indexing → 标记为 "failed"（超时）
    """
    dify = get_dify_service()

    for attempt in range(max_retries):
        await asyncio.sleep(interval)

        try:
            status = await dify.get_indexing_status(dataset_id, batch_id)
        except Exception as e:
            logger.warning(f"轮询索引状态异常 [file_id={file_id}]: {e}")
            continue

        if status in ("completed", "indexed"):
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(KBFile).where(KBFile.id == file_id))
                kb_file = result.scalar_one_or_none()
                if kb_file:
                    kb_file.status = "indexed"
                    await session.commit()
            logger.info(f"文件索引完成 [file_id={file_id}]")

            # 索引完成后，异步触发知识图谱实体抽取
            asyncio.create_task(
                _extract_graph_for_file(file_id)
            )
            return

        if status == "error":
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(KBFile).where(KBFile.id == file_id))
                kb_file = result.scalar_one_or_none()
                if kb_file:
                    kb_file.status = "failed"
                    kb_file.error_message = "Dify 索引失败"
                    await session.commit()
            logger.error(f"文件索引失败 [file_id={file_id}]")
            return

    # 超时处理
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(KBFile).where(KBFile.id == file_id))
        kb_file = result.scalar_one_or_none()
        if kb_file and kb_file.status == "indexing":
            kb_file.status = "failed"
            kb_file.error_message = f"索引超时（已等待 {max_retries * interval:.0f} 秒）"
            await session.commit()
    logger.warning(f"文件索引超时 [file_id={file_id}]")


async def _extract_graph_for_file(file_id: UUID):
    """
    后台任务：对已索引的知识库文件执行知识图谱实体抽取。

    流程：
    1. 读取文件的 Markdown 内容
    2. 调用 Dify 实体抽取 Chatflow
    3. 将抽取的三元组写入 PostgreSQL 关系表 + Apache AGE 图数据库
    4. 更新 kb_files 的 graph_status 字段
    """
    logger.info(f"开始知识图谱抽取 [file_id={file_id}]")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(KBFile).where(KBFile.id == file_id))
        kb_file = result.scalar_one_or_none()
        if not kb_file:
            logger.warning(f"图谱抽取: 文件不存在 [file_id={file_id}]")
            return

        # 标记抽取状态为进行中
        kb_file.graph_status = "extracting"
        await session.commit()

        # 读取 Markdown 内容
        md_content = None
        if kb_file.md_file_path:
            md_path = Path(kb_file.md_file_path)
            if md_path.exists():
                try:
                    md_content = md_path.read_text(encoding="utf-8")
                except Exception as e:
                    logger.warning(f"读取 Markdown 文件失败 [{kb_file.md_file_path}]: {e}")

        if not md_content or not md_content.strip():
            kb_file.graph_status = "skipped"
            kb_file.graph_error = "无可用的 Markdown 文本内容"
            await session.commit()
            logger.info(f"图谱抽取跳过: 无文本内容 [file_id={file_id}]")
            return

        # 文本过短（少于 50 字符）跳过抽取
        if len(md_content.strip()) < 50:
            kb_file.graph_status = "skipped"
            kb_file.graph_error = "文本内容过短，跳过实体抽取"
            await session.commit()
            logger.info(f"图谱抽取跳过: 文本过短 [file_id={file_id}]")
            return

        # 调用 Dify 实体抽取
        dify = get_dify_service()
        try:
            triples = await dify.extract_entities(md_content)
        except Exception as e:
            kb_file.graph_status = "failed"
            kb_file.graph_error = f"Dify 实体抽取失败: {str(e)}"
            await session.commit()
            logger.error(f"图谱抽取失败 [file_id={file_id}]: {e}")
            return

        if not triples:
            kb_file.graph_status = "completed"
            kb_file.graph_error = "未抽取到实体关系"
            kb_file.graph_node_count = 0
            kb_file.graph_edge_count = 0
            await session.commit()
            logger.info(f"图谱抽取完成: 未发现实体关系 [file_id={file_id}]")
            return

        # 写入图数据库（PostgreSQL 关系表 + Apache AGE）
        graph_service = get_graph_service()
        try:
            ingest_result = await graph_service.ingest_triples(
                db=session,
                triples=triples,
                source_doc_id=file_id,
            )

            kb_file.graph_status = "completed"
            kb_file.graph_node_count = ingest_result.get("nodes_total", ingest_result["nodes_created"])
            kb_file.graph_edge_count = ingest_result.get("edges_total", ingest_result["edges_created"])
            if ingest_result["errors"]:
                kb_file.graph_error = "; ".join(ingest_result["errors"][:5])

            await session.commit()

            logger.info(
                f"图谱抽取完成 [file_id={file_id}]: "
                f"{len(triples)} 三元组, "
                f"{ingest_result.get('nodes_total', ingest_result['nodes_created'])} 节点(新增{ingest_result['nodes_created']}), "
                f"{ingest_result.get('edges_total', ingest_result['edges_created'])} 边(新增{ingest_result['edges_created']}), "
                f"AGE同步={'成功' if ingest_result['age_synced'] else '失败'}"
            )
        except Exception as e:
            kb_file.graph_status = "failed"
            kb_file.graph_error = f"图谱写入失败: {str(e)}"
            await session.commit()
            logger.error(f"图谱写入失败 [file_id={file_id}]: {e}")


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
        KBFileListItem.from_kb_file(f, uploader_name=uploader_map.get(f.uploaded_by, ""))
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

                # 启动后台轮询索引状态
                asyncio.create_task(
                    _poll_indexing_status(
                        file_id=kb_file.id,
                        dataset_id=coll.dify_dataset_id,
                        batch_id=upload_result.batch_id,
                    )
                )
            else:
                kb_file.status = "indexed"  # Mock 模式无 dataset_id 直接标记完成
                # Mock 模式也触发图谱抽取
                if kb_file.md_file_path:
                    asyncio.create_task(_extract_graph_for_file(kb_file.id))

            await db.flush()

            file_item = KBFileListItem.from_kb_file(kb_file)
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


@router.get("/files/{file_id}/indexing-status")
async def get_file_indexing_status(
    file_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    查询文件索引状态。

    前端可在上传后轮询此接口，获取最新的 status。
    若文件仍在 indexing 且有 dify_batch_id，还会实时查询 Dify 获取最新状态。
    """
    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not (_can_manage(permissions, kb_file.collection_id) or _can_ref(permissions, kb_file.collection_id)):
        return error(ErrorCode.PERMISSION_DENIED, "无权访问此文件")

    # 若仍在 indexing，尝试实时刷新状态
    if kb_file.status == "indexing" and kb_file.dify_batch_id:
        coll_result = await db.execute(
            select(KBCollection).where(KBCollection.id == kb_file.collection_id)
        )
        coll = coll_result.scalar_one_or_none()
        if coll and coll.dify_dataset_id:
            try:
                dify = get_dify_service()
                dify_status = await dify.get_indexing_status(coll.dify_dataset_id, kb_file.dify_batch_id)
                if dify_status in ("completed", "indexed"):
                    kb_file.status = "indexed"
                    await db.flush()
                elif dify_status == "error":
                    kb_file.status = "failed"
                    kb_file.error_message = "Dify 索引失败"
                    await db.flush()
            except Exception as e:
                logger.warning(f"实时查询索引状态失败 [file_id={file_id}]: {e}")

    return success(data={
        "file_id": str(file_id),
        "status": kb_file.status,
        "dify_document_id": kb_file.dify_document_id,
        "dify_batch_id": kb_file.dify_batch_id,
        "error_message": kb_file.error_message,
        "graph_status": kb_file.graph_status,
        "graph_node_count": kb_file.graph_node_count,
        "graph_edge_count": kb_file.graph_edge_count,
        "graph_error": kb_file.graph_error,
    })


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

    # 清理关联的图谱数据（PostgreSQL + AGE）
    try:
        graph_svc = get_graph_service()
        await graph_svc.delete_by_doc(db, file_id)
    except Exception as e:
        logger.warning(f"图谱数据清理失败 [file_id={file_id}]: {e}")

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


# ── 知识图谱抽取（手动触发） ──


@router.post("/files/{file_id}/extract-graph")
async def extract_graph_for_kb_file(
    file_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    手动触发知识图谱抽取。

    用于以下场景：
    - 已上传文件但图谱抽取失败，需要重试
    - 升级了 Dify 实体抽取工作流后，需要重新抽取
    - 旧文件没有触发过自动抽取

    流程：读取 Markdown → 调用 Dify 实体抽取 → 写入 PostgreSQL + AGE
    """
    result = await db.execute(select(KBFile).where(KBFile.id == file_id))
    kb_file = result.scalar_one_or_none()
    if not kb_file:
        return error(ErrorCode.NOT_FOUND, "文件不存在")

    permissions = await get_user_permissions(current_user, db)
    if not _can_manage(permissions, kb_file.collection_id):
        return error(ErrorCode.PERMISSION_DENIED, "无权管理此文件")

    # 检查 Markdown 内容
    if not kb_file.md_file_path:
        return error(ErrorCode.NOT_FOUND, "此文件尚未生成 Markdown 版本，请先转换")

    md_path = Path(kb_file.md_file_path)
    if not md_path.exists():
        return error(ErrorCode.NOT_FOUND, "Markdown 文件不存在")

    md_content = md_path.read_text(encoding="utf-8")
    if not md_content.strip():
        return error(ErrorCode.VALIDATION_ERROR, "Markdown 内容为空")

    # 如果之前有图谱数据，先清理
    graph_svc = get_graph_service()
    if kb_file.graph_status == "completed" and (kb_file.graph_node_count or 0) > 0:
        try:
            await graph_svc.delete_by_doc(db, file_id)
            logger.info(f"已清理旧图谱数据 [file_id={file_id}]")
        except Exception as e:
            logger.warning(f"清理旧图谱数据失败 [file_id={file_id}]: {e}")

    # 调用 Dify 实体抽取
    kb_file.graph_status = "extracting"
    await db.flush()

    dify = get_dify_service()
    try:
        triples = await dify.extract_entities(md_content)
    except Exception as e:
        kb_file.graph_status = "failed"
        kb_file.graph_error = f"Dify 实体抽取失败: {str(e)}"
        await db.flush()
        return error(ErrorCode.DIFY_ERROR, f"实体抽取失败: {str(e)}")

    if not triples:
        kb_file.graph_status = "completed"
        kb_file.graph_error = "未抽取到实体关系"
        kb_file.graph_node_count = 0
        kb_file.graph_edge_count = 0
        await db.flush()
        return success(data={
            "file_id": str(file_id),
            "triples_count": 0,
            "nodes_created": 0,
            "edges_created": 0,
        }, message="未抽取到实体关系")

    # 写入图数据库
    try:
        ingest_result = await graph_svc.ingest_triples(
            db=db,
            triples=triples,
            source_doc_id=file_id,
        )

        kb_file.graph_status = "completed"
        kb_file.graph_node_count = ingest_result.get("nodes_total", ingest_result["nodes_created"])
        kb_file.graph_edge_count = ingest_result.get("edges_total", ingest_result["edges_created"])
        if ingest_result["errors"]:
            kb_file.graph_error = "; ".join(ingest_result["errors"][:5])
        else:
            kb_file.graph_error = None

        await db.flush()
    except Exception as e:
        kb_file.graph_status = "failed"
        kb_file.graph_error = f"图谱写入失败: {str(e)}"
        await db.flush()
        return error(ErrorCode.INTERNAL_ERROR, f"图谱写入失败: {str(e)}")

    nodes_total = ingest_result.get("nodes_total", ingest_result["nodes_created"])
    edges_total = ingest_result.get("edges_total", ingest_result["edges_created"])

    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="手动知识图谱抽取", module="知识库",
        detail=(
            f"文件: {kb_file.name}, "
            f"三元组: {len(triples)}, "
            f"节点: {nodes_total}(新增{ingest_result['nodes_created']}), "
            f"边: {edges_total}(新增{ingest_result['edges_created']})"
        ),
        ip_address=request.client.host if request.client else None,
    )

    return success(
        data={
            "file_id": str(file_id),
            "triples_count": len(triples),
            "nodes_created": ingest_result["nodes_created"],
            "nodes_total": nodes_total,
            "edges_created": ingest_result["edges_created"],
            "edges_total": edges_total,
            "age_synced": ingest_result["age_synced"],
            "errors": ingest_result["errors"],
        },
        message=f"成功抽取 {len(triples)} 条三元组并写入图谱",
    )
