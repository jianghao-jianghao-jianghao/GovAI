/**
 * 知识图谱 API
 */
import { api } from "./client";

export interface GraphNode {
  id: string;
  name: string;
  entity_type: string;
  weight: number;
  source_doc_id?: string;
  created_at: string;
}

export interface GraphEdge {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  relation_desc?: string;
  source_name: string;
  target_name: string;
}

export async function apiGetGraphNodes(filters?: {
  entity_type?: string;
  keyword?: string;
}) {
  const params: Record<string, string> = {};
  if (filters?.entity_type) params.entity_type = filters.entity_type;
  if (filters?.keyword) params.keyword = filters.keyword;

  const res = await api.get<GraphNode[]>("/graph/nodes", params);
  return res.data;
}

export async function apiGetGraphEdges() {
  const res = await api.get<GraphEdge[]>("/graph/edges");
  return res.data;
}

export async function apiGetSubgraph(centerNode: string, depth = 2) {
  const res = await api.get<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    "/graph/subgraph",
    { center_node: centerNode, depth: String(depth) },
  );
  return res.data;
}

export async function apiSearchGraphNodes(q: string, limit = 20) {
  const res = await api.get<GraphNode[]>("/graph/search", {
    q,
    limit: String(limit),
  });
  return res.data;
}

export async function apiExtractEntities(text: string, sourceDocId?: string) {
  const res = await api.post<{
    triples: {
      source: string;
      target: string;
      relation: string;
      source_type: string;
      target_type: string;
    }[];
    nodes_created: number;
    edges_created: number;
  }>("/graph/extract", { text, source_doc_id: sourceDocId });
  return res.data;
}

/* ── 节点 CRUD ── */

export async function apiUpdateGraphNode(
  nodeId: string,
  updates: {
    name?: string;
    entity_type?: string;
    weight?: number;
    properties?: Record<string, unknown>;
  },
) {
  const res = await api.put<GraphNode>(`/graph/nodes/${nodeId}`, updates);
  return res.data;
}

export async function apiDeleteGraphNode(nodeId: string) {
  const res = await api.delete<{ deleted: boolean }>(`/graph/nodes/${nodeId}`);
  return res.data;
}

export async function apiDeleteGraphNodes(ids: string[]) {
  const res = await api.post<{ deleted: number }>("/graph/nodes/batch-delete", {
    ids,
  });
  return res.data;
}
