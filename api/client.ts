/**
 * GovAI API 基础客户端
 * 统一封装 HTTP 请求、Token 管理、错误处理
 */

const API_BASE = "/api/v1";

// ── Token 管理 ──

let _accessToken: string | null = null;

export function setToken(token: string) {
  _accessToken = token;
  localStorage.setItem("govai_token", token);
}

export function getToken(): string | null {
  if (!_accessToken) {
    _accessToken = localStorage.getItem("govai_token");
  }
  return _accessToken;
}

export function clearToken() {
  _accessToken = null;
  localStorage.removeItem("govai_token");
}

// ── 统一响应类型 ──

export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// ── 通用 JSON 请求 ──

export async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  options?: { params?: Record<string, string> },
): Promise<ApiResponse<T>> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const resp = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    clearToken();
    throw new Error("TOKEN_EXPIRED");
  }

  const json = await resp.json();
  if (json.code !== 0) {
    throw new Error(json.message || `请求失败 (code=${json.code})`);
  }
  return json;
}

// ── 文件上传请求（multipart/form-data） ──

export async function uploadRequest<T = any>(
  path: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url, { method: "POST", headers, body: formData });

  if (resp.status === 401) {
    clearToken();
    throw new Error("TOKEN_EXPIRED");
  }

  const json = await resp.json();
  if (json.code !== 0) {
    throw new Error(json.message || `上传失败 (code=${json.code})`);
  }
  return json;
}

// ── 文件下载请求 ──

export async function downloadRequest(path: string, body?: any): Promise<Blob> {
  const url = body ? `${API_BASE}${path}` : `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const resp = await fetch(url, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    clearToken();
    throw new Error("TOKEN_EXPIRED");
  }
  if (!resp.ok) throw new Error(`下载失败 (status=${resp.status})`);
  return resp.blob();
}

// ── 便捷方法 ──

export const api = {
  get: <T = any>(path: string, params?: Record<string, string>) =>
    request<T>("GET", path, undefined, { params }),
  post: <T = any>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export { API_BASE };
