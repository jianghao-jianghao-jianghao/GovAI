/**
 * 公文格式处理 API
 * 对接后端 /api/v1/docformat/* 端点
 */

import { api, getToken, ApiResponse } from "./client";

const API_BASE = "/api/v1";

// ==================== 类型定义 ====================

export interface PresetInfo {
  key: string;
  name: string;
  description: string;
  is_builtin?: boolean;
}

export interface PresetDetail {
  key: string;
  name: string;
  page?: { top: number; bottom: number; left: number; right: number };
  title?: ElementFormat;
  recipient?: ElementFormat;
  heading1?: ElementFormat;
  heading2?: ElementFormat;
  heading3?: ElementFormat;
  heading4?: ElementFormat;
  heading5?: ElementFormat;
  body?: ElementFormat;
  signature?: ElementFormat;
  date?: ElementFormat;
  attachment?: ElementFormat;
  closing?: ElementFormat;
  table?: Record<string, any>;
  first_line_bold?: boolean;
  page_number?: boolean;
  page_number_font?: string;
}

export interface ElementFormat {
  font_cn: string;
  font_en: string;
  size: number;
  bold: boolean;
  italic?: boolean;
  align: string;
  indent: number;
  line_spacing?: number;
  space_before?: number;
  space_after?: number;
}

export interface AnalysisResult {
  punctuation: Array<{ para: number; type: string; char: string }>;
  numbering: Array<{ type: string; detail?: string }>;
  paragraph: Array<{ type: string; paras?: number[]; detail?: string }>;
  font: Array<{ type: string; detail?: string }>;
  summary: {
    total_issues: number;
    suggestions: string[];
  };
}

export interface FormatStats {
  [paraType: string]: number;
}

export interface SmartFormatStats {
  analysis: { total_issues: number; suggestions: string[] };
  punctuation: { paragraphs_fixed: number; table_cells_fixed: number };
  format: FormatStats;
}

// ── AI 排版流式回调 ──

export interface AiFormatStreamCallbacks {
  onTextChunk?: (text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

// ==================== API 函数 ====================

/** 获取所有可用预设 */
export async function apiListPresets(): Promise<PresetInfo[]> {
  const res = await api.get<PresetInfo[]>("/docformat/presets");
  return res.data;
}

/** 获取预设详细配置 */
export async function apiGetPresetDetail(
  presetName: string,
): Promise<PresetDetail> {
  const res = await api.get<PresetDetail>(`/docformat/presets/${presetName}`);
  return res.data;
}

/** 格式诊断：上传 .docx 返回分析结果 */
export async function apiAnalyzeFormat(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const url = `${API_BASE}/docformat/analyze`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers, body: formData });
  const json = await resp.json();
  if (json.code !== 0) throw new Error(json.message || "格式诊断失败");
  return json.data;
}

/** 格式化文档：上传 .docx 返回格式化后的 Blob + stats */
export async function apiFormatDocument(
  file: File,
  preset: string = "official",
  customPreset?: Record<string, any>,
): Promise<{ blob: Blob; stats: FormatStats; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("preset", preset);
  if (customPreset) {
    formData.append("custom_preset", JSON.stringify(customPreset));
  }

  const url = `${API_BASE}/docformat/format`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers, body: formData });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    throw new Error(json?.message || `格式化失败 (${resp.status})`);
  }

  // 解析统计信息 header
  let stats: FormatStats = {};
  const statsHeader = resp.headers.get("X-Format-Stats");
  if (statsHeader) {
    try {
      stats = JSON.parse(statsHeader);
    } catch {
      /* ignore */
    }
  }

  // 解析文件名
  const disposition = resp.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(
    /filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i,
  );
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : "formatted.docx";

  const blob = await resp.blob();
  return { blob, stats, filename };
}

/** 标点修复：上传 .docx 返回修复后的 Blob */
export async function apiFixPunctuation(file: File): Promise<{
  blob: Blob;
  stats: { paragraphs_fixed: number; table_cells_fixed: number };
  filename: string;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const url = `${API_BASE}/docformat/fix-punctuation`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers, body: formData });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    throw new Error(json?.message || `标点修复失败 (${resp.status})`);
  }

  let stats = { paragraphs_fixed: 0, table_cells_fixed: 0 };
  const statsHeader = resp.headers.get("X-Punctuation-Stats");
  if (statsHeader) {
    try {
      stats = JSON.parse(statsHeader);
    } catch {
      /* ignore */
    }
  }

  const disposition = resp.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(
    /filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i,
  );
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : "punct_fixed.docx";

  const blob = await resp.blob();
  return { blob, stats, filename };
}

