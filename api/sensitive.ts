/**
 * 敏感词规则 API
 */
import { api } from "./client";

export interface SensitiveRule {
  id: string;
  keyword: string;
  action: string;
  level: string;
  note: string;
  is_active: boolean;
  created_at: string;
}

export async function apiListRules(filters?: {
  action?: string;
  is_active?: boolean;
}) {
  const params: Record<string, string> = {};
  if (filters?.action) params.action = filters.action;
  if (filters?.is_active !== undefined)
    params.is_active = String(filters.is_active);

  const res = await api.get<SensitiveRule[]>("/rules", params);
  return res.data;
}

export async function apiCreateRule(body: {
  keyword: string;
  action: string;
  level: string;
  note?: string;
}) {
  const res = await api.post<{ id: string }>("/rules", body);
  return res.data;
}

export async function apiUpdateRule(
  id: string,
  body: {
    keyword?: string;
    action?: string;
    level?: string;
    note?: string;
    is_active?: boolean;
  },
) {
  await api.put(`/rules/${id}`, body);
}

export async function apiDeleteRule(id: string) {
  await api.delete(`/rules/${id}`);
}

export async function apiCheckSensitive(text: string) {
  const res = await api.post<{
    passed: boolean;
    hits: {
      keyword: string;
      action: string;
      level: string;
      note: string;
    }[];
  }>("/rules/check", { text });
  return res.data;
}
