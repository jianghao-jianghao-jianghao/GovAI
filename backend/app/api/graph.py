"""知识图谱查询路由"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success, error, ErrorCode
from app.core.deps import require_permission
from app.core.audit import log_action
from app.models.user import User
from app.models.graph import GraphEntity, GraphRelationship
from app.schemas.graph import (
    GraphNodeItem, GraphEdgeItem,
    GraphExtractRequest, ExtractedTripleItem, GraphExtractResponse,
    GraphNodeUpdateRequest, GraphBatchDeleteRequest,
)
from app.services.dify.factory import get_dify_service
from app.services.graph_service import get_graph_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get("/nodes")
async def list_graph_nodes(
    entity_type: str = Query(None),
    keyword: str = Query(None),
    current_user: User = Depends(require_permission("res:graph:view")),
    db: AsyncSession = Depends(get_db),
):
    """图谱节点列表"""
    query = select(GraphEntity)
    if entity_type:
        query = query.where(GraphEntity.entity_type == entity_type)
    if keyword:
        query = query.where(GraphEntity.name.ilike(f"%{keyword}%"))

    result = await db.execute(query)
    nodes = [GraphNodeItem.model_validate(n).model_dump(mode="json") for n in result.scalars().all()]
    return success(data=nodes)


@router.get("/edges")
async def list_graph_edges(
    current_user: User = Depends(require_permission("res:graph:view")),
    db: AsyncSession = Depends(get_db),
):
    """图谱边列表"""
    result = await db.execute(select(GraphRelationship))
    edges_raw = result.scalars().all()

    # 批量查节点名称
    entity_ids = set()
    for e in edges_raw:
        entity_ids.add(e.source_entity_id)
        entity_ids.add(e.target_entity_id)

    name_map = {}
    if entity_ids:
        er = await db.execute(select(GraphEntity.id, GraphEntity.name).where(GraphEntity.id.in_(entity_ids)))
        name_map = {row[0]: row[1] for row in er.all()}

    edges = [
        {
            **GraphEdgeItem.model_validate(e).model_dump(mode="json"),
            "source_name": name_map.get(e.source_entity_id, ""),
            "target_name": name_map.get(e.target_entity_id, ""),
        }
        for e in edges_raw
    ]

    return success(data=edges)


@router.get("/subgraph")
async def get_subgraph(
    center_node: str = Query(..., description="中心节点名称"),
    depth: int = Query(2, ge=1, le=5, description="扩展跳数"),
    current_user: User = Depends(require_permission("res:graph:view")),
    db: AsyncSession = Depends(get_db),
):
    """获取子图"""
    # 找到中心节点
    center_result = await db.execute(
        select(GraphEntity).where(GraphEntity.name == center_node)
    )
    center = center_result.scalar_one_or_none()
    if not center:
        return success(data={"nodes": [], "edges": []})

    # BFS 扩展
    visited_ids = {center.id}
    frontier = {center.id}
    all_edges = []

    for _ in range(depth):
        if not frontier:
            break
        edges_result = await db.execute(
            select(GraphRelationship).where(
                or_(
                    GraphRelationship.source_entity_id.in_(frontier),
                    GraphRelationship.target_entity_id.in_(frontier),
                )
            )
        )
        new_frontier = set()
        for edge in edges_result.scalars().all():
            all_edges.append(edge)
            for eid in (edge.source_entity_id, edge.target_entity_id):
                if eid not in visited_ids:
                    visited_ids.add(eid)
                    new_frontier.add(eid)
        frontier = new_frontier

    # 查所有涉及的节点
    nodes = []
    if visited_ids:
        nodes_result = await db.execute(
            select(GraphEntity).where(GraphEntity.id.in_(visited_ids))
        )
        nodes = [GraphNodeItem.model_validate(n).model_dump(mode="json") for n in nodes_result.scalars().all()]

    # 查节点名称用于边
    name_map = {}
    if visited_ids:
        nr = await db.execute(select(GraphEntity.id, GraphEntity.name).where(GraphEntity.id.in_(visited_ids)))
        name_map = {row[0]: row[1] for row in nr.all()}

    # 去重边
    seen_edges = set()
    edges = []
    for e in all_edges:
        if e.id not in seen_edges:
            seen_edges.add(e.id)
            edges.append({
                **GraphEdgeItem.model_validate(e).model_dump(mode="json"),
                "source_name": name_map.get(e.source_entity_id, ""),
                "target_name": name_map.get(e.target_entity_id, ""),
            })

    return success(data={"nodes": nodes, "edges": edges})


@router.get("/search")
async def search_graph_nodes(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_permission("res:graph:view")),
    db: AsyncSession = Depends(get_db),
):
    """搜索图谱节点"""
    result = await db.execute(
        select(GraphEntity)
        .where(GraphEntity.name.ilike(f"%{q}%"))
        .limit(limit)
    )
    nodes = [GraphNodeItem.model_validate(n).model_dump(mode="json") for n in result.scalars().all()]
    return success(data=nodes)


# ── 节点 CRUD ──


@router.post("/nodes/batch-delete")
async def batch_delete_nodes(
    body: GraphBatchDeleteRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:graph:edit")),
    db: AsyncSession = Depends(get_db),
):
    """批量删除图谱节点及其关联边"""
    graph_svc = get_graph_service()
    deleted = await graph_svc.delete_entities_batch(db, body.ids)
    await db.commit()
    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="批量删除节点",
        module="知识图谱",
        detail=f"批量删除 {deleted} 个节点",
        ip_address=request.client.host if request.client else None,
    )
    return success(data={"deleted": deleted})


@router.put("/nodes/{node_id}")
async def update_graph_node(
    node_id: UUID,
    body: GraphNodeUpdateRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:graph:edit")),
    db: AsyncSession = Depends(get_db),
):
    """更新图谱节点"""
    graph_svc = get_graph_service()
    update_fields = body.model_dump(exclude_none=True)
    if not update_fields:
        return error(ErrorCode.PARAM_INVALID, "至少提供一个需要更新的字段")

    entity = await graph_svc.update_entity(db, node_id, **update_fields)
    if not entity:
        return error(ErrorCode.NOT_FOUND, "节点不存在")

    await db.commit()
    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="更新节点",
        module="知识图谱",
        detail=f"更新节点 {entity.name}",
        ip_address=request.client.host if request.client else None,
    )
    return success(data=GraphNodeItem.model_validate(entity).model_dump(mode="json"))


@router.delete("/nodes/{node_id}")
async def delete_graph_node(
    node_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("res:graph:edit")),
    db: AsyncSession = Depends(get_db),
):
    """删除单个图谱节点及其关联边"""
    graph_svc = get_graph_service()
    deleted = await graph_svc.delete_entity(db, node_id)
    if not deleted:
        return error(ErrorCode.NOT_FOUND, "节点不存在")

    await db.commit()
    await log_action(
        db,
        user_id=current_user.id,
        user_display_name=current_user.display_name,
        action="删除节点",
        module="知识图谱",
        detail=f"删除节点 {node_id}",
        ip_address=request.client.host if request.client else None,
    )
    return success(data={"deleted": True})


# ── 实体抽取 + 图谱写入 ──


@router.post("/extract")
async def extract_and_write_graph(
    body: GraphExtractRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:graph:edit")),
    db: AsyncSession = Depends(get_db),
):
    """
    调用 Dify 实体抽取 Workflow，将返回的三元组写入知识图谱。

    流程：
    1. 调用 dify.extract_entities(text) → list[EntityTriple]
    2. 通过 GraphService 将三元组同时写入：
       - PostgreSQL 关系表 (graph_entities / graph_relationships)
       - Apache AGE 图数据库 (knowledge_graph)
    3. 返回抽取结果与写入统计
    """
    dify = get_dify_service()

    # 1. 调用 Dify 实体抽取
    try:
        triples = await dify.extract_entities(body.text)
    except Exception as e:
        logger.error(f"实体抽取失败: {e}")
        return error(ErrorCode.DIFY_ERROR, f"实体抽取失败: {str(e)}")

    if not triples:
        return success(
            data=GraphExtractResponse(triples=[], nodes_created=0, edges_created=0).model_dump(),
            message="未抽取到实体关系",
        )

    # 2. 通过 GraphService 写入 PostgreSQL + AGE
    graph_service = get_graph_service()
    try:
        ingest_result = await graph_service.ingest_triples(
            db=db,
            triples=triples,
            source_doc_id=body.source_doc_id,
        )
    except Exception as e:
        logger.error(f"图谱写入失败: {e}")
        return error(ErrorCode.INTERNAL_ERROR, f"图谱写入失败: {str(e)}")

    # 3. 构建响应
    triple_items = [
        ExtractedTripleItem(
            source=t.source,
            target=t.target,
            relation=t.relation,
            source_type=t.source_type,
            target_type=t.target_type,
        )
        for t in triples
    ]

    # 4. 审计日志
    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="实体抽取入图", module="知识图谱",
        detail=(
            f"抽取三元组 {len(triples)} 条，"
            f"新增节点 {ingest_result['nodes_created']}，"
            f"新增边 {ingest_result['edges_created']}，"
            f"AGE同步={'成功' if ingest_result['age_synced'] else '失败'}"
        ),
        ip_address=request.client.host if request.client else None,
    )

    resp = GraphExtractResponse(
        triples=triple_items,
        nodes_created=ingest_result["nodes_created"],
        edges_created=ingest_result["edges_created"],
    )

    return success(data=resp.model_dump(), message=f"成功抽取 {len(triples)} 条三元组并写入图谱")
