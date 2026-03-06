/**
 * GovAI API 基础客户端
 * 统一封装 HTTP 请求、Token 管理、超时、重试、错误处理
 */

const API_BASE = "/api/v1";

// ── 请求配置 ──

/** 普通请求超时（30 秒） */
const REQUEST_TIMEOUT_MS = 30_000;
/** 上传请求超时（3 分钟） */
const UPLOAD_TIMEOUT_MS = 180_000;
/** 下载请求超时（2 分钟） */
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** 可重试的最大次数 */
const MAX_RETRIES = 2;
/** 重试基础延迟（毫秒），指数退避 */
const RETRY_BASE_DELAY_MS = 1_000;
/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
/** 可重试的请求方法（仅幂等方法） */
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

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

// ── 401 事件：通知全局 UI 跳转登录 ──

function _emitTokenExpired() {
  clearToken();
  window.dispatchEvent(new CustomEvent("govai:token_expired"));
}

// ── 统一响应类型 ──

export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// ── 带超时的 fetch ──

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeout = init?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`请求超时（${Math.round(timeout / 1000)}s）`);
    }
    // 网络离线检测
    if (!navigator.onLine) {
      throw new Error("网络已断开，请检查网络连接后重试");
    }
    throw new Error(err.message || "网络请求失败，请稍后重试");
  } finally {
    clearTimeout(timer);
  }
}

// ── 带重试的 fetch（仅幂等请求） ──

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
  retries = MAX_RETRIES,
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const canRetry = RETRYABLE_METHODS.has(method);

  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await fetchWithTimeout(input, init);
      // 可重试的服务器错误
      if (canRetry && attempt < retries && RETRYABLE_STATUS.has(resp.status)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[API] ${method} ${typeof input === "string" ? input : ""} → ${resp.status}, 重试 ${attempt + 1}/${retries} (${delay}ms)`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return resp;
    } catch (err: any) {
      // 网络错误可重试
      if (canRetry && attempt < retries && !err.message?.includes("超时")) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[API] 网络错误, 重试 ${attempt + 1}/${retries} (${delay}ms):`,
          err.message,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
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

  const resp = await fetchWithRetry(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (resp.status === 401) {
    _emitTokenExpired();
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

  // 上传不重试（非幂等），但有超时
  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: formData,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

  if (resp.status === 401) {
    _emitTokenExpired();
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
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const method = body ? "POST" : "GET";
  const resp = await fetchWithRetry(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });

  if (resp.status === 401) {
    _emitTokenExpired();
    throw new Error("TOKEN_EXPIRED");
  }
  if (!resp.ok) {
    // 尝试读取 JSON 错误信息
    let detail = `HTTP ${resp.status}`;
    try {
      const errJson = await resp.json();
      detail = errJson.message || errJson.detail || detail;
    } catch {
      // non-JSON body
    }
    throw new Error(`下载失败: ${detail}`);
  }
  return resp.blob();
}

// ── 便捷方法 ──

export const api = {
  get: <T = any>(path: string, params?: Record<string, string>) =>
    request<T>("GET", path, undefined, { params }),
  post: <T = any>(path: string, body?: any) => request<T>("POST", path, body),
  put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body),
  patch: <T = any>(path: string, body?: any) => request<T>("PATCH", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export { API_BASE };
