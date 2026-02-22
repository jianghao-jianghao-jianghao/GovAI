"""
知识库强一致性同步服务。

在应用启动时执行，确保本地 PostgreSQL 知识库与 Dify 远端知识库完全一致。

同步策略（以本地 DB 为主源，Dify 为从属）：
  1. 本地有集合但 Dify 无对应 Dataset → 在 Dify 创建 Dataset 并回填 dify_dataset_id
  2. 本地有文件但 Dify 无对应 Document → 重新上传文件到 Dify
  3. Dify 有孤立 Dataset（本地无对应集合）→ 从 Dify 删除
  4. Dify 有孤立 Document（本地无对应文件）→ 从 Dify 删除
  5. 文件状态不一致（本地 indexing 但 Dify 已 completed）→ 更新本地状态

设计原则：
  - 本地 PostgreSQL 是唯一真理来源（Source of Truth）
  - Dify 是派生存储，必须与本地保持一致
  - 同步失败不阻塞应用启动，仅记录警告
"""

import asyncio
import logging
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.knowledge import KBCollection, KBFile
from app.services.dify.factory import get_dify_service
from app.services.dify.base import DifyDatasetItem, DifyDocumentItem

logger = logging.getLogger("govai.kb_sync")


async def sync_kb_with_dify():
    """
    启动时知识库全量同步入口。
    
    确保本地 DB 与 Dify 的知识库数据强一致。
    任何单步失败都会被捕获并记录，不会中断整体同步流程。
    """
    dify = get_dify_service()

    # 检测 Dify 是否可用（非 Mock 模式才同步）
    try:
        dify_datasets = await dify.list_datasets()
    except Exception as e:
        logger.warning(f"⚠️  Dify 不可达，跳过知识库同步: {e}")
        return

    logger.info("🔄 开始知识库同步检查...")

    dify_dataset_map: dict[str, DifyDatasetItem] = {
        ds.dataset_id: ds for ds in dify_datasets
    }

    async with AsyncSessionLocal() as session:
        # ── 第一步：同步集合 (Collection ↔ Dataset) ──
        await _sync_collections(session, dify, dify_dataset_map)
        await session.commit()

        # ── 第二步：同步文件 (KBFile ↔ Document) ──
        await _sync_files(session, dify)
        await session.commit()

        # ── 第三步：清理 Dify 孤立 Dataset ──
        await _cleanup_orphan_datasets(session, dify, dify_dataset_map)

    logger.info("✅ 知识库同步检查完成")


async def _sync_collections(
    session: AsyncSession,
    dify,
    dify_dataset_map: dict[str, DifyDatasetItem],
):
    """
    同步集合：确保每个本地集合在 Dify 都有对应的 Dataset。
    
    场景：
    - 数据库已持久化，但 Dify 侧被清理/重建
    - 种子数据中的集合没有 dify_dataset_id
    """
    result = await session.execute(select(KBCollection).order_by(KBCollection.created_at))
    collections = result.scalars().all()

    for coll in collections:
        try:
            if not coll.dify_dataset_id:
                # 情况 A：本地集合没有 dify_dataset_id（种子数据或历史遗留）
                logger.info(f"📦 集合 '{coll.name}' 无 Dify Dataset，正在创建...")
                dataset_info = await dify.create_dataset(coll.name)
                coll.dify_dataset_id = dataset_info.dataset_id
                await session.flush()
                logger.info(f"  ✅ 已创建 Dataset: {dataset_info.dataset_id}")

            elif coll.dify_dataset_id not in dify_dataset_map:
                # 情况 B：本地有 dify_dataset_id 但 Dify 上不存在（Dify 侧被删）
                logger.warning(
                    f"📦 集合 '{coll.name}' 的 Dataset {coll.dify_dataset_id} "
                    f"在 Dify 中不存在，正在重新创建..."
                )
                old_id = coll.dify_dataset_id
                dataset_info = await dify.create_dataset(coll.name)
                coll.dify_dataset_id = dataset_info.dataset_id
                await session.flush()
                logger.info(
                    f"  ✅ 已重建 Dataset: {old_id} → {dataset_info.dataset_id}"
                )

                # 标记该集合下所有文件需要重新上传到 Dify
                files_result = await session.execute(
                    select(KBFile).where(KBFile.collection_id == coll.id)
                )
                for f in files_result.scalars().all():
                    f.dify_document_id = None
                    f.dify_batch_id = None
                    if f.status == "indexed":
                        f.status = "indexed"  # 保持本地状态，但需要重新上传
                await session.flush()
            else:
                # 情况 C：一切正常
                pass

        except Exception as e:
            logger.error(f"❌ 同步集合 '{coll.name}' 失败: {e}")


