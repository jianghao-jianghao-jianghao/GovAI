
// --- 权限定义 (Permission Keys) ---
export const PERMISSIONS = {
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
export const PERMISSION_META = [
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
