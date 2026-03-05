/**
 * 用量统计 API
 */
import { api, downloadRequest } from "./client";

export interface UsageOverview {
  total_calls: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  active_users: number;
  avg_duration_ms: number;
  success_rate: number;
  error_count: number;
}

export interface UsageByTime {
  time: string;
  call_count: number;
  token_count: number;
  input_tokens: number;
  output_tokens: number;
  error_count: number;
}

export interface UsageByFunction {
  function_type: string;
  function_label: string;
  call_count: number;
  token_count: number;
  avg_duration_ms: number;
  error_count: number;
}

export interface UsageByUser {
  user_id: string | null;
  user_display_name: string;
  call_count: number;
  token_count: number;
  avg_duration_ms: number;
  error_count: number;
}

export interface UsageRecordItem {
  id: string;
  user_id: string | null;
  user_display_name: string;
  model_name: string | null;
  function_type: string;
  function_label: string;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  duration_ms: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface UsageAlertItem {
  id: string;
  alert_type: string;
  severity: string;
  user_id: string | null;
  user_display_name: string | null;
  title: string;
  detail: string | null;
  is_read: boolean;
  created_at: string;
}

type DateFilter = { start_date?: string; end_date?: string };

export async function apiGetUsageOverview(filters?: DateFilter) {
  const params: Record<string, string> = {};
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;
  const res = await api.get<UsageOverview>("/usage/overview", params);
  return res.data;
}

export async function apiGetUsageByTime(
  granularity = "day",
  filters?: DateFilter & { function_type?: string },
) {
  const params: Record<string, string> = { granularity };
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;
  if (filters?.function_type) params.function_type = filters.function_type;
  const res = await api.get<UsageByTime[]>("/usage/by-time", params);
  return res.data;
}

export async function apiGetUsageByFunction(filters?: DateFilter) {
  const params: Record<string, string> = {};
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;
  const res = await api.get<UsageByFunction[]>("/usage/by-function", params);
  return res.data;
}

export async function apiGetUsageByUser(
  page = 1,
  pageSize = 20,
  filters?: DateFilter,
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;
  const res = await api.get<{ items: UsageByUser[]; total: number }>(
    "/usage/by-user",
    params,
  );
  return res.data;
}

export async function apiListUsageRecords(
  page = 1,
  pageSize = 20,
  filters?: DateFilter & {
    user_keyword?: string;
    function_type?: string;
    status?: string;
  },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.user_keyword) params.user_keyword = filters.user_keyword;
  if (filters?.function_type) params.function_type = filters.function_type;
  if (filters?.status) params.status = filters.status;
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;
  const res = await api.get<{ items: UsageRecordItem[]; total: number }>(
    "/usage/records",
    params,
  );
  return res.data;
}

export async function apiExportUsage(filters?: DateFilter & {
  function_type?: string;
  user_keyword?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.function_type) params.set("function_type", filters.function_type);
  if (filters?.user_keyword) params.set("user_keyword", filters.user_keyword);
  return downloadRequest(`/usage/export?${params.toString()}`);
}

export async function apiListAlerts(
  page = 1,
  pageSize = 20,
  filters?: { is_read?: boolean; severity?: string },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.is_read !== undefined) params.is_read = String(filters.is_read);
  if (filters?.severity) params.severity = filters.severity;
  const res = await api.get<{ items: UsageAlertItem[]; total: number }>(
    "/usage/alerts",
    params,
  );
  return res.data;
}

export async function apiMarkAlertRead(alertId: string) {
  return api.put(`/usage/alerts/${alertId}/read`);
}

export async function apiMarkAllAlertsRead() {
  return api.put("/usage/alerts/read-all");
}

export async function apiGetUnreadAlertCount() {
  const res = await api.get<{ count: number }>("/usage/alerts/unread-count");
  return res.data;
}