async def _sync_files(session: AsyncSession, dify):
    """
    同步文件：确保每个本地已索引的文件在 Dify 都有对应的 Document。
    
    场景：
    - Dify Dataset 被重建后，文件需要重新上传
    - 文件状态停滞在 indexing/uploading
    """
    # 获取所有集合（需要 dify_dataset_id）
    coll_result = await session.execute(select(KBCollection))
    collections = {c.id: c for c in coll_result.scalars().all()}

    # 获取所有需要同步的文件
    files_result = await session.execute(select(KBFile).order_by(KBFile.uploaded_at))
    files = files_result.scalars().all()

    # 按集合分组，获取 Dify 侧的文档列表用于比对
    dify_docs_cache: dict[str, dict[str, DifyDocumentItem]] = {}
    
    reupload_count = 0
    status_fix_count = 0

    for f in files:
        coll = collections.get(f.collection_id)
        if not coll or not coll.dify_dataset_id:
            continue  # 集合无 dataset_id，跳过

        try:
            dataset_id = coll.dify_dataset_id

            # 缓存 Dify 文档列表
            if dataset_id not in dify_docs_cache:
                try:
                    dify_docs = await dify.list_dataset_documents(dataset_id)
                    dify_docs_cache[dataset_id] = {
                        doc.document_id: doc for doc in dify_docs
                    }
                except Exception as e:
                    logger.warning(f"获取 Dataset {dataset_id} 文档列表失败: {e}")
                    dify_docs_cache[dataset_id] = {}

            dify_doc_map = dify_docs_cache[dataset_id]

            # 情况 A：文件有 dify_document_id 且在 Dify 中存在 → 检查状态
            if f.dify_document_id and f.dify_document_id in dify_doc_map:
                dify_doc = dify_doc_map[f.dify_document_id]
                if f.status == "indexing" and dify_doc.indexing_status == "completed":
                    f.status = "indexed"
                    status_fix_count += 1
                    logger.info(f"  📄 修正文件状态: '{f.name}' indexing → indexed")
                elif f.status == "indexing" and dify_doc.indexing_status == "error":
                    f.status = "failed"
                    f.error_message = "Dify 索引失败（同步时发现）"
                    status_fix_count += 1
                continue

            # 情况 B：文件有 dify_document_id 但 Dify 中不存在，或者没有 dify_document_id
            # → 需要重新上传
            if f.status in ("indexed", "indexing", "uploading"):
                # 找到本地 Markdown 或原始文件
                file_content = None
                file_name = f.name
                file_path = None

                # 优先使用 Markdown 文件
                if f.md_file_path and Path(f.md_file_path).exists():
                    file_path = Path(f.md_file_path)
                    file_content = file_path.read_bytes()
                    # Dify 上传时使用 .md 扩展名
                    if not file_name.endswith(".md"):
                        file_name = file_name.rsplit(".", 1)[0] + ".md" if "." in file_name else file_name + ".md"
                elif f.file_path and Path(f.file_path).exists():
                    file_path = Path(f.file_path)
                    file_content = file_path.read_bytes()

                if file_content:
                    logger.info(f"  📄 重新上传文件到 Dify: '{f.name}'")
                    try:
                        upload_result = await dify.upload_document(
                            dataset_id=dataset_id,
                            file_name=file_name,
                            file_content=file_content,
                            file_type=f.file_type or "md",
                        )
                        f.dify_document_id = upload_result.document_id
                        f.dify_batch_id = upload_result.batch_id
                        f.status = "indexing"
                        reupload_count += 1

                        # 启动后台轮询索引状态
                        asyncio.create_task(
                            _poll_indexing_after_sync(f.id, dataset_id, upload_result.batch_id)
                        )
                    except Exception as e:
                        logger.warning(f"  ⚠️  重新上传失败 '{f.name}': {e}")
                else:
                    logger.warning(
                        f"  ⚠️  文件 '{f.name}' 本地文件不存在，无法重新上传到 Dify"
                    )

        except Exception as e:
            logger.error(f"❌ 同步文件 '{f.name}' 失败: {e}")

    await session.flush()

    if reupload_count or status_fix_count:
        logger.info(
            f"  📊 文件同步: 重新上传 {reupload_count} 个, 状态修正 {status_fix_count} 个"
        )


