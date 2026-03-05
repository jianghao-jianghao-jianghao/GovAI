/**
 * Dify AI 服务配置 API
 */
import { api } from "./client";

/* ── 类型定义 ── */
export interface DifyAppItem {
  key: string;
  name: string;
  description: string;
  category: string;
  category_label: string;
  is_configured: boolean;
  has_api_key: boolean;
}

export interface DifyAppListResult {
  items: DifyAppItem[];
  total: number;
  configured_count: number;
  dify_base_url: string;
  dify_mock: boolean;
}

export interface DifyTestResult {
  status: string;
  response_time_ms?: number;
  message?: string;
}

export interface DifyTestAllItem {
  key: string;
  name: string;
  status: "ok" | "error" | "not_configured";
  response_time_ms?: number;
  message: string;
}

export interface DifyTestAllResult {
  results: DifyTestAllItem[];
  ok_count: number;
  total_configured: number;
  total: number;
}

export interface ParamInfo {
  key: string;
  label: string;
  description: string;
  type: "float" | "integer";
  min: number;
  max: number;
  step: number;
  default: number;
  recommended: number;
  tips: string;
}

/* ── API 调用 ── */
export async function apiListDifyApps() {
  const res = await api.get<DifyAppListResult>("/models/list");
  return res.data;
}

export async function apiTestDifyApp(appKey: string) {
  const res = await api.post<DifyTestResult>(`/models/${appKey}/test`);
  return res.data;
}

export async function apiTestAllDifyApps() {
  const res = await api.post<DifyTestAllResult>("/models/test-all");
  return res.data;
}

export async function apiGetParamInfo() {
  const res = await api.get<ParamInfo[]>("/models/meta/param-info");
  return res.data;
}
