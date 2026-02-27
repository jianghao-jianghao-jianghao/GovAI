import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  AlertOctagon,
  Edit3,
  Trash2,
  Shield,
  Plus,
  Check,
  ChevronDown,
  Folder,
  Loader2,
} from "lucide-react";
import {
  apiListUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiListRoles,
  apiCreateRole,
  apiUpdateRole,
  apiDeleteRole,
  apiListCollections,
  type UserListItem,
  type RoleItem,
  type KBCollection,
} from "../api";
import { PERMISSION_META } from "../constants";
import { Modal } from "../components/ui";

export const UserManagementView = ({
  toast,
  currentUser,
}: {
  toast: any;
  currentUser: any;
}) => {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [kbCols, setKbCols] = useState<KBCollection[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const data = await apiListUsers(1, 100);
      setUsers(data.items);
    } catch (err: any) {
      toast.error("加载用户失败: " + err.message);
    }
  };
  const loadRoles = async () => {
    try {
      const data = await apiListRoles();
      setRoles(data);
    } catch (err: any) {
      toast.error("加载角色失败: " + err.message);
    }
  };
  const loadKbCols = async () => {
    try {
      const data = await apiListCollections();
      setKbCols(data);
    } catch {
      /* 非关键 */
    }
  };

  useEffect(() => {
    Promise.all([loadUsers(), loadRoles(), loadKbCols()]).finally(() =>
      setLoading(false),
    );
  }, []);

  /* ── 角色 ── */
  const handleSaveRole = async (role: any) => {
    if (!role.name) return toast.error("角色名称不能为空");
    try {
      if (role.id) {
        await apiUpdateRole(role.id, {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        });
      } else {
        await apiCreateRole({
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        });
      }
      await loadRoles();
      setEditingRole(null);
      toast.success("角色已保存");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const handleDeleteRole = async (id: string) => {
    if (!confirm("确定删除此角色吗？")) return;
    try {
      await apiDeleteRole(id);
      await loadRoles();
      toast.success("角色已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* ── 用户 ── */
  const handleSaveUser = async (user: any) => {
    if (!user.username || !user.role_id || !user.display_name)
      return toast.error("用户名、姓名和角色必填");
    try {
      if (user.id) {
        const body: any = {
          display_name: user.display_name,
          department: user.department,
          role_id: user.role_id,
          status: user.status,
          phone: user.phone,
          email: user.email,
        };
        if (user.password) body.password = user.password;
        await apiUpdateUser(user.id, body);
      } else {
        if (!user.password) return toast.error("新用户必须设置密码");
        await apiCreateUser({
          username: user.username,
          password: user.password,
          display_name: user.display_name,
          department: user.department,
          role_id: user.role_id,
          status: user.status,
          phone: user.phone,
          email: user.email,
        });
      }
      await loadUsers();
      setEditingUser(null);
      toast.success("用户已保存");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) return toast.error("无法删除当前登录用户");
    if (!confirm("确定删除此用户？")) return;
    try {
      await apiDeleteUser(id);
      await loadUsers();
      toast.success("用户已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* ── 角色编辑器 ── */
  const RoleEditor = ({
    role,
    onSave,
    onCancel,
  }: {
    role: any;
    onSave: (r: any) => void;
    onCancel: () => void;
  }) => {
    const isSystem = !!role?.is_system;
    const [formData, setFormData] = useState(
      role || { name: "", description: "", permissions: [] },
    );
    const [expandedScope, setExpandedScope] = useState<string | null>(null);

    const togglePerm = (key: string) => {
      if (isSystem) return;
      const s = new Set(formData.permissions);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      setFormData({ ...formData, permissions: Array.from(s) });
    };
    const toggleScopeSpecific = (scopeType: string, colId: string) => {
      togglePerm(`res:kb:${scopeType}:${colId}`);
    };
    const setScopeAll = (
      scopeType: string,
      itemKey: string,
      isAll: boolean,
    ) => {
      if (isSystem) return;
      let newPerms = formData.permissions.filter(
        (p: string) => !p.startsWith(`res:kb:${scopeType}:`),
      );
      if (isAll) {
        if (!newPerms.includes(itemKey)) newPerms.push(itemKey);
      } else {
        newPerms = newPerms.filter((p: string) => p !== itemKey);
      }
      setFormData({ ...formData, permissions: newPerms });
    };

    return (
      <Modal
        title={isSystem ? `查看角色：${formData.name}` : (role ? "编辑角色" : "新建角色")}
        onClose={onCancel}
        size="lg"
        footer={
          isSystem ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              关闭
            </button>
          ) : (
            <button
              onClick={() => onSave(formData)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              保存配置
            </button>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">角色名称</label>
              <input
                className="w-full border rounded p-2"
                value={formData.name}
                disabled={isSystem}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <input
                className="w-full border rounded p-2"
                value={formData.description || ""}
                disabled={isSystem}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="font-bold text-gray-700 mb-3 flex items-center">
              <Shield size={16} className="mr-2" /> 权限配置
              {isSystem && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  系统内置角色默认拥有所有权限
                </span>
              )}
            </h4>
            <div className="space-y-6">
              {PERMISSION_META.map((group) => (
                <div key={group.group}>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
                    {group.group}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.items.map((p) => {
                      const isScoped = !!(p as any).scopeType;
                      const scopeType = (p as any).scopeType;
                      const isGlobalChecked = isSystem || formData.permissions.includes(
                        p.key,
                      );
                      const hasSpecific =
                        !isGlobalChecked &&
                        formData.permissions.some((perm: string) =>
                          perm.startsWith(`res:kb:${scopeType}:`),
                        );
                      const isEffective = isGlobalChecked || hasSpecific;
                      return (
                        <div
                          key={p.key}
                          className={`border rounded transition-all ${isEffective ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"} ${expandedScope === p.key ? "col-span-2" : ""}`}
                        >
                          <div
                            className="p-3 flex items-start cursor-pointer"
                            onClick={() => {
                              if (isScoped) {
                                if (expandedScope === p.key)
                                  setExpandedScope(null);
                                else {
                                  if (!isEffective)
                                    setScopeAll(scopeType, p.key, true);
                                  setExpandedScope(p.key);
                                }
                              } else {
                                togglePerm(p.key);
                              }
                            }}
                          >
                            <div
                              className={`mt-0.5 w-4 h-4 border rounded mr-3 flex items-center justify-center shrink-0 ${isEffective ? "bg-blue-600 border-blue-600" : "bg-white border-gray-300"}`}
                            >
                              {isEffective && (
                                <Check size={12} className="text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {p.label}
                                </div>
                                {isScoped && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedScope(
                                        expandedScope === p.key ? null : p.key,
                                      );
                                    }}
                                    className={`p-1 rounded hover:bg-blue-100 text-blue-600 transition-transform ${expandedScope === p.key ? "rotate-180" : ""}`}
                                  >
                                    <ChevronDown size={16} />
                                  </button>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {p.desc}
                              </div>
                              {isScoped && isEffective && (
                                <div className="text-[10px] mt-1 text-blue-600 font-medium">
                                  {isGlobalChecked
                                    ? "当前：全部知识库 (Global)"
                                    : `当前：指定 ${formData.permissions.filter((perm: string) => perm.startsWith(`res:kb:${scopeType}:`)).length} 个知识库`}
                                </div>
                              )}
                            </div>
                          </div>
                          {isScoped && expandedScope === p.key && (
                            <div className="p-3 border-t bg-white/50 animate-in slide-in-from-top-1">
                              <div className="flex gap-4 mb-3 text-xs">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`scope_${p.key}`}
                                    className="mr-1.5"
                                    checked={isGlobalChecked}
                                    onChange={() =>
                                      setScopeAll(scopeType, p.key, true)
                                    }
                                  />
                                  全部知识库 (Global)
                                </label>
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`scope_${p.key}`}
                                    className="mr-1.5"
                                    checked={!isGlobalChecked}
                                    onChange={() =>
                                      setScopeAll(scopeType, p.key, false)
                                    }
                                  />
                                  指定知识库 (Specific)
                                </label>
                              </div>
                              {!isGlobalChecked && (
                                <div className="space-y-1 pl-1 max-h-40 overflow-y-auto border-t border-dashed pt-2">
                                  {kbCols.map((col) => {
                                    const specificKey = `res:kb:${scopeType}:${col.id}`;
                                    const checked =
                                      formData.permissions.includes(
                                        specificKey,
                                      );
                                    return (
                                      <label
                                        key={col.id}
                                        className="flex items-center text-xs text-gray-700 hover:bg-gray-100 p-1.5 rounded cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          className="mr-2 rounded border-gray-300"
                                          checked={checked}
                                          onChange={() =>
                                            toggleScopeSpecific(
                                              scopeType,
                                              col.id,
                                            )
                                          }
                                        />
                                        <Folder
                                          size={12}
                                          className="mr-1.5 text-gray-400"
                                        />
                                        {col.name}
                                      </label>
                                    );
                                  })}
                                  {kbCols.length === 0 && (
                                    <div className="text-gray-400 text-[10px] italic">
                                      暂无知识库可配置
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  /* ── 用户编辑器 ── */
  const UserEditor = ({
    user,
    onSave,
    onCancel,
  }: {
    user: any;
    onSave: (u: any) => void;
    onCancel: () => void;
  }) => {
    const [formData, setFormData] = useState(
      user
        ? {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            department: user.department || "",
            role_id: user.role_id,
            status: user.status,
            password: "",
            phone: user.phone || "",
            email: user.email || "",
          }
        : {
            username: "",
            display_name: "",
            department: "",
            role_id: roles[0]?.id || "",
            status: "active",
            password: "",
            phone: "",
            email: "",
          },
    );
    return (
      <Modal
        title={user ? "编辑用户" : "新建用户"}
        onClose={onCancel}
        footer={
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存用户
          </button>
        }
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">
              基本信息
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  用户名*
                </label>
                <input
                  className="w-full border rounded p-2 bg-gray-50 text-sm"
                  value={formData.username}
                  disabled={!!user}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  placeholder="登录账号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  真实姓名*
                </label>
                <input
                  className="w-full border rounded p-2 text-sm"
                  value={formData.display_name}
                  onChange={(e) =>
                    setFormData({ ...formData, display_name: e.target.value })
                  }
                  placeholder="员工姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">部门</label>
                <input
                  className="w-full border rounded p-2 text-sm"
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  placeholder="所属部门"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  分配角色*
                </label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={formData.role_id}
                  onChange={(e) =>
                    setFormData({ ...formData, role_id: e.target.value })
                  }
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  账号状态
                </label>
                <select
                  className="w-full border rounded p-2 text-sm"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                >
                  <option value="active">正常启用</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">
              安全设置
            </h4>
            <div>
              <label className="block text-sm font-medium mb-1">
                {user ? "重置密码 (留空则不修改)" : "登录密码*"}
              </label>
              <input
                type="password"
                className="w-full border rounded p-2 text-sm"
                value={formData.password || ""}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder={user ? "******" : "设置登录密码"}
              />
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">
              联系方式
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  手机号码
                </label>
                <input
                  className="w-full border rounded p-2 text-sm"
                  value={formData.phone || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="11位手机号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  电子邮箱
                </label>
                <input
                  className="w-full border rounded p-2 text-sm"
                  value={formData.email || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="工作邮箱"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 border-b flex items-center justify-between h-16 bg-gray-50">
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-lg">
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === "users" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            用户管理
          </button>
          <button
            onClick={() => setTab("roles")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === "roles" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            角色与权限 (RBAC)
          </button>
        </div>
        <button
          onClick={() =>
            tab === "users"
              ? setEditingUser({})
              : setEditingRole({ permissions: [] })
          }
          className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center hover:bg-blue-700 shadow-sm"
        >
          <Plus size={18} className="mr-2" />{" "}
          {tab === "users" ? "新增用户" : "新增角色"}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {tab === "users" ? (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="p-4">用户</th>
                <th className="p-4">角色</th>
                <th className="p-4">部门</th>
                <th className="p-4">联系方式</th>
                <th className="p-4">状态</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium text-gray-900">
                        {u.display_name}
                      </div>
                      <div className="text-xs text-gray-500">@{u.username}</div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">
                        {u.role_name || "未分配"}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{u.department}</td>
                    <td className="p-4 text-gray-500 text-xs">
                      <div>
                        <span className="opacity-70 mr-1">Tel:</span>
                        {u.phone || "-"}
                      </div>
                      <div>
                        <span className="opacity-70 mr-1">Mail:</span>
                        {u.email || "-"}
                      </div>
                    </td>
                    <td className="p-4">
                      {u.status === "active" ? (
                        <span className="text-green-600 flex items-center text-xs">
                          <CheckCircle size={12} className="mr-1" /> 正常
                        </span>
                      ) : (
                        <span className="text-gray-400 flex items-center text-xs">
                          <AlertOctagon size={12} className="mr-1" /> 禁用
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="text-red-500 hover:underline"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {roles.map((r) => (
              <div
                key={r.id}
                className="border rounded-xl p-5 hover:shadow-md transition-shadow bg-white flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">
                      {r.name}
                    </h3>
                    <p className="text-sm text-gray-500">{r.description}</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEditingRole(r)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded hover:text-blue-600"
                    >
                      <Edit3 size={16} />
                    </button>
                    {!r.is_system && (
                      <button
                        onClick={() => handleDeleteRole(r.id)}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2">
                    已获授权 {r.is_system ? '(全部权限)' : `(${r.permissions.length})`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.is_system ? (
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded border border-amber-200 font-medium">
                        系统内置角色 · 自动拥有全部权限
                      </span>
                    ) : (
                    <>
                    {r.permissions.slice(0, 8).map((pk) => {
                      let label = pk;
                      PERMISSION_META.forEach((g) =>
                        g.items.forEach((i) => {
                          if (i.key === pk) label = i.label;
                        }),
                      );
                      return (
                        <span
                          key={pk}
                          className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200"
                        >
                          {label}
                        </span>
                      );
                    })}
                    {r.permissions.length > 8 && (
                      <span className="px-2 py-1 bg-gray-50 text-gray-400 text-xs rounded">
                        +{r.permissions.length - 8} 更多...
                      </span>
                    )}
                    </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editingUser && (
        <UserEditor
          user={editingUser.id ? editingUser : null}
          onSave={handleSaveUser}
          onCancel={() => setEditingUser(null)}
        />
      )}
      {editingRole && (
        <RoleEditor
          role={editingRole.id ? editingRole : null}
          onSave={handleSaveRole}
          onCancel={() => setEditingRole(null)}
        />
      )}
    </div>
  );
};
