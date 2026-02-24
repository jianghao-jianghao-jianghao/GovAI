/**
 * GovAI 前端 API — 统一出口
 * 所有视图只需 import from '../api' 即可
 */

// 基础客户端
export { setToken, getToken, clearToken, api, API_BASE } from "./client";
export type { ApiResponse } from "./client";

// 认证
export {
  apiLogin,
  apiLogout,
  apiGetProfile,
  apiRefreshToken,
  normalizeUser,
} from "./auth";
export type { AppUser, BackendUser } from "./auth";

// 聊天
export {
  apiListSessions,
  apiCreateSession,
  apiGetSession,
  apiUpdateSession,
  apiDeleteSession,
  apiSendMessage,
} from "./chat";
export type {
  ChatSession,
  ChatMessage,
  SessionDetail,
  SSECallbacks,
  ReasoningStep,
} from "./chat";

// 知识库 + QA
export {
  apiListCollections,
  apiCreateCollection,
  apiUpdateCollection,
  apiDeleteCollection,
  apiListFiles,
  apiUploadFiles,
  apiRenameFile,
  apiDeleteFile,
  apiGetFileIndexingStatus,
  apiBatchExportFiles,
  apiGetFileMarkdown,
  apiExtractGraphForFile,
  formatFileSize,
  apiListQaPairs,
  apiSaveQaPair,
  apiUpdateQaPair,
  apiDeleteQaPair,
} from "./kb";
export type { KBCollection, KBFile, QAPair } from "./kb";

// 公文管理
export {
  apiListDocuments,
  apiGetDocument,
  apiCreateDocument,
  apiUpdateDocument,
  apiDeleteDocument,
  apiArchiveDocument,
  apiImportDocument,
  apiExportDocuments,
  apiDownloadDocumentSource,
  apiProcessDocument,
  apiAiProcess,
  apiListDocVersions,
  apiGetDocVersion,
  apiRestoreDocVersion,
  apiExportFormattedDocx,
  apiExportFormattedPdf,
  apiListMaterials,
  apiCreateMaterial,
  apiUpdateMaterial,
  apiDeleteMaterial,
  DOC_STATUS_MAP,
  DOC_TYPE_MAP,
  SECURITY_MAP,
  URGENCY_MAP,
} from "./documents";
export type {
  DocListItem,
  DocDetail,
  ProcessResult,
  DocVersion,
  Material,
  AiProcessChunk,
} from "./documents";

// 用户 & 角色
export {
  apiListUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiListRoles,
  apiCreateRole,
  apiUpdateRole,
  apiDeleteRole,
} from "./users";
export type { UserListItem, RoleItem } from "./users";

// 审计
export { apiListAuditLogs, apiExportAuditLogs } from "./audit";
export type { AuditLogItem } from "./audit";

// 敏感词
export {
  apiListRules,
  apiCreateRule,
  apiUpdateRule,
  apiDeleteRule,
  apiCheckSensitive,
} from "./sensitive";
export type { SensitiveRule } from "./sensitive";

// 知识图谱
export {
  apiGetGraphNodes,
  apiGetGraphEdges,
  apiGetSubgraph,
  apiSearchGraphNodes,
  apiExtractEntities,
} from "./graph";
export type { GraphNode, GraphEdge } from "./graph";
