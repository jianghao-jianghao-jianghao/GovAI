/**
 * 公文管理 + 素材库 API
 */
import { api, uploadRequest, downloadRequest, getToken } from "./client";

// ── 中英文映射 ──

export const DOC_STATUS_MAP: Record<string, string> = {
  draft: "草稿",
  reviewed: "已审查",
  checked: "已审核",
  optimized: "已优化",
  formatted: "已格式化",
  archived: "已归档",
  unfilled: "未补充",
  filled: "已补充",
};
export const DOC_TYPE_MAP: Record<string, string> = {
  official: "公文标准",
  academic: "学术论文",
  legal: "法律文书",
  custom: "自定义",
  // 兼容旧数据
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
  formatted_paragraphs?: string;
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
    formatted_paragraphs?: string;
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
  file: File | null,
  category: string,
  docType: string,
  security: string,
  title?: string,
) {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  formData.append("category", category);
  formData.append("doc_type", docType);
  formData.append("security", security);
  if (title) {
    formData.append("title", title);
  }

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
  format: string = "zip",
) {
  return downloadRequest("/documents/export", { ids, format });
}

/** 下载单个文档的原始文件（docx/pdf等） */
export async function apiDownloadDocumentSource(id: string): Promise<Blob> {
  return downloadRequest(`/documents/${id}/source`);
}

/**
 * 调用对话式 AI 处理（SSE 流式）
 *
 * @param docId 文档 ID
 * @param stageType 处理阶段: draft/check/optimize/format
 * @param userInstruction 用户对话式指令
 * @param onChunk 每接收到一个 SSE 数据块的回调
 * @param onDone 完成回调
 * @param onError 错误回调
 */
export async function apiAiProcess(
  docId: string,
  stageType: string,
  userInstruction: string,
  onChunk: (data: AiProcessChunk) => void,
  onDone: () => void,
  onError: (err: string) => void,
  existingParagraphs?: any[],
) {
  try {
    const reqBody: Record<string, any> = {
      stage: stageType,
      user_instruction: userInstruction,
    };
    if (existingParagraphs && existingParagraphs.length > 0) {
      reqBody.existing_paragraphs = existingParagraphs;
    }
    const resp = await fetch(`/api/v1/documents/${docId}/ai-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken() || ""}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      onError(`AI 处理请求失败: ${resp.status} ${errText}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      onError("无法获取响应流");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            onDone();
            return;
          }
          try {
            const chunk = JSON.parse(jsonStr) as AiProcessChunk;
            onChunk(chunk);
          } catch {
            // ignore parse errors for partial chunks
          }
        }
      }
    }

    onDone();
  } catch (err: any) {
    onError(err.message || "AI 处理出错");
  }
}

/** AI 处理 SSE 数据块类型 */
export interface AiProcessChunk {
  type:
    | "text"
    | "structured_paragraph"
    | "replace_streaming_text"
    | "needs_more_info"
    | "status"
    | "error"
    | "done"
    | "review_suggestion"
    | "review_suggestions"
    | "draft_result";
  /** 纯文本内容 (type=text 时) */
  text?: string;
  /** 结构化段落 (type=structured_paragraph 时) */
  paragraph?: {
    text: string;
    style_type: string;
    font_size?: string;
    font_family?: string;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    indent?: string;
    alignment?: string;
    line_height?: string;
    /** 变更类型标记（Copilot-style） */
    _change?: "added" | "deleted" | "modified" | null;
    /** 修改前原文 */
    _original_text?: string;
    /** 变更原因 */
    _change_reason?: string;
  };
  /** 增量 diff 结果段落列表 (type=draft_result 时) */
  paragraphs?: Array<{
    text: string;
    style_type: string;
    _change?: "added" | "deleted" | "modified";
    _original_text?: string;
    _change_reason?: string;
  }>;
  /** 变更概要 (type=draft_result 时) */
  summary?: string;
  /** 变更数量 (type=draft_result 时) */
  change_count?: number;
  /** 状态消息 (type=status 时) */
  message?: string;
  /** 完整内容（type=done 时） */
  full_content?: string;
  /** 单条审查建议 (type=review_suggestion 时，实时逐条推送) */
  suggestion?: { index: number } & ReviewSuggestionItem;
  /** 审查优化建议 (type=review_suggestions 时，最终汇总) */
  suggestions?: ReviewSuggestionItem[];
}

/** 审查优化建议项 */
export interface ReviewSuggestionItem {
  category:
    | "typo"
    | "punctuation"
    | "grammar"
    | "wording"
    | "sensitive"
    | "structure";
  severity: "error" | "warning" | "info";
  original: string;
  suggestion: string;
  reason: string;
  context: string;
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
  format_stats?: any;
  formatted_file?: string;
}

export async function apiProcessDocument(id: string, processType: string) {
  const res = await api.post<ProcessResult>(`/documents/${id}/process`, {
    process_type: processType,
  });
  return res.data;
}

// ── 导出排版 DOCX ──

export async function apiExportFormattedDocx(
  docId: string,
  paragraphs: any[],
  title: string,
  preset: string = "official",
): Promise<Blob> {
  const resp = await fetch(`/api/v1/documents/${docId}/export-docx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() || ""}`,
    },
    body: JSON.stringify({ paragraphs, title, preset }),
  });
  if (!resp.ok) {
    let detail = "Word 导出失败";
    try {
      const errBody = await resp.json();
      detail = errBody.detail || errBody.message || detail;
    } catch {}
    throw new Error(detail);
  }
  const blob = await resp.blob();
  if (!blob || blob.size === 0) {
    throw new Error("服务端返回空文件，请检查文档内容后重试");
  }
  return blob;
}

// ── 导出排版 PDF ──

export async function apiExportFormattedPdf(
  docId: string,
  paragraphs: any[],
  title: string,
  preset: string = "official",
): Promise<Blob> {
  const resp = await fetch(`/api/v1/documents/${docId}/export-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() || ""}`,
    },
    body: JSON.stringify({ paragraphs, title, preset }),
  });
  if (!resp.ok) {
    // 尝试从 JSON 响应提取错误信息
    let detail = "PDF 导出失败";
    try {
      const errBody = await resp.json();
      detail = errBody.detail || errBody.message || detail;
    } catch {}
    throw new Error(detail);
  }
  // 校验返回的确实是 PDF，而非 JSON 错误
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("application/pdf")) {
    throw new Error("服务端返回非 PDF 格式，请检查 converter 服务状态");
  }
  const blob = await resp.blob();
  if (!blob || blob.size === 0) {
    throw new Error("服务端返回空 PDF，请检查 converter 服务状态");
  }
  return blob;
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

export interface DocVersionDetail extends DocVersion {
  content: string;
}

export async function apiGetDocVersion(docId: string, versionId: string) {
  const res = await api.get<DocVersionDetail>(
    `/documents/${docId}/versions/${versionId}`,
  );
  return res.data;
}

export async function apiRestoreDocVersion(docId: string, versionId: string) {
  const res = await api.post<{ content: string; version_number: number }>(
    `/documents/${docId}/versions/${versionId}/restore`,
  );
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
