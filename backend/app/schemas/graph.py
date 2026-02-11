"""知识图谱 Pydantic Schema"""

from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class GraphNodeItem(BaseModel):
    id: UUID
    name: str
    entity_type: str
    group_id: int
    weight: int
    properties: Optional[dict] = None

    model_config = {"from_attributes": True}


class GraphEdgeItem(BaseModel):
    id: UUID
    source_entity_id: UUID
    target_entity_id: UUID
    source_name: Optional[str] = None
    target_name: Optional[str] = None
    relation_type: str
    relation_desc: Optional[str] = None
    weight: float = 1.0

    model_config = {"from_attributes": True}


class GraphSubgraphResponse(BaseModel):
    nodes: List[GraphNodeItem] = []
    edges: List[GraphEdgeItem] = []
