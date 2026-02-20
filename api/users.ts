/**
 * 用户管理 + 角色管理 API
 */
import { api } from "./client";

// ── 用户 ──

export interface UserListItem {
  id: string;
  username: string;
  display_name: string;
  department: string;
  role_id: string;
  role_name: string;
  status: string;
  phone: string;
  email: string;
  created_at: string;
  last_login_at?: string;
}

export async function apiListUsers(
  page = 1,
  pageSize = 100,
  filters?: { keyword?: string; status?: string; role_id?: string },
) {
  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (filters?.keyword) params.keyword = filters.keyword;
  if (filters?.status) params.status = filters.status;
  if (filters?.role_id) params.role_id = filters.role_id;

  const res = await api.get<{ items: UserListItem[]; total: number }>(
    "/users",
    params,
  );
  return res.data;
}

export async function apiCreateUser(body: {
  username: string;
  password: string;
  display_name: string;
  department?: string;
  role_id: string;
  status?: string;
  phone?: string;
  email?: string;
}) {
  const res = await api.post<{ id: string }>("/users", body);
  return res.data;
}

export async function apiUpdateUser(
  id: string,
  body: {
    display_name?: string;
    department?: string;
    role_id?: string;
    status?: string;
    phone?: string;
    email?: string;
    password?: string;
  },
) {
  await api.put(`/users/${id}`, body);
}

export async function apiDeleteUser(id: string) {
  await api.delete(`/users/${id}`);
}

// ── 角色 ──

export interface RoleItem {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
  user_count: number;
  created_at: string;
}

export async function apiListRoles(): Promise<RoleItem[]> {
  const res = await api.get<RoleItem[]>("/roles");
  return res.data;
}

export async function apiCreateRole(body: {
  name: string;
  description?: string;
  permissions: string[];
}) {
  const res = await api.post<{ id: string }>("/roles", body);
  return res.data;
}

export async function apiUpdateRole(
  id: string,
  body: {
    name?: string;
    description?: string;
    permissions?: string[];
  },
) {
  await api.put(`/roles/${id}`, body);
}

export async function apiDeleteRole(id: string) {
  await api.delete(`/roles/${id}`);
}
