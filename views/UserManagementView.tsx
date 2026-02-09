
import React, { useState } from 'react';
import { 
  CheckCircle, AlertOctagon, Edit3, Trash2, Shield, Plus,
  Check, ChevronDown, Folder
} from 'lucide-react';
import { db } from '../db';
import { PERMISSION_META } from '../constants';
import { Modal } from '../components/ui';

export const UserManagementView = ({ toast }) => {
    const [tab, setTab] = useState('users');
    const [users, setUsers] = useState(db.data.users);
    const [roles, setRoles] = useState(db.data.roles);
    const [editingUser, setEditingUser] = useState(null);
    const [editingRole, setEditingRole] = useState(null);

    const refreshData = () => { setUsers([...db.data.users]); setRoles([...db.data.roles]); };
    const handleSaveRole = (role) => {
        if (!role.name) return toast.error("角色名称不能为空");
        let newRoles = [...db.data.roles];
        if (role.id) { const idx = newRoles.findIndex(r => r.id === role.id); if (idx >= 0) newRoles[idx] = role; } else { role.id = `role_${Date.now()}`; newRoles.push(role); }
        db.data.roles = newRoles; db.save(); refreshData(); setEditingRole(null); toast.success("角色已保存"); db.logAudit(db.getCurrentUser().id, db.getCurrentUser().username, '保存角色', 'System', role.name);
    };
    const handleDeleteRole = (id) => { if (db.data.users.some(u => u.roleId === id)) return toast.error("无法删除：仍有用户关联此角色"); if (confirm("确定删除此角色吗？")) { db.data.roles = db.data.roles.filter(r => r.id !== id); db.save(); refreshData(); toast.success("角色已删除"); } };
    
    const handleSaveUser = (user) => {
        if (!user.username || !user.roleId || !user.name) return toast.error("用户名、姓名和角色必填");
        
        let newUsers = [...db.data.users];
        if (user.id) { 
            const idx = newUsers.findIndex(u => u.id === user.id); 
            if (idx >= 0) {
                const existingPwd = newUsers[idx].password;
                if (!user.password) user.password = existingPwd;
                newUsers[idx] = user; 
            }
        } else { 
            if (!user.password) return toast.error("新用户必须设置密码");
            user.id = `u_${Date.now()}`; 
            newUsers.push(user); 
        }
        db.data.users = newUsers; db.save(); refreshData(); setEditingUser(null); toast.success("用户已保存"); db.logAudit(db.getCurrentUser().id, db.getCurrentUser().username, '保存用户', 'System', user.username);
    };
    
    const handleDeleteUser = (id) => { if (id === db.getCurrentUser().id) return toast.error("无法删除当前登录用户"); if (confirm("确定删除此用户？")) { db.data.users = db.data.users.filter(u => u.id !== id); db.save(); refreshData(); toast.success("用户已删除"); } };
    
    const RoleEditor = ({ role, onSave, onCancel }) => {
        const [formData, setFormData] = useState(role || { name: '', desc: '', permissions: [] });
        const [expandedScope, setExpandedScope] = useState<string | null>(null);
        const kbCols = db.data.kbCollections;
    
        const togglePerm = (key) => { 
            const newPerms = new Set(formData.permissions); 
            if (newPerms.has(key)) newPerms.delete(key); 
            else newPerms.add(key); 
            setFormData({ ...formData, permissions: Array.from(newPerms) }); 
        };
        const toggleScopeSpecific = (scopeType, colId) => {
            const key = `res:kb:${scopeType}:${colId}`;
            togglePerm(key);
        };
        const setScopeAll = (scopeType, itemKey, isAll) => {
            let newPerms = formData.permissions.filter(p => !p.startsWith(`res:kb:${scopeType}:`));
            if (isAll) { if (!newPerms.includes(itemKey)) newPerms.push(itemKey); } else { newPerms = newPerms.filter(p => p !== itemKey); }
            setFormData({ ...formData, permissions: newPerms });
        };
    
        return (
            <Modal title={role ? "编辑角色" : "新建角色"} onClose={onCancel} size="lg" footer={<button onClick={() => onSave(formData)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存配置</button>}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium mb-1">角色名称</label><input className="w-full border rounded p-2" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})}/></div>
                        <div><label className="block text-sm font-medium mb-1">描述</label><input className="w-full border rounded p-2" value={formData.desc} onChange={e=>setFormData({...formData, desc: e.target.value})}/></div>
                    </div>
                    <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-3 flex items-center"><Shield size={16} className="mr-2"/> 权限配置</h4>
                        <div className="space-y-6">
                            {PERMISSION_META.map(group => (
                                <div key={group.group}>
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">{group.group}</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {group.items.map(p => {
                                            const isScoped = !!p.scopeType;
                                            const isGlobalChecked = formData.permissions.includes(p.key);
                                            const hasSpecific = !isGlobalChecked && formData.permissions.some(perm => perm.startsWith(`res:kb:${p.scopeType}:`));
                                            const isEffective = isGlobalChecked || hasSpecific;
                                            return (
                                                <div key={p.key} className={`border rounded transition-all ${isEffective ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'} ${expandedScope === p.key ? 'col-span-2' : ''}`}>
                                                    <div className="p-3 flex items-start cursor-pointer" onClick={() => { if (isScoped) { if (expandedScope === p.key) { setExpandedScope(null); } else { if (!isEffective) setScopeAll(p.scopeType, p.key, true); setExpandedScope(p.key); } } else { togglePerm(p.key); } }}>
                                                        <div className={`mt-0.5 w-4 h-4 border rounded mr-3 flex items-center justify-center shrink-0 ${isEffective ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>{isEffective && <Check size={12} className="text-white"/>}</div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between items-center"><div className="text-sm font-medium text-gray-900">{p.label}</div>{isScoped && (<button onClick={(e) => { e.stopPropagation(); setExpandedScope(expandedScope === p.key ? null : p.key); }} className={`p-1 rounded hover:bg-blue-100 text-blue-600 transition-transform ${expandedScope === p.key ? 'rotate-180' : ''}`}><ChevronDown size={16}/></button>)}</div>
                                                            <div className="text-xs text-gray-500">{p.desc}</div>
                                                            {isScoped && isEffective && (<div className="text-[10px] mt-1 text-blue-600 font-medium">{isGlobalChecked ? '当前：全部知识库 (Global)' : `当前：指定 ${formData.permissions.filter(perm => perm.startsWith(`res:kb:${p.scopeType}:`)).length} 个知识库`}</div>)}
                                                        </div>
                                                    </div>
                                                    {isScoped && expandedScope === p.key && (
                                                        <div className="p-3 border-t bg-white/50 animate-in slide-in-from-top-1">
                                                            <div className="flex gap-4 mb-3 text-xs">
                                                                <label className="flex items-center cursor-pointer"><input type="radio" name={`scope_${p.key}`} className="mr-1.5" checked={isGlobalChecked} onChange={() => setScopeAll(p.scopeType, p.key, true)}/>全部知识库 (Global)</label>
                                                                <label className="flex items-center cursor-pointer"><input type="radio" name={`scope_${p.key}`} className="mr-1.5" checked={!isGlobalChecked} onChange={() => setScopeAll(p.scopeType, p.key, false)}/>指定知识库 (Specific)</label>
                                                            </div>
                                                            {!isGlobalChecked && (
                                                                <div className="space-y-1 pl-1 max-h-40 overflow-y-auto border-t border-dashed pt-2">
                                                                    {kbCols.map(col => { const specificKey = `res:kb:${p.scopeType}:${col.id}`; const checked = formData.permissions.includes(specificKey); return (<label key={col.id} className="flex items-center text-xs text-gray-700 hover:bg-gray-100 p-1.5 rounded cursor-pointer"><input type="checkbox" className="mr-2 rounded border-gray-300" checked={checked} onChange={() => toggleScopeSpecific(p.scopeType, col.id)}/><Folder size={12} className="mr-1.5 text-gray-400"/>{col.name}</label>) })}
                                                                    {kbCols.length === 0 && <div className="text-gray-400 text-[10px] italic">暂无知识库可配置</div>}
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
    
    const UserEditor = ({ user, onSave, onCancel }) => {
        const [formData, setFormData] = useState(user || { username: '', name: '', department: '', roleId: roles[0]?.id || '', status: 'active', password: '', phone: '', email: '' });
        return (
            <Modal title={user ? "编辑用户" : "新建用户"} onClose={onCancel} footer={<button onClick={() => onSave(formData)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存用户</button>}>
                <div className="space-y-6">
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">基本信息</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium mb-1">用户名*</label><input className="w-full border rounded p-2 bg-gray-50 text-sm" value={formData.username} disabled={!!user} onChange={e=>setFormData({...formData, username: e.target.value})} placeholder="登录账号"/></div>
                            <div><label className="block text-sm font-medium mb-1">真实姓名*</label><input className="w-full border rounded p-2 text-sm" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} placeholder="员工姓名"/></div>
                            <div><label className="block text-sm font-medium mb-1">部门</label><input className="w-full border rounded p-2 text-sm" value={formData.department} onChange={e=>setFormData({...formData, department: e.target.value})} placeholder="所属部门"/></div>
                            <div><label className="block text-sm font-medium mb-1">分配角色*</label><select className="w-full border rounded p-2 text-sm" value={formData.roleId} onChange={e=>setFormData({...formData, roleId: e.target.value})}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                            <div><label className="block text-sm font-medium mb-1">账号状态</label><select className="w-full border rounded p-2 text-sm" value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})}><option value="active">正常启用</option><option value="disabled">禁用</option></select></div>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">安全设置</h4>
                        <div><label className="block text-sm font-medium mb-1">{user ? '重置密码 (留空则不修改)' : '登录密码*'}</label><input type="password" className="w-full border rounded p-2 text-sm" value={formData.password || ''} onChange={e=>setFormData({...formData, password: e.target.value})} placeholder={user ? "******" : "设置登录密码"}/></div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">联系方式</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium mb-1">手机号码</label><input className="w-full border rounded p-2 text-sm" value={formData.phone || ''} onChange={e=>setFormData({...formData, phone: e.target.value})} placeholder="11位手机号"/></div>
                            <div><label className="block text-sm font-medium mb-1">电子邮箱</label><input className="w-full border rounded p-2 text-sm" value={formData.email || ''} onChange={e=>setFormData({...formData, email: e.target.value})} placeholder="工作邮箱"/></div>
                        </div>
                    </div>
                </div>
            </Modal>
        );
    };
    
    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 border-b flex items-center justify-between h-16 bg-gray-50"><div className="flex space-x-1 bg-gray-200 p-1 rounded-lg"><button onClick={()=>setTab('users')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>用户管理</button><button onClick={()=>setTab('roles')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${tab === 'roles' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>角色与权限 (RBAC)</button></div><button onClick={() => tab === 'users' ? setEditingUser({}) : setEditingRole({permissions:[]})} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center hover:bg-blue-700 shadow-sm"><Plus size={18} className="mr-2"/> {tab === 'users' ? '新增用户' : '新增角色'}</button></div>
            <div className="flex-1 overflow-auto p-6">
                {tab === 'users' ? (
                    <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-4">用户</th><th className="p-4">角色</th><th className="p-4">部门</th><th className="p-4">联系方式</th><th className="p-4">状态</th><th className="p-4 text-right">操作</th></tr></thead><tbody className="divide-y">{users.map(u => { const role = roles.find(r => r.id === u.roleId); return (<tr key={u.id} className="hover:bg-gray-50"><td className="p-4"><div className="font-medium text-gray-900">{u.name}</div><div className="text-xs text-gray-500">@{u.username}</div></td><td className="p-4"><span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">{role?.name || '未分配'}</span></td><td className="p-4 text-gray-600">{u.department}</td><td className="p-4 text-gray-500 text-xs"><div><span className="opacity-70 mr-1">Tel:</span>{u.phone || '-'}</div><div><span className="opacity-70 mr-1">Mail:</span>{u.email || '-'}</div></td><td className="p-4">{u.status === 'active' ? <span className="text-green-600 flex items-center text-xs"><CheckCircle size={12} className="mr-1"/> 正常</span> : <span className="text-gray-400 flex items-center text-xs"><AlertOctagon size={12} className="mr-1"/> 禁用</span>}</td><td className="p-4 text-right space-x-2"><button onClick={()=>setEditingUser(u)} className="text-blue-600 hover:underline">编辑</button><button onClick={()=>handleDeleteUser(u.id)} className="text-red-500 hover:underline">删除</button></td></tr>); })}</tbody></table>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{roles.map(r => (<div key={r.id} className="border rounded-xl p-5 hover:shadow-md transition-shadow bg-white flex flex-col"><div className="flex justify-between items-start mb-4"><div><h3 className="font-bold text-gray-800 text-lg">{r.name}</h3><p className="text-sm text-gray-500">{r.desc}</p></div><div className="flex space-x-2"><button onClick={()=>setEditingRole(r)} className="p-2 text-gray-400 hover:bg-gray-100 rounded hover:text-blue-600"><Edit3 size={16}/></button>{r.id !== 'role_admin' && <button onClick={()=>handleDeleteRole(r.id)} className="p-2 text-gray-400 hover:bg-gray-100 rounded hover:text-red-600"><Trash2 size={16}/></button>}</div></div><div className="flex-1"><div className="text-xs font-bold text-gray-400 uppercase mb-2">已获授权 ({r.permissions.length})</div><div className="flex flex-wrap gap-2">{r.permissions.slice(0, 8).map(pk => { let label = pk; PERMISSION_META.forEach(g => g.items.forEach(i => { if(i.key === pk) label = i.label; })); return <span key={pk} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">{label}</span>; })}{r.permissions.length > 8 && <span className="px-2 py-1 bg-gray-50 text-gray-400 text-xs rounded">+{r.permissions.length - 8} 更多...</span>}</div></div></div>))}</div>
                )}
            </div>
            {editingUser && <UserEditor user={editingUser.id ? editingUser : null} onSave={handleSaveUser} onCancel={()=>setEditingUser(null)} />}
            {editingRole && <RoleEditor role={editingRole.id ? editingRole : null} onSave={handleSaveRole} onCancel={()=>setEditingRole(null)} />}
        </div>
    );
};
