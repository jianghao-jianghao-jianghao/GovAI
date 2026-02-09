import React, { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  LayoutDashboard, FileText, MessageSquare, Database, 
  Settings, ShieldAlert, FileCode, User, LogOut, 
  Plus, Search, Send, Download, Save, History, 
  CheckCircle, AlertTriangle, File, ChevronRight,
  ChevronDown, X, Menu, Loader2, Share, PenTool,
  RefreshCw, BookOpen, Cpu, Server, Activity, GitBranch,
  Lock, Trash2, Upload, FileUp, Sparkles, Archive, Eye,
  Languages, Sliders, AlertOctagon, Undo2, Users, Edit3,
  FilePlus, Check, Play, LayoutTemplate, Key, Network,
  ZoomIn, ZoomOut, Move, MoreHorizontal, Copy, FolderPlus,
  Folder, FileType, ExternalLink, Printer, Shield, UserCog, UserCheck,
  AlignLeft, Type, Wand2, FileCheck, Palette, Eraser,
  BrainCircuit, Share2, Lightbulb, Quote, Zap, MapPin, MousePointer2, Navigation,
  FolderOpen, Pencil, LockKeyhole, ChevronUp, Layers, CloudUpload,
  PanelLeftClose, PanelLeftOpen, Mail, Phone, Calendar, HelpCircle, MessageCircle
} from 'lucide-react';

// --- 全局上下文 ---
const ToastContext = createContext<any>(null);

// --- 权限定义 (Permission Keys) ---
const PERMISSIONS = {
  SYS_USER_MGMT: 'sys:user:manage',
  SYS_RULE_MGMT: 'sys:rule:manage',
  
  // KB Permissions
  RES_KB_MGMT:       'res:kb:view_module', // Access the KB Module (Menu Item)
  RES_KB_MANAGE_ALL: 'res:kb:manage_all',  // Global Admin: Create Cols, Manage All Files
  RES_KB_REF_ALL:    'res:kb:ref_all',     // Global Ref: Can reference all collections in Chat
  
  // QA Bank Permissions
  RES_QA_MANAGE:     'res:qa:manage',      // Manage QA Pairs (CRUD)
  RES_QA_REF:        'res:qa:ref',         // Reference QA Bank in Chat
  RES_QA_FEEDBACK:   'res:qa:feedback',    // Save Chat to QA Bank

  RES_MAT_MGMT:  'res:material:manage',
  RES_TMPL_MGMT: 'res:template:manage',
  RES_GRAPH_VIEW:'res:graph:view',
  APP_DOC_WRITE: 'app:doc:write',
  APP_QA_CHAT:   'app:qa:chat',
  SYS_AUDIT_LOG: 'sys:audit:view'
};

// --- 权限元数据 (用于UI展示与分组) ---
const PERMISSION_META = [
    {
        group: '核心业务',
        items: [
            { key: PERMISSIONS.APP_DOC_WRITE, label: '智能公文写作', desc: '允许使用AI辅助撰写公文' },
            { key: PERMISSIONS.APP_QA_CHAT,   label: '智能法规问答', desc: '允许进行RAG检索问答' }
        ]
    },
    {
        group: '知识资源',
        items: [
            { key: PERMISSIONS.RES_KB_MGMT,       label: '知识库菜单访问', desc: '允许进入知识库管理界面 (基础入口)' },
            { 
                key: PERMISSIONS.RES_KB_MANAGE_ALL, 
                label: '知识库管理权限', 
                desc: '创建集合、上传/编辑/删除文档',
                scopeType: 'manage' // Custom flag for UI to show scope selector
            },
            { 
                key: PERMISSIONS.RES_KB_REF_ALL,    
                label: '知识库引用权限', 
                desc: '在智能问答中引用知识库内容',
                scopeType: 'ref' // Custom flag for UI to show scope selector
            },
            { key: PERMISSIONS.RES_QA_MANAGE,     label: 'QA问答库管理',   desc: '增删改查结构化问答对' },
            { key: PERMISSIONS.RES_QA_REF,        label: 'QA库引用权限',   desc: '允许问答模型优先检索QA库' },
            { key: PERMISSIONS.RES_QA_FEEDBACK,   label: '问答回流权限',   desc: '允许将聊天记录保存至QA库' },
            { key: PERMISSIONS.RES_GRAPH_VIEW,    label: '知识图谱查看',   desc: '允许查看实体关系图' },
            { key: PERMISSIONS.RES_MAT_MGMT,      label: '素材库管理',     desc: '管理常用语料与模板素材' },
            { key: PERMISSIONS.RES_TMPL_MGMT,     label: '公文模板管理',   desc: '配置公文生成的基础模板' }
        ]
    },
    {
        group: '系统管理',
        items: [
            { key: PERMISSIONS.SYS_USER_MGMT, label: '用户与权限',   desc: '管理用户账号、角色及授权' },
            { key: PERMISSIONS.SYS_RULE_MGMT, label: '安全规则配置', desc: '配置敏感词过滤与拦截规则' },
            { key: PERMISSIONS.SYS_AUDIT_LOG, label: '审计日志',     desc: '查看系统全量操作记录' }
        ]
    }
];

// --- Mock DB & Helper Functions ---

// Check if user has permission for a specific scope type (manage or ref) on a collection
const hasKbPerm = (user, type: 'manage' | 'ref', colId?: string) => {
    if (!user || !user.permissions) return false;
    // 1. Check Global Permission
    if (type === 'manage' && user.permissions.includes(PERMISSIONS.RES_KB_MANAGE_ALL)) return true;
    if (type === 'ref' && user.permissions.includes(PERMISSIONS.RES_KB_REF_ALL)) return true;
    // 2. Check Scoped Permission (if colId provided)
    if (colId) {
        return user.permissions.includes(`res:kb:${type}:${colId}`);
    }
    return false;
};

// --- MOCK DB (Persistent) ---
class PersistentMockDB {
  data: any;
  STORAGE_KEY = 'govai_mock_db_v11_qa_bank';

  constructor() {
    this.load();
  }

