"""知识图谱查询路由"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import success
from app.core.deps import require_permission
from app.models.user import User
from app.models.graph import GraphEntity, GraphRelationship
from app.schemas.graph import GraphNodeItem, GraphEdgeItem

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
