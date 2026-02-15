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
)
from app.services.dify.factory import get_dify_service

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


# ── 实体抽取 + 图谱写入 ──


@router.post("/extract")
async def extract_and_write_graph(
    body: GraphExtractRequest,
    request: Request,
    current_user: User = Depends(require_permission("res:graph:view")),
    db: AsyncSession = Depends(get_db),
):
    """
    调用 Dify 实体抽取 Workflow，将返回的三元组写入知识图谱。

    流程：
    1. 调用 dify.extract_entities(text) → list[EntityTriple]
    2. 对每个三元组，upsert 实体节点（按 name + entity_type 去重）
    3. 创建关系边
    4. 返回抽取结果与写入统计
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

    # 2. Upsert 实体节点（按 name + entity_type 去重）
    entity_cache: dict[tuple[str, str], GraphEntity] = {}   # (name, type) → entity
    nodes_created = 0

    async def _get_or_create_entity(name: str, entity_type: str) -> GraphEntity:
        nonlocal nodes_created
        key = (name.strip(), entity_type.strip() or "未知")
        if key in entity_cache:
            return entity_cache[key]

        # 查询数据库是否已有
        result = await db.execute(
            select(GraphEntity).where(
                GraphEntity.name == key[0],
                GraphEntity.entity_type == key[1],
            )
        )
        entity = result.scalar_one_or_none()

        if entity:
            # 已有实体 → 权重 +1
            entity.weight = (entity.weight or 10) + 1
        else:
            # 新建实体
            entity = GraphEntity(
                name=key[0],
                entity_type=key[1],
                source_doc_id=body.source_doc_id,
            )
            db.add(entity)
            await db.flush()
            nodes_created += 1

        entity_cache[key] = entity
        return entity

    # 3. 遍历三元组，写入节点 + 关系
    edges_created = 0
    triple_items: list[ExtractedTripleItem] = []

    for triple in triples:
        source_entity = await _get_or_create_entity(triple.source, triple.source_type)
        target_entity = await _get_or_create_entity(triple.target, triple.target_type)

        # 创建关系边（允许重复关系，不做去重 → 表示多次出现的关系权重更高）
        rel = GraphRelationship(
            source_entity_id=source_entity.id,
            target_entity_id=target_entity.id,
            relation_type=triple.relation.strip(),
            relation_desc=triple.relation.strip(),
            source_doc_id=body.source_doc_id,
        )
        db.add(rel)
        edges_created += 1

        triple_items.append(ExtractedTripleItem(
            source=triple.source,
            target=triple.target,
            relation=triple.relation,
            source_type=triple.source_type,
            target_type=triple.target_type,
        ))

    await db.flush()

    # 4. 审计日志
    await log_action(
        db, user_id=current_user.id, user_display_name=current_user.display_name,
        action="实体抽取入图", module="知识图谱",
        detail=f"抽取三元组 {len(triples)} 条，新增节点 {nodes_created}，新增边 {edges_created}",
        ip_address=request.client.host if request.client else None,
    )

    resp = GraphExtractResponse(
        triples=triple_items,
        nodes_created=nodes_created,
        edges_created=edges_created,
    )

    return success(data=resp.model_dump(), message=f"成功抽取 {len(triples)} 条三元组并写入图谱")
