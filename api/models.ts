/**
 * 模型管理 API
 */
import { api } from "./client";

export interface LLMModelItem {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  model_type: string;
  model_type_label: string;
  deployment: string;
  deployment_label: string;
  endpoint_url: string;
  has_api_key: boolean;
  temperature: number;
  max_tokens: number;
  top_p: number;
  top_k: number;
  frequency_penalty: number;
  presence_penalty: number;
  extra_params: Record<string, any> | null;
  is_active: boolean;
  is_default: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
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

export interface LLMModelForm {
  name: string;
  provider: string;
  model_id: string;
  model_type: string;
  deployment: string;
  endpoint_url: string;
  api_key?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  extra_params?: Record<string, any>;
  is_active?: boolean;
  is_default?: boolean;
  description?: string;
}

export async function apiListModels(
  page = 1,
  pageSize = 20,
  filters?: {
    model_type?: string;
    deployment?: string;
    keyword?: string;
    is_active?: boolean;
  },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.model_type) params.model_type = filters.model_type;
  if (filters?.deployment) params.deployment = filters.deployment;
  if (filters?.keyword) params.keyword = filters.keyword;
  if (filters?.is_active !== undefined) params.is_active = String(filters.is_active);

  const res = await api.get<{ items: LLMModelItem[]; total: number }>(
    "/models/list",
    params,
  );
  return res.data;
}

export async function apiGetModel(id: string) {
  const res = await api.get<LLMModelItem>(`/models/${id}`);
  return res.data;
}

export async function apiCreateModel(data: LLMModelForm) {
  const res = await api.post<LLMModelItem>("/models/create", data);
  return res.data;
}

export async function apiUpdateModel(id: string, data: Partial<LLMModelForm>) {
  const res = await api.put<LLMModelItem>(`/models/${id}`, data);
  return res.data;
}

export async function apiDeleteModel(id: string) {
  return api.delete(`/models/${id}`);
}

export async function apiTestModelConnection(id: string) {
  const res = await api.post<{ status: string; response_time_ms?: number }>(
    `/models/${id}/test`,
  );
  return res.data;
}

export async function apiGetParamInfo() {
  const res = await api.get<ParamInfo[]>("/models/meta/param-info");
  return res.data;
}
