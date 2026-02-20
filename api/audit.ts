/**
 * 审计日志 API
 */
import { api, downloadRequest } from "./client";

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  user_display_name: string;
  action: string;
  module: string;
  detail: string;
  ip_address: string | null;
  created_at: string;
}

export async function apiListAuditLogs(
  page = 1,
  pageSize = 50,
  filters?: {
    user_keyword?: string;
    module?: string;
    action?: string;
    start_date?: string;
    end_date?: string;
  },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.user_keyword) params.user_keyword = filters.user_keyword;
  if (filters?.module) params.module = filters.module;
  if (filters?.action) params.action = filters.action;
  if (filters?.start_date) params.start_date = filters.start_date;
  if (filters?.end_date) params.end_date = filters.end_date;

  const res = await api.get<{ items: AuditLogItem[]; total: number }>(
    "/audit/logs",
    params,
  );
  return res.data;
}

export async function apiExportAuditLogs(filters?: {
  user_keyword?: string;
  module?: string;
  start_date?: string;
  end_date?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.user_keyword) params.set("user_keyword", filters.user_keyword);
  if (filters?.module) params.set("module", filters.module);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);

  return downloadRequest(`/audit/logs/export?${params.toString()}`);
}
