/**
 * 认证相关 API
 */
import { api, setToken, clearToken } from "./client";

// ── 后端用户类型 ──

export interface BackendUser {
  id: string;
  username: string;
  display_name: string;
  department: string;
  role_id: string;
  role_name: string;
  status: string;
  phone: string;
  email: string;
  permissions: string[];
  last_login_at: string;
}

// ── 前端标准化用户类型（兼容原有 UI 字段） ──

export interface AppUser {
  id: string;
  username: string;
  name: string;
  department: string;
  roleId: string;
  roleName: string;
  status: string;
  phone: string;
  email: string;
  permissions: string[];
  lastLoginAt?: string;
}

/** 后端字段 → 前端字段映射 */
export function normalizeUser(u: BackendUser): AppUser {
  return {
    id: u.id,
    username: u.username,
    name: u.display_name,
    department: u.department || "",
    roleId: u.role_id,
    roleName: u.role_name || "",
    status: u.status,
    phone: u.phone || "",
    email: u.email || "",
    permissions: u.permissions || [],
    lastLoginAt: u.last_login_at,
  };
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: BackendUser;
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<{ token: string; user: AppUser }> {
  const res = await api.post<LoginResponse>("/auth/login", {
    username,
    password,
  });
  setToken(res.data.access_token);
  return { token: res.data.access_token, user: normalizeUser(res.data.user) };
}

export async function apiLogout() {
  try {
    await api.post("/auth/logout");
  } catch {
    /* ignore */
  }
  clearToken();
}

export async function apiGetProfile(): Promise<AppUser> {
  const res = await api.get<BackendUser>("/auth/profile");
  return normalizeUser(res.data);
}

export async function apiRefreshToken(): Promise<string> {
  const res = await api.post<{ access_token: string }>("/auth/refresh");
  setToken(res.data.access_token);
  return res.data.access_token;
}
