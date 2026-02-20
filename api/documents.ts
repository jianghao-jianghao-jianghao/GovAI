/**
 * 公文管理 + 素材库 API
 */
import { api, uploadRequest, downloadRequest } from "./client";

// ── 中英文映射 ──

export const DOC_STATUS_MAP: Record<string, string> = {
  draft: "草稿",
  checked: "已检查",
  optimized: "已优化",
  archived: "已归档",
  unfilled: "未补充",
  filled: "已补充",
};
export const DOC_TYPE_MAP: Record<string, string> = {
  request: "请示",
  report: "报告",
  notice: "通知",
  briefing: "汇报",
  ai_generated: "AI生成",
};
export const SECURITY_MAP: Record<string, string> = {
  public: "公开",
  internal: "内部",
  secret: "秘密",
  confidential: "机密",
};
export const URGENCY_MAP: Record<string, string> = {
  normal: "平件",
  urgent: "急件",
  very_urgent: "特急",
};

// ── 文档类型 ──

export interface DocListItem {
  id: string;
  title: string;
  category: string;
  doc_type: string;
  status: string;
  security: string;
  urgency: string;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  has_source_file?: boolean;
  has_markdown_file?: boolean;
}

export interface DocDetail extends DocListItem {
  content: string;
  source_format?: string;
}

// ── CRUD ──

export async function apiListDocuments(
  category: string,
  page = 1,
  pageSize = 100,
  filters?: {
    keyword?: string;
    doc_type?: string;
    status?: string;
    security?: string;
    start_date?: string;
    end_date?: string;
  },
) {
  const params: Record<string, string> = {
    category,
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.keyword) params.keyword = filters.keyword;
  if (filters?.doc_type) params.doc_type = filters.doc_type;
  if (filters?.status) params.status = filters.status;
  if (filters?.security) params.security = filters.security;
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;

  const res = await api.get<{ items: DocListItem[]; total: number }>(
    "/documents",
    params,
  );
  return res.data;
}

export async function apiGetDocument(id: string) {
  const res = await api.get<DocDetail>(`/documents/${id}`);
  return res.data;
}

export async function apiCreateDocument(body: {
  title: string;
  category: string;
  doc_type?: string;
  content?: string;
  urgency?: string;
  security?: string;
}) {
  const res = await api.post<{ id: string }>("/documents", body);
  return res.data;
}

export async function apiUpdateDocument(
  id: string,
  body: {
    title?: string;
    content?: string;
    doc_type?: string;
    status?: string;
    urgency?: string;
    security?: string;
  },
) {
  await api.put(`/documents/${id}`, body);
}

export async function apiDeleteDocument(id: string) {
  await api.delete(`/documents/${id}`);
}

export async function apiArchiveDocument(id: string) {
  await api.post(`/documents/${id}/archive`);
}

// ── 导入 / 导出 ──

export async function apiImportDocument(
  file: File,
  category: string,
  docType: string,
  security: string,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  formData.append("doc_type", docType);
  formData.append("security", security);

  const res = await uploadRequest<{
    id: string;
    title: string;
    format: string;
    char_count: number;
  }>("/documents/import", formData);
  return res.data;
}

export async function apiExportDocuments(
  ids?: string[],
  format: string = "csv",
) {
  return downloadRequest("/documents/export", { ids, format });
}

// ── AI 处理 ──

export interface ProcessResult {
  document_id: string;
  process_type: string;
  content: string;
  new_status: string;
  review_result: {
    typos: { text: string; suggestion: string; context: string }[];
    grammar: { text: string; suggestion: string; context: string }[];
    sensitive: { text: string; suggestion: string; context: string }[];
  } | null;
}

export async function apiProcessDocument(id: string, processType: string) {
  const res = await api.post<ProcessResult>(`/documents/${id}/process`, {
    process_type: processType,
  });
  return res.data;
}

// ── 版本 ──

export interface DocVersion {
  id: string;
  version_number: number;
  change_type?: string;
  change_summary?: string;
  created_at: string;
  created_by_name?: string;
}

export async function apiListDocVersions(docId: string) {
  const res = await api.get<DocVersion[]>(`/documents/${docId}/versions`);
  return res.data;
}

// ── 素材库 ──

export interface Material {
  id: string;
  title: string;
  category: string;
  content: string;
  created_at: string;
}

export async function apiListMaterials(category?: string, keyword?: string) {
  const params: Record<string, string> = {};
  if (category) params.category = category;
  if (keyword) params.keyword = keyword;

  const res = await api.get<Material[]>("/materials", params);
  return res.data;
}

export async function apiCreateMaterial(body: {
  title: string;
  category: string;
  content: string;
}) {
  const res = await api.post<{ id: string }>("/materials", body);
  return res.data;
}

export async function apiUpdateMaterial(
  id: string,
  body: { title?: string; category?: string; content?: string },
) {
  await api.put(`/materials/${id}`, body);
}

export async function apiDeleteMaterial(id: string) {
  await api.delete(`/materials/${id}`);
}