/** 智能格式化：诊断 + 标点 + 格式化，返回 Blob + 统计 */
export async function apiSmartFormat(
  file: File,
  preset: string = "official",
  customPreset?: Record<string, any>,
  fixPunct: boolean = true,
): Promise<{ blob: Blob; stats: SmartFormatStats; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("preset", preset);
  formData.append("fix_punct", String(fixPunct));
  if (customPreset) {
    formData.append("custom_preset", JSON.stringify(customPreset));
  }

  const url = `${API_BASE}/docformat/smart-format`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers, body: formData });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    throw new Error(json?.message || `智能格式化失败 (${resp.status})`);
  }

  let stats: SmartFormatStats = {
    analysis: { total_issues: 0, suggestions: [] },
    punctuation: { paragraphs_fixed: 0, table_cells_fixed: 0 },
    format: {},
  };
  const statsHeader = resp.headers.get("X-Smart-Format-Stats");
  if (statsHeader) {
    try {
      stats = JSON.parse(statsHeader);
    } catch {
      /* ignore */
    }
  }

  const disposition = resp.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(
    /filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i,
  );
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : "smart_formatted.docx";

  const blob = await resp.blob();
  return { blob, stats, filename };
}

// ==================== 按文档 ID 操作 ====================

/** 按文档 ID 格式诊断 */
export async function apiAnalyzeDocById(
  docId: string,
): Promise<AnalysisResult> {
  const url = `${API_BASE}/docformat/by-doc/${docId}/analyze`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers });
  const json = await resp.json();
  if (json.code !== 0) throw new Error(json.message || "格式诊断失败");
  return json.data;
}