  load() {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      this.data = JSON.parse(stored);
      // Ensure qaPairs exists for legacy data
      if (!this.data.qaPairs) this.data.qaPairs = [];
    } else {
      this.seed();
    }
  }

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
  }

  seed() {
    // 预设集合 ID，方便赋权
    const colPolicy = 'c1';
    const colInternal = 'c2';

    // 预设角色
    const roles = [
        { 
            id: 'role_admin', 
            name: '超级管理员', 
            desc: '拥有系统所有权限', 
            permissions: Object.values(PERMISSIONS) 
        },
        { 
            id: 'role_staff', 
            name: '业务科员', 
            desc: '可查看所有文档，不可管理', 
            permissions: [
                PERMISSIONS.APP_DOC_WRITE, 
                PERMISSIONS.APP_QA_CHAT, 
                PERMISSIONS.RES_KB_MGMT,
                PERMISSIONS.RES_KB_REF_ALL, // Can reference everything
                PERMISSIONS.RES_QA_REF,     // Can ref QA
                PERMISSIONS.RES_QA_FEEDBACK,// Can save to QA
                PERMISSIONS.RES_GRAPH_VIEW, 
                PERMISSIONS.RES_MAT_MGMT
            ] 
        },
        {
            id: 'role_hr',
            name: '人事专员',
            desc: '仅管理和引用部门规章制度',
            permissions: [
                PERMISSIONS.APP_QA_CHAT,
                PERMISSIONS.RES_KB_MGMT,
                `res:kb:manage:${colInternal}`, // Scope: Manage Internal
                `res:kb:ref:${colInternal}`,    // Scope: Ref Internal
                PERMISSIONS.RES_QA_REF 
            ]
        },
        { 
            id: 'role_auditor', 
            name: '审计专员', 
            desc: '负责合规审计与日志查看', 
            permissions: [PERMISSIONS.SYS_AUDIT_LOG, PERMISSIONS.APP_QA_CHAT] 
        }
    ];

    this.data = {
      currentUser: null,
      roles: roles,
      users: [
        { id: 'u1', username: 'admin', password: '123', name: '系统管理员', department: '信息化办', roleId: 'role_admin', status: 'active', phone: '13800000001', email: 'admin@gov.cn' },
        { id: 'u2', username: 'user', password: '123', name: '王科员', department: '综合处', roleId: 'role_staff', status: 'active', phone: '13800000002', email: 'wang@gov.cn' },
        { id: 'u3', username: 'auditor', password: '123', name: '李审计', department: '审计处', roleId: 'role_auditor', status: 'active', phone: '13800000003', email: 'audit@gov.cn' },
        { id: 'u4', username: 'hr', password: '123', name: '赵人事', department: '人事处', roleId: 'role_hr', status: 'active', phone: '13800000004', email: 'hr@gov.cn' }
      ],
      sessions: [
        { 
            id: 's1', 
            userId: 'u1', 
            title: '示例：数字政府建设咨询', 
            kbIds: [colPolicy], 
            qaRef: true,
            updated_at: new Date().toISOString(), 
            messages: [
                { id: 'm1', role: 'user', content: '数字政府建设的指导思想是什么？', timestamp: Date.now() },
                { 
                    id: 'm2', 
                    role: 'assistant', 
                    content: '坚持以人民为中心，坚持系统观念...', 
                    timestamp: Date.now(), 
                    citations: [{title: '国发〔2022〕XX号', type: 'kb', page: 1}],
                    reasoning: '1. 分析用户意图：查询数字政府建设指导思想。\n2. 检索知识库“国家政策法规”集合。\n3. 定位到《关于加强数字政府建设的指导意见》。\n4. 提取“指导思想”章节核心内容。',
                    knowledgeGraph: [
                        { source: '数字政府', target: '以人民为中心', relation: '原则' },
                        { source: '数字政府', target: '系统观念', relation: '方法' }
                    ]
                }
            ]
        },
      ],
      docs: [
        { id: 'd1', creatorId: 'u1', title: '2024年信息化工作总结', type: '汇报', status: 'draft', content: '关于2024年信息化建设工作的汇报...', urgency: '平件', security: '公开', updated_at: new Date().toISOString() }
      ],
      docVersions: [],
      kbCollections: [
         { id: colPolicy, name: '国家政策法规', parentId: null },
         { id: colInternal, name: '部门规章制度', parentId: null }
      ],
      kbFiles: [
        { id: 'k1', collectionId: colPolicy, name: '数据安全法.pdf', type: 'pdf', size: '1.8MB', status: 'indexed', uploaded_at: new Date().toISOString() },
        { id: 'k2', collectionId: colPolicy, name: '个人信息保护法.docx', type: 'docx', size: '2.4MB', status: 'indexed', uploaded_at: new Date().toISOString() }
      ],
      qaPairs: [
          { id: 'q1', question: '什么是“一网通办”？', answer: '“一网通办”是指依托一体化在线政务服务平台，通过规范网上办事标准、优化网上办事流程、搭建统一的互联网政务服务总门户、整合政府服务数据资源、完善配套制度等措施，推行线上线下标准一致、服务一体、渠道同源的政务服务模式。', category: '通用概念', updated_at: new Date().toISOString() }
      ],
      templates: [
         { id: 't1', name: '通用通知模板', type: '通知', content: '关于[事项]的通知\n\n各相关单位：\n\n[正文]\n\n特此通知。' }
      ],
      materials: [
         { id: 'm1', title: '常用开头(强调意义)', category: '开头', content: '近年来，随着......的深入推进，......已成为推动高质量发展的重要引擎。为进一步贯彻落实......精神，现就有关事项通知如下：' },
         { id: 'm2', title: '常用开头(根据规定)', category: '开头', content: '根据《......管理办法》及相关规定，结合我单位实际，制定本方案。' },
         { id: 'm3', title: '常用结尾(请示)', category: '结尾', content: '以上请示当否，请批示。' },
         { id: 'm4', title: '常用结尾(报告)', category: '结尾', content: '特此报告。' },
         { id: 'm5', title: '过渡句(分析问题)', category: '过渡', content: '当前，工作中还存在一些不容忽视的问题，主要表现在：' },
         { id: 'm6', title: '政策术语(新质生产力)', category: '政策', content: '加快发展新质生产力，扎实推进高质量发展。' },
         { id: 'm7', title: '政策术语(数字化)', category: '政策', content: '充分发挥数据要素乘数效应，赋能经济社会发展。' }
      ],
      rules: [
         { id: 'r1', keyword: '绝密', action: 'block', level: 'high', note: '禁止查询涉密信息' },
         { id: 'r2', keyword: '薪资', action: 'warn', level: 'medium', note: '敏感人事信息' }
      ],
      auditLogs: []
    };
    this.save();
  }

  login(username, password) {
    const user = this.data.users.find(u => u.username === username && u.password === password);
    if (user) {
      if(user.status === 'disabled') return { success: false, message: '账号已被禁用' };
      const role = this.data.roles.find(r => r.id === user.roleId);
      const userWithPerms = { ...user, roleName: role ? role.name : 'Unknown', permissions: role ? role.permissions : [] };
      this.data.currentUser = userWithPerms;
      this.logAudit(user.id, user.username, '登录', 'Auth', '登录成功');
      this.save();
      return { success: true, user: userWithPerms };
    }
    return { success: false, message: '用户名或密码错误' };
  }

  logout() {
    if(this.data.currentUser) {
        this.logAudit(this.data.currentUser.id, this.data.currentUser.username, '退出', 'Auth', '退出登录');
        this.data.currentUser = null;
        this.save();
    }
  }

  logAudit(userId, userName, action, module, detail) {
      this.data.auditLogs.unshift({ id: `log_${Date.now()}`, time: new Date().toISOString(), userId, user: userName, action, module, detail });
      this.save();
  }

  getCurrentUser() { return this.data.currentUser; }
  getDocs() { return this.data.docs || []; }
  saveDoc(doc) { 
      const existing = this.data.docs.findIndex(d => d.id === doc.id);
      if(existing >= 0) this.data.docs[existing] = doc;
      else this.data.docs.unshift(doc);
      this.save();
  }
  saveMaterial(mat) {
      if (mat.id) {
          const idx = this.data.materials.findIndex(m => m.id === mat.id);
          if(idx >= 0) this.data.materials[idx] = mat;
      } else {
          mat.id = `m_${Date.now()}`;
          this.data.materials.unshift(mat);
      }
      this.save();
  }
  deleteMaterial(id) {
      this.data.materials = this.data.materials.filter(m => m.id !== id);
      this.save();
  }
  getSessions() { return this.data.sessions || []; }
  saveSession(session) {
      const idx = this.data.sessions.findIndex(s => s.id === session.id);
      if(idx >= 0) this.data.sessions[idx] = session;
      else this.data.sessions.unshift(session);
      this.save();
  }

  // --- KB CRUD ---
  saveCollection(col) {
      if (col.id) {
          const idx = this.data.kbCollections.findIndex(c => c.id === col.id);
          if(idx >= 0) this.data.kbCollections[idx] = col;
      } else {
          col.id = `c_${Date.now()}`;
          this.data.kbCollections.push(col);
      }
      this.save();
      return col;
  }
  
  deleteCollection(id) {
      // Cascade delete files
      this.data.kbFiles = this.data.kbFiles.filter(f => f.collectionId !== id);
      this.data.kbCollections = this.data.kbCollections.filter(c => c.id !== id);
      this.save();
  }
  
  saveKbFile(file) {
      if (file.id) {
          const idx = this.data.kbFiles.findIndex(f => f.id === file.id);
          if(idx >= 0) this.data.kbFiles[idx] = file;
      } else {
          file.id = `k_${Date.now()}`;
          this.data.kbFiles.unshift(file);
      }
      this.save();
      return file;
  }
  
  deleteKbFile(id) {
      this.data.kbFiles = this.data.kbFiles.filter(f => f.id !== id);
      this.save();
  }

  // --- QA Bank CRUD ---
  saveQaPair(qa) {
      if (!this.data.qaPairs) this.data.qaPairs = [];
      if (qa.id) {
          const idx = this.data.qaPairs.findIndex(q => q.id === qa.id);
          if (idx >= 0) this.data.qaPairs[idx] = qa;
      } else {
          qa.id = `q_${Date.now()}`;
          qa.updated_at = new Date().toISOString();
          this.data.qaPairs.unshift(qa);
      }
      this.save();
      return qa;
  }

  deleteQaPair(id) {
      if (!this.data.qaPairs) return;
      this.data.qaPairs = this.data.qaPairs.filter(q => q.id !== id);
      this.save();
  }
}

const db = new PersistentMockDB();

// --- UI Components ---

const Toast = ({ msgs, remove }) => (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {msgs.map(m => (
            <div key={m.id} className={`flex items-center p-4 rounded shadow-lg text-white min-w-[300px] animate-in slide-in-from-right duration-300 ${m.type === 'error' ? 'bg-red-500' : m.type === 'success' ? 'bg-green-600' : 'bg-blue-500'}`}>
                {m.type === 'error' ? <AlertOctagon size={20} className="mr-2"/> : <CheckCircle size={20} className="mr-2"/>}
                <div className="flex-1 text-sm font-medium">{m.text}</div>
                <X size={16} className="cursor-pointer ml-4 opacity-70 hover:opacity-100" onClick={() => remove(m.id)}/>
            </div>
        ))}
    </div>
);

const EmptyState = ({ icon: Icon, title, desc, action }) => (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500 pointer-events-none">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Icon size={32} className="text-gray-400"/>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm max-w-xs mb-6">{desc}</p>
        <div className="pointer-events-auto">{action}</div>
    </div>
);

const Modal = ({ title, children, onClose, footer, size = 'md' }: { title: any; children?: React.ReactNode; onClose: any; footer: any; size?: string }) => {
    const widthClass = size === 'lg' ? 'max-w-4xl' : size === 'xl' ? 'max-w-6xl' : 'max-w-md';
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className={`bg-white rounded-lg shadow-xl w-full ${widthClass} flex flex-col max-h-[90vh]`}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-gray-800">{title}</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600"/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">{children}</div>
                {footer && <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    );
};

// --- Views ---