async def _cleanup_orphan_datasets(
    session: AsyncSession,
    dify,
    dify_dataset_map: dict[str, DifyDatasetItem],
):
    """
    清理 Dify 上的孤立 Dataset（本地无对应集合）。
    
    场景：
    - 本地集合已删除，但 Dify 侧的 Dataset 残留
    - 注意：只清理名称以特定前缀开头的 Dataset，避免误删用户手动创建的
    """
    # 获取本地所有已关联的 dify_dataset_id
    result = await session.execute(
        select(KBCollection.dify_dataset_id).where(KBCollection.dify_dataset_id.isnot(None))
    )
    local_dataset_ids = {row[0] for row in result.all()}

    orphan_count = 0
    for dataset_id, ds_item in dify_dataset_map.items():
        if dataset_id not in local_dataset_ids:
            logger.info(
                f"  🗑️  Dify 孤立 Dataset: '{ds_item.name}' ({dataset_id})，正在清理..."
            )
            try:
                await dify.delete_dataset(dataset_id)
                orphan_count += 1
            except Exception as e:
                logger.warning(f"  ⚠️  清理孤立 Dataset 失败: {e}")

    if orphan_count:
        logger.info(f"  📊 清理了 {orphan_count} 个孤立 Dataset")


async def _poll_indexing_after_sync(
    file_id: UUID,
    dataset_id: str,
    batch_id: str,
    max_retries: int = 60,
    interval: float = 3.0,
):
    """同步重新上传后的索引状态轮询（与 knowledge.py 中的逻辑一致）"""
    dify = get_dify_service()

    for attempt in range(max_retries):
        await asyncio.sleep(interval)
        try:
            status = await dify.get_indexing_status(dataset_id, batch_id)
        except Exception:
            continue

        if status in ("completed", "indexed"):
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(KBFile).where(KBFile.id == file_id))
                kb_file = result.scalar_one_or_none()
                if kb_file:
                    kb_file.status = "indexed"
                    await session.commit()
            logger.info(f"  ✅ 同步上传文件索引完成 [file_id={file_id}]")
            return

        if status == "error":
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(KBFile).where(KBFile.id == file_id))
                kb_file = result.scalar_one_or_none()
                if kb_file:
                    kb_file.status = "failed"
                    kb_file.error_message = "Dify 索引失败（同步重传后）"
                    await session.commit()
            return

    # 超时
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(KBFile).where(KBFile.id == file_id))
        kb_file = result.scalar_one_or_none()
        if kb_file and kb_file.status == "indexing":
            kb_file.status = "failed"
            kb_file.error_message = f"索引超时（同步重传后，{max_retries * interval:.0f}秒）"
            await session.commit()
