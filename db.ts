
import { PERMISSIONS } from './constants';

// Check if user has permission for a specific scope type (manage or ref) on a collection
export const hasKbPerm = (user, type: 'manage' | 'ref', colId?: string) => {
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
export class PersistentMockDB {
  data: any;
  STORAGE_KEY = 'govai_mock_db_v13_refactored';

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
        { id: 'd1', creatorId: 'u1', title: '2024年信息化工作总结', type: '汇报', status: '已归档', content: '关于2024年信息化建设工作的汇报...', urgency: '平件', security: '公开', updated_at: '2024-03-20T10:00:00Z' },
        { id: 'd2', creatorId: 'u1', title: '关于网络安全周的请示', type: '请示', status: '草稿', content: '关于开展网络安全宣传周活动的请示...', urgency: '急件', security: '内部', updated_at: '2024-03-25T14:30:00Z' }
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
  deleteDoc(id) {
    this.data.docs = this.data.docs.filter(d => d.id !== id);
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

export const db = new PersistentMockDB();