const LoginView = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const handleLogin = () => {
      const res = db.login(username, password);
      if(res.success) onLogin(res.user);
      else setError(res.message);
  };
  const fillCreds = (u, p) => { setUsername(u); setPassword(p); setError(''); };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#0f172a] p-10 text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl shadow-lg mx-auto mb-4">G</div>
            <h1 className="text-2xl font-bold text-white tracking-wide">GovAI 智政</h1>
            <p className="text-blue-200 text-sm mt-2">私有化智能公文与问答系统</p>
        </div>
        <div className="p-8 space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center border border-red-100 flex items-center justify-center"><AlertOctagon size={16} className="mr-2"/>{error}</div>}
          <div className="flex gap-2 justify-center mb-2">
              <button onClick={()=>fillCreds('admin','123')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-600">填充 Admin</button>
              <button onClick={()=>fillCreds('user','123')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-600">填充 User</button>
              <button onClick={()=>fillCreds('hr','123')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-600">填充 HR</button>
          </div>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">用户名</label><input className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={username} onChange={e=>setUsername(e.target.value)} placeholder="请输入用户名"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">密码</label><input type="password" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码" onKeyDown={e=>e.key==='Enter'&&handleLogin()}/></div>
          </div>
          <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg transition-colors shadow-lg shadow-blue-200">登 录 系 统</button>
        </div>
      </div>
    </div>
  );
};

const UnauthorizedView = () => (
    <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <ShieldAlert size={64} className="text-red-500 mb-4"/>
        <h2 className="text-xl font-bold text-gray-800">访问被拒绝</h2>
        <p className="mt-2">您当前的账号权限不足以访问此模块。</p>
    </div>
);

const SmartQAView = ({ toast, onNavigateToGraph }) => {
    const [sessions, setSessions] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [citationDrawer, setCitationDrawer] = useState(null);
    const [kbCollections, setKbCollections] = useState([]);
    const [expandedReasoning, setExpandedReasoning] = useState({});
    const [showKbSelect, setShowKbSelect] = useState(false);
    const [quoteText, setQuoteText] = useState(null);
    const [editingQa, setEditingQa] = useState(null); 
    const chatContainerRef = useRef(null);

    useEffect(() => { 
        loadSessions(); 
        const currentUser = db.getCurrentUser();
        const allCols = db.data.kbCollections;
        const permittedCols = allCols.filter(c => hasKbPerm(currentUser, 'ref', c.id));
        setKbCollections(permittedCols); 
    }, []);

    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;
            if (chatContainerRef.current && chatContainerRef.current.contains(selection.anchorNode)) {
                const text = selection.toString().trim();
                if (text) setQuoteText(text);
            }
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const user = db.getCurrentUser();
    const canRefQa = user?.permissions.includes(PERMISSIONS.RES_QA_REF);
    const canSaveQa = user?.permissions.includes(PERMISSIONS.RES_QA_FEEDBACK);

    const loadSessions = () => {
        const s = db.getSessions();
        setSessions(s);
        if(s.length > 0 && !activeId) setActiveId(s[0].id);
    };

    const createSession = () => {
        const defaultKb = kbCollections.length > 0 ? [kbCollections[0].id] : [];
        const newS = { id: `s_${Date.now()}`, userId: db.getCurrentUser().id, title: '新会话', kbIds: defaultKb, qaRef: canRefQa, updated_at: new Date().toISOString(), messages: [] };
        db.saveSession(newS);
        loadSessions();
        setActiveId(newS.id);
    };

    const deleteSession = (e, id) => {
        e.stopPropagation();
        if(!confirm('确定删除此会话？')) return;
        const newS = sessions.filter(s => s.id !== id);
        db.data.sessions = newS;
        db.save();
        loadSessions();
        if(activeId === id) setActiveId(newS[0]?.id || null);
    };

    const toggleKb = (kbId) => {
        const s = sessions.find(s => s.id === activeId);
        if (!s) return;
        if (kbId === 'SYSTEM_QA_BANK') {
            s.qaRef = !s.qaRef;
        } else {
            const currentIds = s.kbIds || [];
            const newIds = currentIds.includes(kbId) ? currentIds.filter(id => id !== kbId) : [...currentIds, kbId];
            s.kbIds = newIds;
        }
        db.saveSession(s);
        loadSessions();
    };

    const handleSaveToQa = (qaData) => {
        db.saveQaPair({
            id: `q_${Date.now()}`,
            question: qaData.question,
            answer: qaData.answer,
            category: qaData.category,
            created_at: new Date().toISOString()
        });
        toast.success("已成功保存至QA库");
        setEditingQa(null);
    };

    const handleSend = () => {
        if(!input.trim()) return;
        const blocked = db.data.rules.find(r => r.action === 'block' && input.includes(r.keyword));
        if(blocked) { toast.error(`触发安全拦截：包含敏感词 "${blocked.keyword}"`); return; }
        const warn = db.data.rules.find(r => r.action === 'warn' && input.includes(r.keyword));
        if(warn && !window.confirm(`提示：包含敏感词"${warn.keyword}"，继续吗？`)) return;
        
        const currentSession = sessions.find(s => s.id === activeId);
        const finalContent = quoteText ? `> ${quoteText}\n\n${input}` : input;
        
        const userMsg = { id: `m_${Date.now()}_u`, role: 'user', content: finalContent, timestamp: Date.now() };
        const updatedMsgs = [...(currentSession.messages || []), userMsg];
        const updatedSession = { ...currentSession, messages: updatedMsgs, updated_at: new Date().toISOString(), title: currentSession.messages.length === 0 ? input.slice(0, 15) : currentSession.title };
        db.saveSession(updatedSession);
        loadSessions();
        setInput('');
        setQuoteText(null); 
        setIsStreaming(true);

        setTimeout(() => {
            const activeKbNames = kbCollections.filter(k => (currentSession.kbIds || []).includes(k.id)).map(k => k.name);
            if (currentSession.qaRef) activeKbNames.unshift("智能QA库");
            const sourceStr = activeKbNames.length > 0 ? `基于[${activeKbNames.join('、')}]` : '基于通用知识';
            
            // Simulation: Priority Search in QA Bank
            let qaHit = null;
            if (currentSession.qaRef) {
                qaHit = db.data.qaPairs.find(q => input.includes(q.question) || q.question.includes(input));
            }

            let content, reasoning, citations;

            if (qaHit) {
                content = `针对您的问题“${input}”，在智能QA库中找到以下匹配结果：\n\n${qaHit.answer}`;
                reasoning = `1. **检索策略**: 优先检索智能QA库。\n2. **命中检查**: 发现高置信度匹配项 ID:${qaHit.id}。\n3. **直接输出**: 返回QA库中的标准答案。`;
                citations = [{ title: '智能QA库', type: 'qa', page: 1, quote: qaHit.answer }];
            } else {
                content = `针对您的问题“${input}”，${sourceStr}分析如下：\n\n根据《数据安全法》及相关规定，数据分类分级是数据安全保护的基石。建立数据分类分级保护制度，应当根据数据在经济社会发展中的重要程度，以及一旦遭到篡改、破坏、泄露或者非法获取、非法利用，对国家安全、公共利益或者个人、组织合法权益造成的危害程度，对数据实行分类分级保护。`;
                reasoning = `1. **意图识别**: 用户询问关于"${input}"的内容。\n2. **QA检索**: 未在QA库中找到匹配项。\n3. **文档检索**: 在[${activeKbNames.join(',')}]中检索相关文档。\n4. **实体链接**: 识别实体"数据安全"、"分类分级"。\n5. **逻辑推理**: 根据《数据安全法》第二十一条，确认分类分级是法定要求。`;
                citations = [{ title: '数据安全法.pdf', type: 'kb', page: 12, quote: '第二十一条 国家建立数据分类分级保护制度...' }];
            }

            const aiMsg = { 
                id: `m_${Date.now()}_a`, 
                role: 'assistant', 
                content: content, 
                timestamp: Date.now(),
                citations: citations,
                reasoning: reasoning,
                knowledgeGraph: !qaHit ? [
                    { source: input.slice(0,4) || '核心概念', target: '数据安全法', relation: '依据' },
                    { source: '数据安全法', target: '分类分级制度', relation: '包含' },
                    { source: '分类分级', target: '国家安全', relation: '影响' }
                ] : null
            };
            updatedSession.messages.push(aiMsg);
            db.saveSession(updatedSession);
            loadSessions();
            setIsStreaming(false);
            setExpandedReasoning(prev => ({...prev, [aiMsg.id]: true}));
        }, 1500);
    };

    const activeSession = sessions.find(s => s.id === activeId);

    const QaModal = ({ initialQ, initialA, onSave, onClose }) => {
        const [q, setQ] = useState(initialQ);
        const [a, setA] = useState(initialA);
        const [cat, setCat] = useState('Chat Feedback');
        return (
            <Modal title="存入智能QA库" onClose={onClose} footer={<button onClick={()=>onSave({question:q, answer:a, category:cat})} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}>
                <div className="space-y-4">
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">问题</label><textarea className="w-full border rounded p-2 text-sm h-20" value={q} onChange={e=>setQ(e.target.value)}/></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">答案</label><textarea className="w-full border rounded p-2 text-sm h-32" value={a} onChange={e=>setA(e.target.value)}/></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">分类</label><input className="w-full border rounded p-2 text-sm" value={cat} onChange={e=>setCat(e.target.value)}/></div>
                    <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-700 flex items-center"><AlertTriangle size={12} className="mr-1"/> 保存后，该问答对将在后续问答中被优先检索。</div>
                </div>
            </Modal>
        );
    };

    return (
        <div className="flex h-full gap-4 relative">
            <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <span className="font-bold text-gray-700">历史会话</span>
                    <button onClick={createSession} className="p-1 hover:bg-gray-200 rounded"><Plus size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                        <div key={s.id} onClick={() => setActiveId(s.id)} className={`group p-3 rounded-lg text-sm cursor-pointer flex justify-between items-center ${activeId === s.id ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}`}>
                            <span className="truncate flex-1">{s.title}</span>
                            <Trash2 size={14} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500" onClick={(e)=>deleteSession(e, s.id)}/>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col relative overflow-hidden">
                {activeSession ? (
                    <>
                        <div className="h-14 border-b flex items-center justify-between px-6 bg-slate-50">
                            <div className="flex flex-col">
                                <div className="font-bold text-gray-700 truncate max-w-md text-sm">{activeSession.title}</div>
                                <div className="text-[10px] text-gray-500 flex items-center"><Activity size={10} className="mr-1 text-green-500"/> RAG 增强检索</div>
                            </div>
                            <div className="flex items-center space-x-2 relative">
                                <button onClick={() => setShowKbSelect(!showKbSelect)} className="flex items-center text-xs border rounded px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors">
                                    <Database size={12} className="mr-2 text-blue-600"/><span>{(activeSession.kbIds || []).length + (activeSession.qaRef ? 1 : 0) > 0 ? `已选 ${(activeSession.kbIds?.length || 0) + (activeSession.qaRef ? 1 : 0)} 个知识源` : '选择知识库'}</span><ChevronDown size={12} className="ml-2 text-gray-400"/>
                                </button>
                                {showKbSelect && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowKbSelect(false)}></div>
                                        <div className="absolute top-full right-0 mt-2 w-56 bg-white border rounded-lg shadow-xl z-20 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mb-1">结构化知识</div>
                                            {canRefQa && (
                                                <div className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={() => toggleKb('SYSTEM_QA_BANK')}>
                                                    <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${activeSession.qaRef ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}>{activeSession.qaRef && <Check size={10} className="text-white"/>}</div>
                                                    <span className="text-sm text-gray-700 flex items-center"><MessageCircle size={12} className="mr-1 text-purple-500"/> 智能QA库</span>
                                                </div>
                                            )}
                                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mt-2 mb-1">文档集合</div>
                                            {kbCollections.map(kb => (
                                                <div key={kb.id} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={() => toggleKb(kb.id)}>
                                                    <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${(activeSession.kbIds || []).includes(kb.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>{(activeSession.kbIds || []).includes(kb.id) && <Check size={10} className="text-white"/>}</div>
                                                    <span className="text-sm text-gray-700">{kb.name}</span>
                                                </div>
                                            ))}
                                            {kbCollections.length === 0 && <div className="p-2 text-xs text-gray-400 text-center">暂无可用知识库</div>}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50" ref={chatContainerRef}>
                            {activeSession.messages.map((m, idx) => (
                                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none'}`}>
                                        {m.role === 'assistant' && m.reasoning && (
                                            <div className="mb-3 border-b border-gray-100 pb-2">
                                                <div className="flex items-center text-xs text-orange-600 cursor-pointer hover:text-orange-700 font-medium" onClick={() => setExpandedReasoning(prev => ({...prev, [m.id]: !prev[m.id]}))}>
                                                    <BrainCircuit size={12} className="mr-1.5"/> {expandedReasoning[m.id] ? '收起推理过程' : '查看推理过程'} <ChevronDown size={12} className={`ml-1 transition-transform ${expandedReasoning[m.id] ? 'rotate-180' : ''}`}/>
                                                </div>
                                                {expandedReasoning[m.id] && <div className="mt-2 text-xs text-gray-600 bg-orange-50 p-2 rounded whitespace-pre-wrap leading-relaxed border border-orange-100 font-mono">{m.reasoning}</div>}
                                            </div>
                                        )}
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed selection:bg-yellow-200 selection:text-black">
                                            {m.content.startsWith('> ') ? <><div className="border-l-4 border-white/50 pl-3 py-1 mb-2 text-white/80 italic text-xs bg-black/10 rounded-r">{m.content.split('\n\n')[0].substring(2)}</div><div>{m.content.substring(m.content.indexOf('\n\n') + 2)}</div></> : m.content}
                                        </div>
                                        {(m.citations || m.knowledgeGraph) && m.role === 'assistant' && (
                                            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
                                                {m.knowledgeGraph && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {m.knowledgeGraph.map((kg, kgi) => (
                                                            <div key={kgi} onClick={() => onNavigateToGraph(kg.source)} className="flex items-center text-[10px] bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2 py-1 cursor-pointer hover:bg-purple-100 hover:scale-105 transition-all shadow-sm" title="点击跳转到知识图谱">
                                                                <Network size={10} className="mr-1"/><span className="font-bold">{kg.source}</span><span className="mx-1 text-gray-400">-{kg.relation}-></span><span className="font-bold">{kg.target}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {m.citations && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {m.citations.map((c, i) => (
                                                            <button key={i} onClick={() => setCitationDrawer(c)} className={`text-[10px] border rounded px-2 py-1 flex items-center transition-colors ${c.type === 'qa' ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100'}`}>
                                                                {c.type === 'qa' ? <MessageCircle size={10} className="mr-1"/> : <BookOpen size={10} className="mr-1"/>} 
                                                                {c.title}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {canSaveQa && (
                                                    <div className="flex justify-end mt-1">
                                                        <button onClick={() => {
                                                            const userQ = sessions.find(s=>s.id===activeId)?.messages.slice(0, sessions.find(s=>s.id===activeId).messages.findIndex(msg => msg.id === m.id)).reverse().find(msg => msg.role === 'user');
                                                            setEditingQa({ question: userQ?.content.replace(/^> .*?\n\n/s, '') || '', answer: m.content });
                                                        }} className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center transition-colors">
                                                            <Save size={12} className="mr-1"/> 存入QA库
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isStreaming && <div className="text-gray-400 text-sm italic ml-4 flex items-center"><Loader2 className="animate-spin mr-2" size={14}/> 正在分析意图并检索知识库...</div>}
                        </div>
                        <div className="p-4 bg-white border-t">
                            {quoteText && (
                                <div className="mb-2 p-3 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg flex justify-between items-start animate-in slide-in-from-bottom-2">
                                    <div className="flex-1 mr-4"><div className="flex items-center text-xs font-bold text-gray-500 mb-1"><Quote size={12} className="mr-1"/> 引用内容</div><div className="text-sm text-gray-800 line-clamp-3 italic">"{quoteText}"</div></div>
                                    <button onClick={() => setQuoteText(null)} className="text-gray-400 hover:text-red-500 p-1 hover:bg-gray-200 rounded transition-colors"><X size={14}/></button>
                                </div>
                            )}
                            <div className="relative">
                                <input className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder={quoteText ? "请输入针对引用内容的追问..." : (activeSession.kbIds && activeSession.kbIds.length > 0 ? `正在向 ${(activeSession.kbIds.length) + (activeSession.qaRef?1:0)} 个知识库提问...` : "请输入问题...")} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleSend()} />
                                <button onClick={handleSend} disabled={!input.trim()} className="absolute right-3 top-3 text-blue-600 hover:text-blue-700 disabled:opacity-50"><Send size={20}/></button>
                            </div>
                        </div>
                    </>
                ) : (
                    <EmptyState icon={MessageSquare} title="暂无会话" desc="请点击左侧 + 号新建会话开始问答" action={<button onClick={createSession} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">新建会话</button>} />
                )}
                {citationDrawer && (
                    <div className="absolute inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-10 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h3 className="font-bold text-gray-800">引用详情</h3><button onClick={()=>setCitationDrawer(null)}><X size={18} className="text-gray-400"/></button></div>
                        <div className="p-4 flex-1 overflow-auto">
                            <div className="mb-4"><div className="text-xs text-gray-500 mb-1">来源</div><div className="font-bold text-blue-700 flex items-center">{citationDrawer.type === 'qa' ? <MessageCircle size={14} className="mr-1"/> : <FileText size={14} className="mr-1"/>} {citationDrawer.title}</div></div>
                            <div className="bg-yellow-50 p-3 rounded border border-yellow-100 text-sm text-gray-700 leading-relaxed italic relative"><span className="absolute top-0 left-0 text-4xl text-yellow-200 font-serif leading-none ml-1">“</span><div className="relative z-10">{citationDrawer.quote}</div><div className="mt-2 text-right text-xs text-gray-400">Page {citationDrawer.page}</div></div>
                            {citationDrawer.type !== 'qa' && <button className="w-full mt-6 flex items-center justify-center py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600"><ExternalLink size={14} className="mr-2"/> 打开原文</button>}
                        </div>
                    </div>
                )}
            </div>
            {editingQa && <QaModal initialQ={editingQa.question} initialA={editingQa.answer} onSave={handleSaveToQa} onClose={()=>setEditingQa(null)} />}
        </div>
    );
};

const KBView = ({ toast }) => {
    const [subView, setSubView] = useState('files');
    const [collections, setCollections] = useState(db.data.kbCollections);
    const [activeCol, setActiveCol] = useState<string|null>(null);
    const [files, setFiles] = useState([]);
    const [qaPairs, setQaPairs] = useState(db.data.qaPairs);
    const [qaSearch, setQaSearch] = useState('');
    const [uploading, setUploading] = useState(false);
    const [previewFile, setPreviewFile] = useState(null);
    const [editingCollection, setEditingCollection] = useState(null);
    const [editingFile, setEditingFile] = useState(null);
    const [editingQa, setEditingQa] = useState(null);
    
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => { 
        const currentUser = db.getCurrentUser();
        const allCols = db.data.kbCollections;
        const permittedCols = allCols.filter(c => hasKbPerm(currentUser, 'ref', c.id) || hasKbPerm(currentUser, 'manage', c.id));
        setCollections(permittedCols);
        
        if((!activeCol || !permittedCols.find(c => c.id === activeCol)) && permittedCols.length > 0) {
            setActiveCol(permittedCols[0].id);
        }
    }, [db.data.kbCollections]);
    
    useEffect(() => { 
        if (activeCol) {
            setFiles(db.data.kbFiles.filter(f => f.collectionId === activeCol)); 
            setSelectedFiles(new Set());
        } else {
            setFiles([]);
            setSelectedFiles(new Set());
        }
    }, [activeCol, db.data.kbFiles]);

    useEffect(() => {
        setQaPairs(db.data.qaPairs.filter(q => q.question.includes(qaSearch) || q.answer.includes(qaSearch)));
    }, [db.data.qaPairs, qaSearch]);

    const currentUser = db.getCurrentUser();
    const canManageActive = activeCol ? hasKbPerm(currentUser, 'manage', activeCol) : false;
    const canCreateCollection = hasKbPerm(currentUser, 'manage');
    const canManageQa = currentUser?.permissions.includes(PERMISSIONS.RES_QA_MANAGE);

    const handleBatchUpload = (fileList) => { 
        if(!activeCol) return toast.error("请先选择或创建一个知识集合");
        if(!canManageActive) return toast.error("无权在此集合上传文档");
        
        setUploading(true); 
        setTimeout(() => { 
            const newFiles = Array.from(fileList).map((f: any) => ({
                id: `k_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                collectionId: activeCol,
                name: f.name,
                type: f.name.split('.').pop() || 'unknown',
                size: (f.size / 1024 / 1024).toFixed(2) + 'MB',
                status: 'indexed',
                uploaded_at: new Date().toISOString()
            }));

            newFiles.forEach(file => db.saveKbFile(file));
            setFiles(prev => [...newFiles, ...prev]); 
            setUploading(false); 
            toast.success(`成功上传 ${newFiles.length} 个文档`); 
            db.logAudit(db.getCurrentUser().id, db.getCurrentUser().username, '批量上传', 'KB', `${newFiles.length} 个文件`); 
        }, 1500); 
    };

    const handleCreateCollection = (name) => {
        if (!name.trim()) return;
        const newCol = { id: editingCollection?.id, name };
        db.saveCollection(newCol);
        setEditingCollection(null);
        toast.success(editingCollection?.id ? '集合重命名成功' : '集合创建成功');
    };

    const handleDeleteCollection = (e, id) => {
        e.stopPropagation();
        if(confirm('确定删除此集合及其所有文档吗？')) {
            db.deleteCollection(id);
            setCollections(prev => prev.filter(c => c.id !== id));
            if(activeCol === id) setActiveCol(null);
            toast.success('集合已删除');
        }
    };

    const handleRenameFile = (name) => {
        if(!name.trim()) return;
        const updated = { ...editingFile, name };
        db.saveKbFile(updated);
        setFiles(files.map(f => f.id === updated.id ? updated : f));
        setEditingFile(null);
        toast.success('文档重命名成功');
    };

    const handleDeleteFile = (id) => {
        if(confirm('确定删除此文档？索引将失效。')) {
            db.deleteKbFile(id);
            setFiles(files.filter(f => f.id !== id));
            toast.success('文档已删除');
        }
    };

    const handleSaveQa = (qa) => {
        db.saveQaPair(qa);
        setQaPairs([...db.data.qaPairs]); 
        setEditingQa(null);
        toast.success('问答对已保存');
    };

    const handleDeleteQa = (id) => {
        if(confirm('确定删除此问答对？')) {
            db.deleteQaPair(id);
            setQaPairs(prev => prev.filter(q => q.id !== id));
            toast.success('问答对已删除');
        }
    };

    const toggleSelectAll = () => { if (selectedFiles.size === files.length) { setSelectedFiles(new Set()); } else { setSelectedFiles(new Set(files.map(f => f.id))); } };
    const toggleSelectOne = (id) => { const newSet = new Set(selectedFiles); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedFiles(newSet); };
    const handleBatchExport = () => { if (selectedFiles.size === 0) return; toast.success(`已开始打包下载 ${selectedFiles.size} 个文件`); };
    const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragOver(false); };
    const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { handleBatchUpload(e.dataTransfer.files); } };
    const handleFileInputChange = (e) => { if (e.target.files && e.target.files.length > 0) { handleBatchUpload(e.target.files); } e.target.value = ''; };

    const CollectionModal = ({ col, onSave, onCancel }) => { const [name, setName] = useState(col?.name || ''); return (<Modal title={col?.id ? '重命名集合' : '新建集合'} onClose={onCancel} size="sm" footer={<button onClick={() => onSave(name)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}><div><label className="block text-sm font-medium mb-1">集合名称</label><input className="w-full border rounded p-2" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div></Modal>) };
    const FileRenameModal = ({ file, onSave, onCancel }) => { const [name, setName] = useState(file?.name || ''); return (<Modal title="重命名文档" onClose={onCancel} size="sm" footer={<button onClick={() => onSave(name)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}><div><label className="block text-sm font-medium mb-1">文档名称</label><input className="w-full border rounded p-2" value={name} onChange={e=>setName(e.target.value)} autoFocus/></div></Modal>) };
    
    const QaEditorModal = ({ qa, onSave, onCancel }) => {
        const [formData, setFormData] = useState(qa || { question: '', answer: '', category: '通用' });
        return (
            <Modal title={qa ? '编辑问答对' : '新建问答对'} onClose={onCancel} footer={<button onClick={() => onSave(formData)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}>
                <div className="space-y-3">
                    <div><label className="block text-sm font-medium mb-1">问题</label><textarea className="w-full border rounded p-2 h-20" value={formData.question} onChange={e=>setFormData({...formData, question: e.target.value})} autoFocus/></div>
                    <div><label className="block text-sm font-medium mb-1">答案</label><textarea className="w-full border rounded p-2 h-32" value={formData.answer} onChange={e=>setFormData({...formData, answer: e.target.value})}/></div>
                    <div><label className="block text-sm font-medium mb-1">分类</label><input className="w-full border rounded p-2" value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})}/></div>
                </div>
            </Modal>
        )
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="h-12 border-b flex items-center px-4 space-x-1 bg-gray-50">
                <button onClick={()=>setSubView('files')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] border-b-2 ${subView==='files'?'bg-white text-blue-600 border-blue-600':'text-gray-500 border-transparent hover:text-gray-700'}`}>
                    <div className="flex items-center"><FileText size={14} className="mr-2"/> 文档管理</div>
                </button>
                {canManageQa && (
                    <button onClick={()=>setSubView('qa')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] border-b-2 ${subView==='qa'?'bg-white text-purple-600 border-purple-600':'text-gray-500 border-transparent hover:text-gray-700'}`}>
                        <div className="flex items-center"><MessageCircle size={14} className="mr-2"/> QA问答库</div>
                    </button>
                )}
            </div>

            {subView === 'files' && (
                <div className="flex-1 flex gap-0 h-full overflow-hidden">
                    <div className="w-64 bg-white border-r flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-white">
                            <span className="font-bold text-gray-700 text-xs uppercase tracking-wider">知识集合</span>
                            {canCreateCollection && (
                                <button onClick={() => setEditingCollection({})} className="p-1 hover:bg-gray-100 rounded text-gray-600" title="新建集合"><Plus size={16}/></button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {collections.map(c => {
                                const canManageThis = hasKbPerm(currentUser, 'manage', c.id);
                                return (
                                    <div key={c.id} onClick={()=>setActiveCol(c.id)} className={`group flex items-center justify-between p-3 rounded cursor-pointer text-sm ${activeCol === c.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                                        <div className="flex items-center truncate">
                                            <Folder size={16} className={`mr-2 flex-shrink-0 ${activeCol === c.id ? 'text-blue-500' : 'text-yellow-500'}`}/>
                                            <span className="truncate">{c.name}</span>
                                            {!canManageThis && <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1 rounded">只读</span>}
                                        </div>
                                        {canManageThis && (
                                            <div className="hidden group-hover:flex items-center space-x-1">
                                                <button onClick={(e) => { e.stopPropagation(); setEditingCollection(c); }} className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-blue-600"><Edit3 size={12}/></button>
                                                <button onClick={(e) => handleDeleteCollection(e, c.id)} className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-red-500"><Trash2 size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {collections.length === 0 && <div className="text-center text-gray-400 text-xs py-4">暂无可见集合</div>}
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col bg-white">
                        <div className="p-4 border-b flex justify-between items-center bg-white">
                            <div className="flex items-center">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center mr-4">
                                    {activeCol ? collections.find(c=>c.id===activeCol)?.name : '未选择集合'}
                                </h2>
                                {selectedFiles.size > 0 && (
                                    <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-2">
                                        <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">已选 {selectedFiles.size} 项</span>
                                        <button onClick={handleBatchExport} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded" title="批量导出"><Download size={18}/></button>
                                    </div>
                                )}
                            </div>
                            {canManageActive && (
                                <>
                                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileInputChange}/>
                                    <button onClick={() => fileInputRef.current.click()} disabled={uploading || !activeCol} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                        {uploading ? <Loader2 className="animate-spin mr-2"/> : <Upload size={18} className="mr-2"/>} 上传文档
                                    </button>
                                </>
                            )}
                        </div>
                        <div 
                            className={`flex-1 overflow-auto p-6 relative transition-colors ${isDragOver ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            {isDragOver && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 pointer-events-none">
                                    <CloudUpload size={64} className="text-blue-500 mb-4 animate-bounce"/>
                                    <h3 className="text-xl font-bold text-blue-600">释放文件以批量上传</h3>
                                </div>
                            )}
                            
                            {activeCol ? (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="p-3 w-10 text-center"><input type="checkbox" className="rounded cursor-pointer" checked={files.length > 0 && selectedFiles.size === files.length} onChange={toggleSelectAll}/></th>
                                            <th className="p-3">名称</th>
                                            <th className="p-3">类型</th>
                                            <th className="p-3">大小</th>
                                            <th className="p-3">状态</th>
                                            <th className="p-3 w-40">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {files.map(f => (
                                            <tr key={f.id} className={`hover:bg-gray-50 group ${selectedFiles.has(f.id) ? 'bg-blue-50/50' : ''}`}>
                                                <td className="p-3 text-center"><input type="checkbox" className="rounded cursor-pointer" checked={selectedFiles.has(f.id)} onChange={() => toggleSelectOne(f.id)}/></td>
                                                <td className="p-3 font-medium flex items-center"><FileText size={16} className="text-gray-400 mr-2"/> {f.name}</td>
                                                <td className="p-3 uppercase text-gray-500">{f.type}</td>
                                                <td className="p-3 text-gray-500">{f.size}</td>
                                                <td className="p-3"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">已索引</span></td>
                                                <td className="p-3">
                                                    <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={()=>setPreviewFile(f)} className="text-blue-600 hover:text-blue-800" title="预览"><Eye size={16}/></button>
                                                        {canManageActive && (
                                                            <>
                                                                <button onClick={()=>setEditingFile(f)} className="text-gray-500 hover:text-blue-600" title="重命名"><Edit3 size={16}/></button>
                                                                <button onClick={()=>handleDeleteFile(f.id)} className="text-gray-500 hover:text-red-600" title="删除"><Trash2 size={16}/></button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <EmptyState icon={FolderOpen} title="未选择集合" desc="请从左侧选择一个知识集合来管理文档" action={null}/>
                            )}
                            {activeCol && files.length === 0 && <EmptyState icon={FileText} title="暂无文档" desc={canManageActive ? "点击右上角上传按钮，或拖拽文件到此处" : "当前集合暂无文档"} action={null}/>}
                        </div>
                    </div>
                </div>
            )}

            {subView === 'qa' && (
                <div className="flex-1 flex flex-col bg-white animate-in fade-in">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <div className="flex items-center">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center mr-4">QA 问答库管理</h2>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-2.5 text-gray-400"/>
                                <input className="pl-9 pr-3 py-1.5 text-sm border rounded-full bg-white focus:ring-2 focus:ring-purple-200 outline-none w-64" placeholder="搜索问题或答案..." value={qaSearch} onChange={e=>setQaSearch(e.target.value)}/>
                            </div>
                        </div>
                        <button onClick={() => setEditingQa({})} className="px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center hover:bg-purple-700 shadow-sm">
                            <Plus size={18} className="mr-2"/> 新增问答对
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-6">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-purple-50 text-purple-900">
                                <tr>
                                    <th className="p-4 w-1/4">问题</th>
                                    <th className="p-4 w-1/2">答案</th>
                                    <th className="p-4">分类</th>
                                    <th className="p-4 w-32 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {qaPairs.map(qa => (
                                    <tr key={qa.id} className="hover:bg-gray-50 group">
                                        <td className="p-4 font-bold text-gray-800 align-top">{qa.question}</td>
                                        <td className="p-4 text-gray-600 align-top whitespace-pre-wrap">{qa.answer}</td>
                                        <td className="p-4 align-top"><span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">{qa.category}</span></td>
                                        <td className="p-4 align-top text-right space-x-2">
                                            <button onClick={()=>setEditingQa(qa)} className="text-blue-600 hover:underline">编辑</button>
                                            <button onClick={()=>handleDeleteQa(qa.id)} className="text-red-600 hover:underline">删除</button>
                                        </td>
                                    </tr>
                                ))}
                                {qaPairs.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center text-gray-400">
                                            <MessageCircle size={48} className="mb-4 text-gray-200 mx-auto"/>
                                            <p>暂无QA问答对</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {previewFile && (<Modal title={previewFile.name} onClose={()=>setPreviewFile(null)} footer={null}><div className="h-96 bg-gray-100 flex items-center justify-center text-gray-400 flex-col"><FileText size={48} className="mb-4"/><p>此处为文档预览区域 (Mock)</p><p className="text-xs mt-2">Page 1 / 12</p></div></Modal>)}
            {editingCollection && <CollectionModal col={editingCollection.id ? editingCollection : null} onSave={handleCreateCollection} onCancel={()=>setEditingCollection(null)} />}
            {editingFile && <FileRenameModal file={editingFile} onSave={handleRenameFile} onCancel={()=>setEditingFile(null)} />}
            {editingQa && <QaEditorModal qa={editingQa.id ? editingQa : null} onSave={handleSaveQa} onCancel={()=>setEditingQa(null)} />}
        </div>
    );
};

const SmartDocView = ({ toast }) => {
    const [view, setView] = useState('list');
    const [docs, setDocs] = useState([]);
    const [currentDoc, setCurrentDoc] = useState(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [processType, setProcessType] = useState('draft'); // draft | check | optimize
    const [selectedKbIds, setSelectedKbIds] = useState([]);
    const [kbCollections, setKbCollections] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showKbSelect, setShowKbSelect] = useState(false);

    // Editor State
    const [step, setStep] = useState(1);
    const [rightPanel, setRightPanel] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [matSearch, setMatSearch] = useState('');
    const [matCategory, setMatCategory] = useState('全部');
    const [reviewResult, setReviewResult] = useState(null);
    const [isAddingMat, setIsAddingMat] = useState(false);
    const [newMat, setNewMat] = useState({ title: '', category: '通用', content: '' });

    useEffect(() => { 
        loadDocs(); 
        setMaterials(db.data.materials);
        const currentUser = db.getCurrentUser();
        const allCols = db.data.kbCollections;
        const permittedCols = allCols.filter(c => hasKbPerm(currentUser, 'ref', c.id));
        setKbCollections(permittedCols);
    }, []);

    const loadDocs = () => setDocs(db.getDocs());
    
    const startCreate = () => { 
        setUploadedFile(null);
        setProcessType('draft');
        setSelectedKbIds([]);
        setReviewResult(null);
        setStep(1); 
        setView('create'); 
    };

    const handleFileUpload = (e) => {
        if(e.target.files && e.target.files[0]) {
            setUploadedFile(e.target.files[0]);
        }
    };

    const toggleKb = (id) => {
        if(selectedKbIds.includes(id)) setSelectedKbIds(prev => prev.filter(k => k !== id));
        else setSelectedKbIds(prev => [...prev, id]);
    };

    const handleProcess = () => {
        if (!uploadedFile) return toast.error("请先上传Word文档");
        
        setIsProcessing(true);
        setTimeout(() => {
            const fileName = uploadedFile.name.replace(/\.[^/.]+$/, "");
            let generatedContent = "";
            let mockReview = null;
            let docTitle = fileName;

            if (processType === 'draft') {
                generatedContent = `${fileName}\n\n    根据您上传的文档大纲，结合选中知识库（${selectedKbIds.length}个）与素材库资源，已为您完善公文如下：\n\n    一、背景与意义\n    随着业务的不断深入，${fileName}已成为当前工作的重点。根据相关政策法规要求，我们必须坚持系统观念，强化底线思维。\n\n    二、核心目标\n    1. 完善制度体系。\n    2. 提升执行效能。\n\n    三、具体措施\n    (一) 加强组织领导。成立专项工作组，明确责任分工。\n    (二) 强化监督检查。建立常态化督查机制，确保各项任务落到实处。\n\n    四、工作要求\n    各单位要高度重视，抓好贯彻落实。\n\n    特此通知。`;
                docTitle = `${fileName} (AI起草)`;
            } else if (processType === 'check') {
                generatedContent = `关于${fileName}的报告\n\n    当前，我们在推进工作中取得了丰功伟迹（注：疑似错别字），但也面临一些挑战。部分数据涉及绝密（注：敏感词）内容，需小心处理。\n\n    虽然时间紧迫，但是（注：语法建议）我们依然按时完成了任务。`;
                docTitle = `${fileName} (已检查)`;
                mockReview = {
                    typos: [{ id: 1, text: '丰功伟迹', suggestion: '丰功伟绩', context: '...取得了丰功伟迹...' }],
                    sensitive: [{ id: 2, text: '绝密', suggestion: '机密/敏感', context: '...涉及绝密内容...' }],
                    grammar: [{ id: 3, text: '虽然...但是', suggestion: '建议删去“但是”', context: '虽然...，但是...' }]
                };
            } else if (processType === 'optimize') {
                generatedContent = `${fileName}\n\n    【优化版本】\n\n    针对原稿内容，结合知识库政策精神，优化如下：\n\n    一、总体要求\n    深入贯彻新发展理念，加快构建新发展格局。以${fileName}为抓手，全面提升治理现代化水平。\n\n    二、重点任务\n    聚焦关键环节，补齐短板弱项。特别是要利用数字化手段，赋能业务流程再造。\n\n    三、保障措施\n    加大资源投入，强化人才支撑。`;
                docTitle = `${fileName} (AI优化)`;
            }

            const newDoc = { 
                id: `d_${Date.now()}`, 
                creatorId: db.getCurrentUser().id, 
                title: docTitle, 
                type: 'AI生成', 
                status: 'draft', 
                content: generatedContent, 
                urgency: '平件', 
                security: '内部', 
                updated_at: new Date().toISOString() 
            };
            
            db.saveDoc(newDoc);
            setCurrentDoc(newDoc);
            if (mockReview) {
                setReviewResult(mockReview);
                setRightPanel('review'); 
            } else {
                setRightPanel(null);
            }
            
            setStep(3);
            setIsProcessing(false);
            db.logAudit(db.getCurrentUser().id, db.getCurrentUser().username, '智能公文处理', 'SmartDoc', `${processType} - ${fileName}`);
        }, 2000);
    };

    const saveDoc = () => { if(!currentDoc) return; const updated = { ...currentDoc, updated_at: new Date().toISOString() }; db.saveDoc(updated); toast.success('公文已保存'); loadDocs(); };
    const insertText = (text) => { if(currentDoc) { setCurrentDoc({ ...currentDoc, content: currentDoc.content + '\n' + text }); toast.success('已插入光标处'); } };
    const handleSaveMaterial = () => { if(!newMat.title || !newMat.content) return toast.error("标题和内容必填"); db.saveMaterial(newMat); setMaterials([...db.data.materials]); setIsAddingMat(false); setNewMat({ title: '', category: '通用', content: '' }); toast.success("素材已添加"); };
    const handleDeleteMaterial = (e, id) => { e.stopPropagation(); if(confirm('删除此素材？')) { db.deleteMaterial(id); setMaterials([...db.data.materials]); toast.success("已删除"); } };

    if(view === 'list') return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50"><h2 className="text-lg font-bold text-gray-800">我的公文箱</h2><button onClick={startCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center hover:bg-blue-700 shadow-sm"><Sparkles size={18} className="mr-2"/> 智能公文处理</button></div>
            <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-4">标题</th><th className="p-4">类型</th><th className="p-4">密级</th><th className="p-4">状态</th><th className="p-4">更新时间</th><th className="p-4">操作</th></tr></thead><tbody className="divide-y">{docs.map(d => (<tr key={d.id} className="hover:bg-gray-50 group"><td className="p-4 font-medium text-gray-800 cursor-pointer hover:text-blue-600" onClick={()=>{setCurrentDoc(d); setStep(3); setView('create');}}>{d.title}</td><td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{d.type}</span></td><td className="p-4 text-gray-500">{d.security}</td><td className="p-4"><span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">草稿</span></td><td className="p-4 text-gray-500">{new Date(d.updated_at).toLocaleString()}</td><td className="p-4"><button onClick={()=>{setCurrentDoc(d); setStep(3); setView('create');}} className="text-blue-600 hover:underline">编辑</button></td></tr>))}</tbody></table>{docs.length === 0 && <EmptyState icon={FileText} title="暂无公文" desc="快去上传或创建一个吧" action={null}/>}</div>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="h-16 border-b flex items-center justify-between px-4 bg-gray-50 shrink-0">
                <div className="flex items-center space-x-3">
                    <button onClick={()=>{setView('list'); loadDocs();}} className="p-2 hover:bg-gray-200 rounded text-gray-500"><ChevronRight size={20} className="rotate-180"/></button>
                    <div className="flex flex-col">
                        <span className="font-bold text-gray-800 text-sm">{step === 1 ? '公文智能处理配置' : currentDoc?.title}</span>
                        {step === 3 && <span className="text-[10px] text-gray-500 bg-yellow-100 px-1 rounded w-fit">AI 辅助编辑中</span>}
                    </div>
                </div>
                {step === 3 && (
                    <div className="flex items-center space-x-2">
                        <button onClick={()=>setRightPanel(rightPanel==='material' ? null : 'material')} className={`p-2 rounded ${rightPanel==='material'?'bg-blue-100 text-blue-600':'hover:bg-gray-200 text-gray-600'}`} title="素材库"><BookOpen size={18}/></button>
                        <button onClick={()=>setRightPanel(rightPanel==='review' ? null : 'review')} className={`p-2 rounded ${rightPanel==='review'?'bg-blue-100 text-blue-600':'hover:bg-gray-200 text-gray-600'}`} title="智能审查结果"><FileCheck size={18}/></button>
                        <div className="h-6 w-px bg-gray-300 mx-1"></div>
                        <button onClick={saveDoc} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 shadow-sm flex items-center"><Save size={16} className="mr-1"/> 保存</button>
                    </div>
                )}
            </div>
            
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
                    
                    {step === 1 && (
                        <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm h-fit space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><CloudUpload size={32}/></div>
                                <h2 className="text-2xl font-bold text-gray-800">智能公文处理中心</h2>
                                <p className="text-gray-500 mt-2 text-sm">上传 Word 文档，AI 将协助您完成起草、检查与优化</p>
                            </div>

                            <div className="space-y-6">
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${uploadedFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}`}>
                                    <input type="file" accept=".docx,.doc" onChange={handleFileUpload} className="hidden" id="doc-upload"/>
                                    <label htmlFor="doc-upload" className="cursor-pointer block w-full h-full">
                                        {uploadedFile ? (
                                            <div className="flex flex-col items-center text-green-700">
                                                <FileText size={48} className="mb-2"/>
                                                <span className="font-bold text-lg">{uploadedFile.name}</span>
                                                <span className="text-xs mt-1">{(uploadedFile.size/1024).toFixed(1)} KB - 点击更换</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center text-gray-500">
                                                <Upload size={32} className="mb-2"/>
                                                <span className="font-medium">点击上传或拖拽 Word 文档至此</span>
                                                <span className="text-xs mt-1 text-gray-400">支持 .docx, .doc 格式</span>
                                            </div>
                                        )}
                                    </label>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { id: 'draft', label: '起草公文', icon: PenTool, desc: '基于大纲与知识库' },
                                        { id: 'check', label: '检查公文', icon: ShieldAlert, desc: '错别字与敏感词检测' },
                                        { id: 'optimize', label: '优化公文', icon: Sparkles, desc: '内容润色与提升' }
                                    ].map(action => (
                                        <div 
                                            key={action.id} 
                                            onClick={() => setProcessType(action.id)}
                                            className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col items-center text-center ${processType === action.id ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                                        >
                                            <action.icon size={24} className="mb-2"/>
                                            <div className="font-bold text-sm">{action.label}</div>
                                            <div className="text-[10px] opacity-70 mt-1">{action.desc}</div>
                                        </div>
                                    ))}
                                </div>

                                {(processType === 'draft' || processType === 'optimize') && (
                                    <div className="relative">
                                        <label className="block text-sm font-bold text-gray-700 mb-2">引用知识库资源 <span className="text-xs font-normal text-gray-400">(可选)</span></label>
                                        <div className="border rounded-lg p-3 bg-white flex justify-between items-center cursor-pointer hover:border-blue-400" onClick={() => setShowKbSelect(!showKbSelect)}>
                                            <div className="flex flex-wrap gap-1">
                                                {selectedKbIds.length > 0 ? (
                                                    selectedKbIds.map(id => {
                                                        const kb = kbCollections.find(k => k.id === id);
                                                        return kb ? <span key={id} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs flex items-center">{kb.name} <X size={10} className="ml-1 hover:text-red-500" onClick={(e)=>{e.stopPropagation(); toggleKb(id);}}/></span> : null;
                                                    })
                                                ) : <span className="text-gray-400 text-sm">选择关联的知识集合...</span>}
                                            </div>
                                            <ChevronDown size={16} className="text-gray-400"/>
                                        </div>
                                        {showKbSelect && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setShowKbSelect(false)}></div>
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                                                    {kbCollections.map(kb => (
                                                        <div key={kb.id} className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0" onClick={() => toggleKb(kb.id)}>
                                                            <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center ${selectedKbIds.includes(kb.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                                                {selectedKbIds.includes(kb.id) && <Check size={10} className="text-white"/>}
                                                            </div>
                                                            <span className="text-sm text-gray-700">{kb.name}</span>
                                                        </div>
                                                    ))}
                                                    {kbCollections.length === 0 && <div className="p-3 text-sm text-gray-400 text-center">暂无可用知识库</div>}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                <button 
                                    onClick={handleProcess} 
                                    disabled={!uploadedFile || isProcessing}
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                >
                                    {isProcessing ? <><Loader2 className="animate-spin mr-2"/> 正在智能处理中...</> : '开始处理'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && currentDoc && (
                        <div className="w-[800px] h-full bg-white shadow-sm flex flex-col animate-in fade-in duration-300">
                            <textarea 
                                className="flex-1 w-full p-16 resize-none outline-none font-serif text-lg leading-loose text-gray-800" 
                                value={currentDoc.content} 
                                placeholder="内容生成中..." 
                                onChange={(e) => setCurrentDoc({...currentDoc, content: e.target.value})}
                            />
                        </div>
                    )}
                </div>

                {step === 3 && rightPanel && (
                    <div className="w-80 bg-white border-l shadow-xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <span className="font-bold text-gray-700 flex items-center">
                                {rightPanel === 'material' && <><BookOpen size={16} className="mr-2"/> 素材库</>}
                                {rightPanel === 'review' && <><FileCheck size={16} className="mr-2"/> 智能审查结果</>}
                            </span>
                            <button onClick={()=>setRightPanel(null)}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-4">
                            {rightPanel === 'material' && (!isAddingMat ? <><div className="flex justify-between items-center mb-2"><div className="relative flex-1 mr-2"><input className="w-full border rounded pl-8 pr-2 py-2 text-sm" placeholder="搜索素材..." value={matSearch} onChange={e=>setMatSearch(e.target.value)}/><Search size={14} className="absolute left-2.5 top-3 text-gray-400"/></div><button onClick={()=>setIsAddingMat(true)} className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100"><Plus size={16}/></button></div><div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">{['全部','开头','结尾','过渡','政策'].map(cat => (<button key={cat} onClick={()=>setMatCategory(cat)} className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border ${matCategory===cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{cat}</button>))}</div><div className="space-y-3">{materials.filter(m => (matCategory === '全部' || m.category === matCategory) && m.title.includes(matSearch)).map(m => (<div key={m.id} className="p-3 border rounded hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 relative" onClick={()=>insertText(m.content)}><div className="font-bold text-gray-700 text-xs mb-1 flex justify-between">{m.title}<div className="flex items-center space-x-1"><span className="text-[10px] text-gray-400 bg-white px-1 border rounded">{m.category}</span><Trash2 size={12} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={(e)=>handleDeleteMaterial(e, m.id)}/></div></div><div className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{m.content}</div><div className="mt-2 text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-bold text-right">点击插入 +</div></div>))}</div></> : <div className="bg-gray-50 p-4 rounded border"><h4 className="font-bold text-gray-700 mb-3 text-sm">新增素材</h4><div className="space-y-3"><div><label className="block text-xs text-gray-500 mb-1">标题</label><input className="w-full border rounded p-2 text-sm" value={newMat.title} onChange={e=>setNewMat({...newMat, title: e.target.value})}/></div><div><label className="block text-xs text-gray-500 mb-1">分类</label><select className="w-full border rounded p-2 text-sm" value={newMat.category} onChange={e=>setNewMat({...newMat, category: e.target.value})}>{['开头','结尾','过渡','政策','通用'].map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs text-gray-500 mb-1">内容</label><textarea className="w-full border rounded p-2 text-sm h-24" value={newMat.content} onChange={e=>setNewMat({...newMat, content: e.target.value})}/></div><div className="flex gap-2 pt-2"><button onClick={handleSaveMaterial} className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm">保存</button><button onClick={()=>setIsAddingMat(false)} className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-sm">取消</button></div></div></div>)}
                            
                            {rightPanel === 'review' && (!reviewResult ? <div className="text-center py-10 text-gray-400 flex flex-col items-center"><CheckCircle size={32} className="mb-2 text-gray-300"/><p>暂无审查结果</p><p className="text-xs mt-1">请尝试使用“检查公文”功能</p></div> : <>
                                <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-800 mb-4 flex items-center"><AlertTriangle size={14} className="mr-2"/> 检测到 {reviewResult.typos.length + reviewResult.sensitive.length + reviewResult.grammar.length} 个潜在问题</div>
                                {reviewResult.typos.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2">错别字 / 拼写</div>}
                                {reviewResult.typos.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-red-50 border-red-100"><div className="text-xs text-gray-500 mb-1">原文：{item.context}</div><div className="flex justify-between items-center"><span className="text-sm font-bold text-red-600 line-through mr-2">{item.text}</span><span className="text-sm font-bold text-green-600">{item.suggestion}</span><button className="text-xs bg-white border px-2 py-1 rounded text-gray-600 hover:text-blue-600" onClick={()=>toast.success('已修正')}>采纳</button></div></div>))}
                                {reviewResult.sensitive.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">敏感词 / 合规性</div>}
                                {reviewResult.sensitive.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-orange-50 border-orange-100"><div className="text-xs text-gray-500 mb-1">建议修改：{item.text}</div><div className="text-sm font-bold text-orange-700">{item.suggestion}</div></div>))}
                                {reviewResult.grammar.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">语法建议</div>}
                                {reviewResult.grammar.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-blue-50 border-blue-100"><div className="text-xs text-gray-500 mb-1">上下文：{item.context}</div><div className="text-sm font-bold text-blue-700">{item.suggestion}</div></div>))}
                            </>)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const UserManagementView = ({ toast }) => {
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

const GraphView = ({ toast, focusNodeId }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);

    const sim = useRef({
        nodes: [],
        links: [],
        camera: { x: 0, y: 0, k: 1, targetX: 0, targetY: 0, targetK: 1 },
        dragging: null,
        dragStart: null as any,
        hover: null,
        selected: null,
        width: 0,
        height: 0,
        lastTime: 0
    }).current;

    useEffect(() => {
        const coreNodes = [
            { id: '数据安全', group: 1, val: 25 },
            { id: '数字政府', group: 1, val: 30 },
            { id: '分类分级', group: 2, val: 18 },
            { id: '以人民为中心', group: 3, val: 18 },
            { id: '系统观念', group: 3, val: 15 },
            { id: '数据安全法', group: 2, val: 20 },
            { id: '个人信息保护', group: 2, val: 18 },
            { id: '国家安全', group: 1, val: 22 },
            { id: '风险评估', group: 2, val: 12 },
            { id: '应急响应', group: 4, val: 12 },
            { id: '云平台', group: 4, val: 15 },
            { id: '大数据', group: 4, val: 16 },
            { id: '人工智能', group: 4, val: 20 },
            { id: '一网通办', group: 3, val: 16 },
            { id: '跨省通办', group: 3, val: 14 },
            { id: '电子证照', group: 3, val: 12 }
        ];

        const links = [
            { source: '数据安全', target: '分类分级' }, { source: '数据安全', target: '数据安全法' },
            { source: '数据安全', target: '个人信息保护' }, { source: '数据安全', target: '风险评估' },
            { source: '数字政府', target: '以人民为中心' }, { source: '数字政府', target: '系统观念' },
            { source: '数字政府', target: '云平台' }, { source: '数字政府', target: '大数据' },
            { source: '数字政府', target: '一网通办' }, { source: '分类分级', target: '数据安全法' },
            { source: '分类分级', target: '国家安全' }, { source: '国家安全', target: '数据安全' },
            { source: '应急响应', target: '数据安全' }, { source: '人工智能', target: '大数据' },
            { source: '人工智能', target: '数字政府' }, { source: '一网通办', target: '电子证照' },
            { source: '一网通办', target: '跨省通办' }
        ];

        sim.nodes = coreNodes.map(n => ({
            ...n,
            x: Math.random() * 800 - 400,
            y: Math.random() * 600 - 300,
            vx: 0, vy: 0,
            fixed: false
        }));

        sim.links = links.map(l => ({
            source: sim.nodes.find(n => n.id === l.source),
            target: sim.nodes.find(n => n.id === l.target)
        })).filter(l => l.source && l.target);

    }, []);

    useEffect(() => {
        if (focusNodeId) {
            const node = sim.nodes.find(n => n.id === focusNodeId);
            if (node) {
                sim.selected = node;
                setSelectedNodeId(node.id);
                sim.camera.targetX = -node.x * sim.camera.targetK;
                sim.camera.targetY = -node.y * sim.camera.targetK;
            }
        }
    }, [focusNodeId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;

        const resize = () => {
            if (containerRef.current) {
                const { clientWidth: w, clientHeight: h } = containerRef.current;
                sim.width = w;
                sim.height = h;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                canvas.style.width = `${w}px`;
                canvas.style.height = `${h}px`;
                ctx.scale(dpr, dpr);
                if(sim.camera.x === 0 && sim.camera.y === 0) {
                     sim.camera.x = w / 2; sim.camera.y = h / 2;
                     sim.camera.targetX = w / 2; sim.camera.targetY = h / 2;
                }
            }
        };
        window.addEventListener('resize', resize);
        resize();

        const render = (time) => {
            const dt = Math.min((time - sim.lastTime) / 1000, 0.05);
            sim.lastTime = time;

            sim.camera.x += (sim.camera.targetX - sim.camera.x) * 0.1;
            sim.camera.y += (sim.camera.targetY - sim.camera.y) * 0.1;
            sim.camera.k += (sim.camera.targetK - sim.camera.k) * 0.1;

            for (let i = 0; i < sim.nodes.length; i++) {
                for (let j = i + 1; j < sim.nodes.length; j++) {
                    const n1 = sim.nodes[i];
                    const n2 = sim.nodes[j];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const distSq = dx * dx + dy * dy + 1;
                    const f = 5000 / distSq;
                    const dist = Math.sqrt(distSq);
                    const fx = (dx / dist) * f;
                    const fy = (dy / dist) * f;
                    if (!n1.fixed && n1 !== sim.dragging) { n1.vx += fx; n1.vy += fy; }
                    if (!n2.fixed && n2 !== sim.dragging) { n2.vx -= fx; n2.vy -= fy; }
                }
            }
            for (const link of sim.links) {
                const n1 = link.source;
                const n2 = link.target;
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const force = (dist - 150) * 0.05;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                if (!n1.fixed && n1 !== sim.dragging) { n1.vx += fx; n1.vy += fy; }
                if (!n2.fixed && n2 !== sim.dragging) { n2.vx -= fx; n2.vy -= fy; }
            }
            for (const n of sim.nodes) {
                if (!n.fixed && n !== sim.dragging) {
                    n.vx -= n.x * 0.002;
                    n.vy -= n.y * 0.002;
                    n.vx *= 0.9;
                    n.vy *= 0.9;
                    n.x += n.vx;
                    n.y += n.vy;
                }
            }

            const w = sim.width;
            const h = sim.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.translate(sim.camera.x - w/2, sim.camera.y - h/2);
            ctx.setTransform(sim.camera.k * (window.devicePixelRatio||1), 0, 0, sim.camera.k * (window.devicePixelRatio||1), sim.camera.x * (window.devicePixelRatio||1), sim.camera.y * (window.devicePixelRatio||1));

            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1 / sim.camera.k;
            ctx.beginPath();
            const gridSize = 100;
            const viewL = (-sim.camera.x) / sim.camera.k - w/sim.camera.k;
            const viewR = (-sim.camera.x) / sim.camera.k + w/sim.camera.k + w;
            const viewT = (-sim.camera.y) / sim.camera.k - h/sim.camera.k;
            const viewB = (-sim.camera.y) / sim.camera.k + h/sim.camera.k + h;
            for (let x = Math.floor(viewL/gridSize)*gridSize; x < viewR; x += gridSize) { ctx.moveTo(x, viewT); ctx.lineTo(x, viewB); }
            for (let y = Math.floor(viewT/gridSize)*gridSize; y < viewB; y += gridSize) { ctx.moveTo(viewL, y); ctx.lineTo(viewR, y); }
            ctx.globalAlpha = 0.2;
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            for (const link of sim.links) {
                const isHighlight = sim.selected && (sim.selected === link.source || sim.selected === link.target);
                ctx.beginPath();
                ctx.moveTo(link.source.x, link.source.y);
                ctx.lineTo(link.target.x, link.target.y);
                ctx.strokeStyle = isHighlight ? '#38bdf8' : '#334155';
                ctx.lineWidth = (isHighlight ? 2 : 1) / sim.camera.k;
                ctx.globalAlpha = isHighlight ? 0.8 : 0.4;
                ctx.stroke();
                
                if (true) {
                    const offset = (time / 1000 * 60 + (link.source.x+link.target.y)) % 100;
                    const t = offset / 100;
                    const px = link.source.x + (link.target.x - link.source.x) * t;
                    const py = link.source.y + (link.target.y - link.source.y) * t;
                    ctx.beginPath();
                    ctx.arc(px, py, 3 / sim.camera.k, 0, Math.PI * 2);
                    ctx.fillStyle = '#0ea5e9';
                    ctx.globalAlpha = 1;
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1.0;

            for (const n of sim.nodes) {
                const isHover = n === sim.hover;
                const isSelected = n === sim.selected;
                if (isSelected) {
                     ctx.beginPath();
                     ctx.arc(n.x, n.y, n.val + 10 + Math.sin(time/200)*5, 0, Math.PI * 2);
                     ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
                     ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.val, 0, Math.PI * 2);
                if (n.group === 1) ctx.fillStyle = '#3b82f6';
                else if (n.group === 2) ctx.fillStyle = '#10b981';
                else if (n.group === 3) ctx.fillStyle = '#f59e0b';
                else ctx.fillStyle = '#8b5cf6';
                ctx.fill();
                ctx.strokeStyle = n.fixed ? '#ef4444' : (isSelected ? '#fff' : '#cbd5e1');
                ctx.lineWidth = (n.fixed || isSelected ? 3 : 1) / sim.camera.k;
                ctx.stroke();
                if (sim.camera.k > 0.5 || isSelected || isHover) {
                    ctx.fillStyle = '#f8fafc';
                    ctx.font = `${isSelected ? 'bold ' : ''}${12 / sim.camera.k}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(n.id, n.x, n.y + n.val + 10/sim.camera.k);
                }
            }
            ctx.restore();
            animationId = requestAnimationFrame(render);
        };
        animationId = requestAnimationFrame(render);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, []);

    const getWorldPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - sim.camera.x) / sim.camera.k;
        const worldY = (screenY - sim.camera.y) / sim.camera.k;
        return { x: worldX, y: worldY };
    };

    const handleMouseDown = (e) => {
        const pos = getWorldPos(e);
        const hitNode = sim.nodes.find(n => {
            const dx = n.x - pos.x;
            const dy = n.y - pos.y;
            return Math.sqrt(dx*dx + dy*dy) < n.val + 5/sim.camera.k;
        });

        if (hitNode) {
            sim.dragging = hitNode;
            sim.dragging.fixed = true;
            sim.selected = hitNode;
            setSelectedNodeId(hitNode.id);
        } else {
            sim.dragging = 'camera';
            sim.dragStart = { x: e.clientX, y: e.clientY, camX: sim.camera.x, camY: sim.camera.y };
        }
    };

    const handleMouseMove = (e) => {
        const pos = getWorldPos(e);
        const hitNode = sim.nodes.find(n => {
            const dx = n.x - pos.x;
            const dy = n.y - pos.y;
            return Math.sqrt(dx*dx + dy*dy) < n.val + 5/sim.camera.k;
        });
        sim.hover = hitNode || null;
        canvasRef.current.style.cursor = hitNode ? 'pointer' : (sim.dragging === 'camera' ? 'grabbing' : 'default');

        if (sim.dragging && sim.dragging !== 'camera') {
            sim.dragging.x = pos.x;
            sim.dragging.y = pos.y;
            sim.dragging.vx = 0; sim.dragging.vy = 0;
        } else if (sim.dragging === 'camera') {
            const dx = e.clientX - sim.dragStart.x;
            const dy = e.clientY - sim.dragStart.y;
            sim.camera.x = sim.dragStart.camX + dx;
            sim.camera.y = sim.dragStart.camY + dy;
            sim.camera.targetX = sim.camera.x;
            sim.camera.targetY = sim.camera.y;
        }
    };

    const handleMouseUp = () => { sim.dragging = null; };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const newK = Math.min(Math.max(0.1, sim.camera.k + delta), 5);
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWorldPos(e);
        sim.camera.targetK = newK;
        sim.camera.targetX = screenX - worldPos.x * newK;
        sim.camera.targetY = screenY - worldPos.y * newK;
    };

    return (
        <div ref={containerRef} className="h-full w-full bg-[#020617] relative overflow-hidden flex shadow-inner">
            <canvas ref={canvasRef} className="block outline-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} />
            <div className={`absolute top-4 right-4 w-80 bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-200 p-6 rounded-xl shadow-2xl transition-all duration-300 transform ${selectedNodeId ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}>
                <div className="flex justify-between items-start mb-4"><h3 className="text-xl font-bold text-white flex items-center"><Share2 size={20} className="mr-2 text-blue-400"/>{selectedNodeId}</h3><button onClick={() => { sim.selected = null; setSelectedNodeId(null); }} className="text-slate-400 hover:text-white"><X size={18}/></button></div>
                <div className="space-y-4">
                    <div className="p-3 bg-slate-800 rounded border border-slate-700"><div className="text-xs text-slate-400 uppercase font-bold mb-1">操作指南</div><div className="text-xs text-gray-400 space-y-1"><div className="flex items-center"><MousePointer2 size={12} className="mr-2"/> 拖拽节点可固定位置 (红色描边)</div><div className="flex items-center"><MapPin size={12} className="mr-2"/> 当前节点已锁定，再次拖动更新位置</div></div></div>
                    <div className="pt-2 border-t border-slate-700">{sim.selected && sim.selected.fixed ? (<button onClick={() => { sim.selected.fixed = false; }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm transition-all flex items-center justify-center"><Zap size={14} className="mr-2 text-yellow-400"/> 解除固定 (Unpin)</button>) : (<div className="text-center text-xs text-gray-500 italic">节点自由浮动中</div>)}</div>
                </div>
            </div>
            <div className="absolute top-4 left-4 flex space-x-2 pointer-events-none">
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-cyan-400 text-xs px-3 py-1 rounded font-mono flex items-center"><Activity size={12} className="mr-2 animate-pulse"/>LIVE</div>
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-purple-400 text-xs px-3 py-1 rounded font-mono">SIM: ACTIVE</div>
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-emerald-400 text-xs px-3 py-1 rounded font-mono flex items-center"><Navigation size={12} className="mr-2"/>CAM: {sim.camera.k.toFixed(2)}x</div>
            </div>
        </div>
    );
};

const AuditLogView = () => {
    const [logs, setLogs] = useState(db.data.auditLogs);
    const [filterUser, setFilterUser] = useState('');
    const [filterModule, setFilterModule] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const filteredLogs = db.data.auditLogs.filter(log => {
        const matchUser = !filterUser || log.user.toLowerCase().includes(filterUser.toLowerCase());
        const matchModule = !filterModule || log.module.toLowerCase().includes(filterModule.toLowerCase());
        
        let matchTime = true;
        const logTime = new Date(log.time).getTime();
        
        if (startDate) {
            const start = new Date(startDate).getTime();
            if (logTime < start) matchTime = false;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (logTime > end.getTime()) matchTime = false;
        }

        return matchUser && matchModule && matchTime;
    });

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
                <div className="font-bold text-gray-700 flex items-center"><ShieldAlert size={18} className="mr-2"/> 系统审计日志</div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <User size={14} className="text-gray-400"/>
                        <input className="text-xs outline-none w-24 bg-transparent" placeholder="筛选用户..." value={filterUser} onChange={e=>setFilterUser(e.target.value)}/>
                    </div>
                    <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <LayoutDashboard size={14} className="text-gray-400"/>
                        <input className="text-xs outline-none w-24 bg-transparent" placeholder="筛选模块..." value={filterModule} onChange={e=>setFilterModule(e.target.value)}/>
                    </div>
                    <div className="flex items-center space-x-1 text-xs text-gray-600 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <Calendar size={14} className="text-gray-400 mr-1"/>
                        <input type="date" className="outline-none bg-transparent w-24" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
                        <span className="text-gray-400">-</span>
                        <input type="date" className="outline-none bg-transparent w-24" value={endDate} onChange={e=>setEndDate(e.target.value)}/>
                    </div>
                    <button onClick={() => { setFilterUser(''); setFilterModule(''); setStartDate(''); setEndDate(''); }} className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors">重置筛选</button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-4 whitespace-nowrap font-semibold">时间</th>
                            <th className="p-4 whitespace-nowrap font-semibold">用户</th>
                            <th className="p-4 whitespace-nowrap font-semibold">模块</th>
                            <th className="p-4 whitespace-nowrap font-semibold">动作</th>
                            <th className="p-4 font-semibold">详情</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredLogs.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="p-4 text-gray-500 whitespace-nowrap font-mono text-xs">{new Date(l.time).toLocaleString()}</td>
                                <td className="p-4 font-medium text-gray-800">{l.user}</td>
                                <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs border border-gray-200">{l.module}</span></td>
                                <td className="p-4 font-medium text-blue-700">{l.action}</td>
                                <td className="p-4 text-gray-500 text-xs truncate max-w-md group-hover:text-gray-700" title={l.detail}>{l.detail}</td>
                            </tr>
                        ))}
                        {filteredLogs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-gray-400 flex flex-col items-center justify-center w-full">
                                    <Search size={48} className="mb-4 text-gray-200"/>
                                    <p>没有符合筛选条件的日志记录</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-end items-center px-4">
               <span className="mr-4">当前展示 {filteredLogs.length} 条</span>
               <span>共 {db.data.auditLogs.length} 条总记录</span>
            </div>
        </div>
    );
};

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