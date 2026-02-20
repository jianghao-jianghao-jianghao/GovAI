/**
 * 知识库集合、文件、QA 问答对 API
 */
import { api, uploadRequest, downloadRequest } from "./client";

// ── 集合 ──

export interface KBCollection {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  dify_dataset_id: string | null;
  file_count: number;
  can_manage: boolean;
  can_ref: boolean;
  created_at: string;
}

export async function apiListCollections(): Promise<KBCollection[]> {
  const res = await api.get<KBCollection[]>("/kb/collections");
  return res.data;
}

export async function apiCreateCollection(body: {
  name: string;
  parent_id?: string;
  description?: string;
}) {
  const res = await api.post<{ id: string; dify_dataset_id: string }>(
    "/kb/collections",
    body,
  );
  return res.data;
}

export async function apiUpdateCollection(
  id: string,
  body: { name?: string; description?: string },
) {
  await api.put(`/kb/collections/${id}`, body);
}

export async function apiDeleteCollection(id: string) {
  await api.delete(`/kb/collections/${id}`);
}

// ── 文件 ──

export interface KBFile {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  status: string;
  uploaded_at: string;
  uploader_name?: string;
  error_message?: string;
  has_markdown?: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

export async function apiListFiles(
  collectionId: string,
  page = 1,
  pageSize = 100,
  filters?: { status?: string; keyword?: string },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.status) params.status = filters.status;
  if (filters?.keyword) params.keyword = filters.keyword;

  const res = await api.get<{ items: KBFile[]; total: number }>(
    `/kb/collections/${collectionId}/files`,
    params,
  );
  return res.data;
}

export async function apiUploadFiles(
  collectionId: string,
  files: FileList | File[],
) {
  const formData = new FormData();
  Array.from(files).forEach((f) => formData.append("files", f));
  const res = await uploadRequest<{
    uploaded: KBFile[];
    failed: { name: string; error: string }[];
  }>(`/kb/collections/${collectionId}/files`, formData);
  return res.data;
}

export async function apiRenameFile(fileId: string, name: string) {
  await api.put(`/kb/files/${fileId}`, { name });
}

export async function apiDeleteFile(fileId: string) {
  await api.delete(`/kb/files/${fileId}`);
}

export async function apiGetFileIndexingStatus(fileId: string) {
  const res = await api.get<{
    file_id: string;
    status: string;
    error_message?: string;
  }>(`/kb/files/${fileId}/indexing-status`);
  return res.data;
}

export async function apiBatchExportFiles(fileIds: string[]) {
  return downloadRequest("/kb/files/batch-export", { file_ids: fileIds });
}

export async function apiGetFileMarkdown(fileId: string) {
  const res = await api.get<{
    file_id: string;
    file_name: string;
    markdown: string;
    char_count: number;
  }>(`/kb/files/${fileId}/markdown`);
  return res.data;
}

// ── QA 问答对 ──

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  category: string;
  source_type?: string;
  created_at: string;
}

export async function apiListQaPairs(
  page = 1,
  pageSize = 100,
  filters?: { keyword?: string; category?: string },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.keyword) params.keyword = filters.keyword;
  if (filters?.category) params.category = filters.category;

  const res = await api.get<{ items: QAPair[]; total: number }>(
    "/qa-pairs",
    params,
  );
  return res.data;
}

export async function apiSaveQaPair(body: {
  question: string;
  answer: string;
  category?: string;
  source_type?: string;
  source_session_id?: string;
}) {
  const res = await api.post<{ id: string }>("/qa-pairs", body);
  return res.data;
}

export async function apiUpdateQaPair(
  id: string,
  body: { question?: string; answer?: string; category?: string },
) {
  await api.put(`/qa-pairs/${id}`, body);
}

export async function apiDeleteQaPair(id: string) {
  await api.delete(`/qa-pairs/${id}`);
}
