
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  FileText, MessageSquare, Database, Network, Users, ShieldAlert,
  PanelLeftClose, PanelLeftOpen, Shield, Settings, LogOut, Activity,
  MoreHorizontal
} from 'lucide-react';

import { db } from './db';
import { PERMISSIONS } from './constants';
import { ToastContext } from './context';
import { Toast, EmptyState } from './components/ui';

import { LoginView } from './views/LoginView';
import { SmartDocView } from './views/SmartDocView';
import { SmartQAView } from './views/SmartQAView';
import { KBView } from './views/KBView';
import { GraphView } from './views/GraphView';
import { UserManagementView } from './views/UserManagementView';
import { AuditLogView } from './views/AuditLogView';

const UnauthorizedView = () => (
    <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <ShieldAlert size={64} className="text-red-500 mb-4"/>
        <h2 className="text-xl font-bold text-gray-800">访问被拒绝</h2>
        <p className="mt-2">您当前的账号权限不足以访问此模块。</p>
    </div>
);

const App = () => {
    const [user, setUser] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [activeTab, setActiveTab] = useState('docs');
    const [graphFocusNode, setGraphFocusNode] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    useEffect(() => { const u = db.getCurrentUser(); if(u) setUser(u); }, []);
    
    const addToast = (text, type = 'info') => { const id = Date.now(); setToasts(prev => [...prev, { id, text, type }]); setTimeout(() => removeToast(id), 3000); };
    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
    const toast = { success: (t) => addToast(t, 'success'), error: (t) => addToast(t, 'error'), info: (t) => addToast(t, 'info') };
    
    const handleNavigateToGraph = (nodeId) => {
        setActiveTab('graph');
        setGraphFocusNode(nodeId);
        setTimeout(() => setGraphFocusNode(null), 3000);
    };
    
    if (!user) return <LoginView onLogin={setUser} />;
    const hasPerm = (p) => user.permissions.includes(p);
    
    const NavItem = ({ id, icon: Icon, label, perm }) => { 
        if(perm && !hasPerm(perm)) return null; 
        return (
            <button onClick={() => setActiveTab(id)} className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'space-x-3 px-4'} py-3 text-sm font-medium transition-all border-l-4 ${activeTab === id ? 'bg-blue-900/50 text-white border-blue-500' : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-white'}`} title={sidebarCollapsed ? label : ''}>
                <Icon size={20} className="shrink-0" /> 
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </button>
        ); 
    };
    
    return (
        <ToastContext.Provider value={toast}>
            <div className="flex h-screen bg-[#f3f4f6] text-gray-900 font-sans">
                <div className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-[#111827] text-gray-300 flex flex-col shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out`}>
                    <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800 bg-[#0f172a]">
                        {!sidebarCollapsed && (
                            <div className="flex items-center group cursor-pointer overflow-hidden whitespace-nowrap">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg mr-3 group-hover:rotate-12 transition-transform duration-300">G</div>
                                <span className="text-white font-bold text-lg group-hover:text-blue-400 transition-colors duration-300">GovAI 智政</span>
                            </div>
                        )}
                        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`text-gray-500 hover:text-white transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}>
                            {sidebarCollapsed ? <PanelLeftOpen size={20}/> : <PanelLeftClose size={20}/>}
                        </button>
                    </div>
                    
                    <div className="flex-1 py-6 space-y-1 overflow-y-auto overflow-x-hidden">
                        {!sidebarCollapsed && <div className="px-6 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider animate-in fade-in duration-300">办公作业</div>}
                        {sidebarCollapsed && <div className="h-4"></div>}
                        <NavItem id="docs" icon={FileText} label="智能公文" perm={PERMISSIONS.APP_DOC_WRITE} />
                        <NavItem id="chat" icon={MessageSquare} label="智能问答" perm={PERMISSIONS.APP_QA_CHAT} />
                        
                        {!sidebarCollapsed && <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider animate-in fade-in duration-300">资源与管理</div>}
                        {sidebarCollapsed && <div className="h-4 border-t border-gray-800 mx-4 my-2"></div>}
                        <NavItem id="users" icon={Users} label="用户权限" perm={PERMISSIONS.SYS_USER_MGMT} />
                        <NavItem id="kb" icon={Database} label="知识库" perm={PERMISSIONS.RES_KB_MGMT} />
                        <NavItem id="graph" icon={Network} label="知识图谱" perm={PERMISSIONS.RES_GRAPH_VIEW} />
                        <NavItem id="audit" icon={ShieldAlert} label="系统审计" perm={PERMISSIONS.SYS_AUDIT_LOG} />
                    </div>
                    
                    <div className="p-4 bg-[#0f172a] border-t border-gray-800 relative">
                        {showUserMenu && (
                            <>
                                <div className="fixed inset-0 z-0" onClick={() => setShowUserMenu(false)}></div>
                                <div className="absolute bottom-full left-2 right-2 mb-3 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-10 w-60 animate-in slide-in-from-bottom-2 fade-in duration-200">
                                    <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                                        <div className="font-bold text-white text-sm">{user.name}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">@{user.username}</div>
                                        <div className="mt-2 flex items-center text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded w-fit">
                                            <Shield size={10} className="mr-1"/> {user.department} - {user.roleName || 'User'}
                                        </div>
                                    </div>
                                    <div className="p-1">
                                        <button className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg flex items-center transition-colors">
                                            <Settings size={14} className="mr-2"/> 账号设置
                                        </button>
                                        <div className="h-px bg-slate-700 my-1 mx-2"></div>
                                        <button onClick={() => { db.logout(); setUser(null); }} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 rounded-lg flex items-center transition-colors">
                                            <LogOut size={14} className="mr-2"/> 退出登录
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                        <div 
                            className={`flex items-center cursor-pointer hover:bg-slate-800 p-2 rounded-lg transition-all duration-200 ${sidebarCollapsed ? 'justify-center' : ''}`}
                            onClick={() => setShowUserMenu(!showUserMenu)}
                        >
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm border border-blue-500/30">
                                {user.username[0].toUpperCase()}
                            </div>
                            {!sidebarCollapsed && (
                                <div className="flex-1 min-w-0 ml-3">
                                    <div className="text-sm font-medium text-white truncate">{user.name}</div>
                                    <div className="text-[10px] text-gray-500 truncate capitalize">{user.roleName || 'User'}</div>
                                </div>
                            )}
                            {!sidebarCollapsed && <MoreHorizontal size={16} className="text-gray-500 ml-2"/>}
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-col min-w-0 h-screen">
                    <div className="h-14 bg-white border-b border-gray-200 flex justify-between items-center px-6 shadow-sm z-10"><div className="text-sm text-gray-500 font-medium">当前模块：<span className="text-gray-900 font-bold capitalize">{activeTab}</span></div><div className="flex items-center space-x-2 text-xs text-gray-400"><Activity size={12} className="text-green-500"/> 系统正常</div></div>
                    <div className="flex-1 p-6 overflow-hidden relative">
                        {activeTab === 'docs' && (hasPerm(PERMISSIONS.APP_DOC_WRITE) ? <SmartDocView toast={toast}/> : <UnauthorizedView/>)}
                        {activeTab === 'chat' && (hasPerm(PERMISSIONS.APP_QA_CHAT) ? <SmartQAView toast={toast} onNavigateToGraph={handleNavigateToGraph}/> : <UnauthorizedView/>)}
                        {activeTab === 'kb' && (hasPerm(PERMISSIONS.RES_KB_MGMT) ? <KBView toast={toast}/> : <UnauthorizedView/>)}
                        {activeTab === 'graph' && (hasPerm(PERMISSIONS.RES_GRAPH_VIEW) ? <GraphView toast={toast} focusNodeId={graphFocusNode}/> : <UnauthorizedView/>)}
                        {activeTab === 'users' && (hasPerm(PERMISSIONS.SYS_USER_MGMT) ? <UserManagementView toast={toast}/> : <UnauthorizedView/>)}
                        {activeTab === 'audit' && (hasPerm(PERMISSIONS.SYS_AUDIT_LOG) ? <AuditLogView/> : <UnauthorizedView/>)}
                    </div>
                </div>
            </div>
            <Toast msgs={toasts} remove={removeToast}/>
        </ToastContext.Provider>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
