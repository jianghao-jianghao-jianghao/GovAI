"""知识图谱 Pydantic Schema"""

from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


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


# ── 实体抽取请求 / 响应 ──


class GraphExtractRequest(BaseModel):
    """实体抽取请求"""
    text: str = Field(..., min_length=1, max_length=50000, description="待抽取文本")
    source_doc_id: Optional[UUID] = Field(None, description="来源文档 ID（可选，用于溯源）")


class ExtractedTripleItem(BaseModel):
    """单条抽取结果"""
    source: str
    target: str
    relation: str
    source_type: str = ""
    target_type: str = ""


class GraphExtractResponse(BaseModel):
    """实体抽取响应"""
    triples: List[ExtractedTripleItem] = []
    nodes_created: int = 0
    edges_created: int = 0