/** 按文档 ID 智能格式化 */
export async function apiSmartFormatDocById(
  docId: string,
  preset: string = "official",
  customPreset?: Record<string, any>,
  fixPunct: boolean = true,
): Promise<{ blob: Blob; stats: SmartFormatStats; filename: string }> {
  const params = new URLSearchParams({ preset, fix_punct: String(fixPunct) });

  const url = `${API_BASE}/docformat/by-doc/${docId}/smart-format?${params}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: customPreset
      ? JSON.stringify({ custom_preset: customPreset })
      : undefined,
  });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    throw new Error(json?.message || `智能格式化失败 (${resp.status})`);
  }

  let stats: SmartFormatStats = {
    analysis: { total_issues: 0, suggestions: [] },
    punctuation: { paragraphs_fixed: 0, table_cells_fixed: 0 },
    format: {},
  };
  const statsHeader = resp.headers.get("X-Smart-Format-Stats");
  if (statsHeader) {
    try {
      stats = JSON.parse(statsHeader);
    } catch {
      /* ignore */
    }
  }

  const disposition = resp.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(
    /filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i,
  );
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : "smart_formatted.docx";

  const blob = await resp.blob();
  return { blob, stats, filename };
}

/** 按文档 ID 标点修复 */
export async function apiFixPunctuationDocById(docId: string): Promise<{
  blob: Blob;
  stats: { paragraphs_fixed: number; table_cells_fixed: number };
  filename: string;
}> {
  const url = `${API_BASE}/docformat/by-doc/${docId}/fix-punctuation`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    throw new Error(json?.message || `标点修复失败 (${resp.status})`);
  }

  let stats = { paragraphs_fixed: 0, table_cells_fixed: 0 };
  const statsHeader = resp.headers.get("X-Punctuation-Stats");
  if (statsHeader) {
    try {
      stats = JSON.parse(statsHeader);
    } catch {
      /* ignore */
    }
  }

  const disposition = resp.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(
    /filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i,
  );
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1])
    : "punct_fixed.docx";

  const blob = await resp.blob();
  return { blob, stats, filename };
}

// ==================== 预设 CRUD ====================

/** 创建自定义预设 */
export async function apiCreatePreset(
  key: string,
  data: Record<string, any>,
): Promise<PresetDetail> {
  const res = await api.post<PresetDetail>("/docformat/presets", {
    key,
    ...data,
  });
  return res.data;
}

/** 更新自定义预设 */
export async function apiUpdatePreset(
  key: string,
  data: Record<string, any>,
): Promise<PresetDetail> {
  const res = await api.put<PresetDetail>(`/docformat/presets/${key}`, data);
  return res.data;
}

/** 删除自定义预设 */
export async function apiDeletePreset(key: string): Promise<void> {
  await api.delete(`/docformat/presets/${key}`);
}

// ==================== AI 智能排版（流式） ====================

/**
 * 按文档 ID 调用 AI 智能排版（SSE 流式输出 Markdown）
 *
 * AI 将文档文本转化为结构化 Markdown，通过 SSE 流式返回，
 * 前端在 📄 公文预览 区域实时渲染。
 */
export async function apiAiFormatStream(
  docId: string,
  docType: string = "official",
  callbacks?: AiFormatStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ doc_type: docType });
  const url = `${API_BASE}/docformat/by-doc/${docId}/ai-format?${params}`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    signal: abortSignal,
  });

  // 非 SSE 响应 → JSON 错误
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await resp.json();
    callbacks?.onError?.(json.message || "AI排版失败");
    return;
  }

  if (!resp.ok) {
    callbacks?.onError?.(`AI排版请求失败 (${resp.status})`);
    return;
  }

  if (!resp.body) {
    callbacks?.onError?.("浏览器不支持流式响应");
    return;
  }

  // SSE 流式解析
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          try {
            const data = JSON.parse(dataStr);
            switch (currentEvent) {
              case "text_chunk":
                callbacks?.onTextChunk?.(data.text || "");
                break;
              case "message_end":
                callbacks?.onEnd?.();
                return;
              case "error":
                callbacks?.onError?.(data.message || "AI排版错误");
                return;
            }
          } catch {
            /* skip parse error */
          }
        }
      }
    }
    // 流正常结束
    callbacks?.onEnd?.();
  } catch (err: any) {
    if (err.name === "AbortError") return;
    callbacks?.onError?.(err.message || "流式传输中断");
  }
}

/** 下载 Blob 文件 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== AI 格式诊断（流式） ====================

/**
 * 按文档 ID 调用 AI 格式诊断（SSE 流式输出 Markdown 诊断报告）
 */
export async function apiAiDiagnoseStream(
  docId: string,
  callbacks?: AiFormatStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE}/docformat/by-doc/${docId}/ai-diagnose`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    signal: abortSignal,
  });

  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await resp.json();
    callbacks?.onError?.(json.message || "格式诊断失败");
    return;
  }

  if (!resp.ok) {
    callbacks?.onError?.(`格式诊断请求失败 (${resp.status})`);
    return;
  }

  if (!resp.body) {
    callbacks?.onError?.("浏览器不支持流式响应");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          try {
            const data = JSON.parse(dataStr);
            switch (currentEvent) {
              case "text_chunk":
                callbacks?.onTextChunk?.(data.text || "");
                break;
              case "message_end":
                callbacks?.onEnd?.();
                return;
              case "error":
                callbacks?.onError?.(data.message || "格式诊断错误");
                return;
            }
          } catch {
            /* skip parse error */
          }
        }
      }
    }
    callbacks?.onEnd?.();
  } catch (err: any) {
    if (err.name === "AbortError") return;
    callbacks?.onError?.(err.message || "流式传输中断");
  }
}

// ==================== AI 标点修复（流式） ====================

/**
 * 按文档 ID 调用 AI 标点修复（SSE 流式输出修正后的 Markdown 文本）
 */
export async function apiAiPunctFixStream(
  docId: string,
  callbacks?: AiFormatStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE}/docformat/by-doc/${docId}/ai-punct-fix`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    signal: abortSignal,
  });

  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await resp.json();
    callbacks?.onError?.(json.message || "标点修复失败");
    return;
  }

  if (!resp.ok) {
    callbacks?.onError?.(`标点修复请求失败 (${resp.status})`);
    return;
  }

  if (!resp.body) {
    callbacks?.onError?.("浏览器不支持流式响应");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          try {
            const data = JSON.parse(dataStr);
            switch (currentEvent) {
              case "text_chunk":
                callbacks?.onTextChunk?.(data.text || "");
                break;
              case "message_end":
                callbacks?.onEnd?.();
                return;
              case "error":
                callbacks?.onError?.(data.message || "标点修复错误");
                return;
            }
          } catch {
            /* skip parse error */
          }
        }
      }
    }
    callbacks?.onEnd?.();
  } catch (err: any) {
    if (err.name === "AbortError") return;
    callbacks?.onError?.(err.message || "流式传输中断");
  }
}
