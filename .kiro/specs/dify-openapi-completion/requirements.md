# Requirements Document

## Introduction

本文档定义 GovAI 智政系统中 **后端↔Dify 集成 API** 的 OpenAPI 规范完善需求。当前 OpenAPI 文档（`后端-Dify-API-OpenAPI.json`）仅包含部分 Dataset 和 Document 接口，缺失 Workflow、Chat、Retrieval 等核心功能的完整定义。

本需求旨在补全 OpenAPI 规范，确保：
1. 覆盖所有已实现的后端功能
2. 提供完整的请求/响应数据模型
3. 包含必要的错误处理和边界情况
4. 符合一个月开发周期的实际约束

## Glossary

- **OpenAPI**: RESTful API 的标准化描述规范（OpenAPI 3.0.1）
- **Dify**: AI 引擎平台，提供知识库、工作流、对话等能力
- **Dataset**: Dify 知识库数据集
- **Document**: 知识库中的文档
- **Workflow**: Dify 工作流（公文起草/审查/优化）
- **Chat**: RAG 问答对话接口
- **SSE**: Server-Sent Events，服务器推送事件流
- **Schema**: OpenAPI 数据模型定义
- **Component**: OpenAPI 可复用组件（schemas/responses/parameters）

## Requirements

### Requirement 1: 完善 Dataset API 定义

**User Story:** 作为 API 使用者，我想要完整的知识库管理接口定义，以便正确调用和理解 Dataset 相关功能。

#### Acceptance Criteria

1. WHEN 查看 OpenAPI 文档 THEN THE System SHALL 包含所有 Dataset 相关接口的完整定义
2. WHEN 查看 Dataset 接口 THEN THE System SHALL 提供完整的请求/响应 Schema 定义
3. WHEN 调用 Dataset 接口失败 THEN THE System SHALL 返回标准化的错误响应格式
4. THE System SHALL 定义 Dataset 相关的所有数据模型（CreateDatasetRequest, DatasetResponse, DatasetListResponse 等）

### Requirement 2: 补充 Document API 定义

**User Story:** 作为 API 使用者，我想要完整的文档管理接口定义，以便正确处理文档的上传、更新、删除和查询。

#### Acceptance Criteria

1. WHEN 查看 Document 接口 THEN THE System SHALL 包含完整的索引状态响应定义
2. WHEN 上传文档 THEN THE System SHALL 定义所有支持的文件类型和大小限制
3. WHEN 文档操作失败 THEN THE System SHALL 提供详细的错误码和错误信息
4. THE System SHALL 定义 Document 相关的所有数据模型（DocumentResponse, IndexingStatusResponse 等）

### Requirement 3: 添加 Workflow API 定义

**User Story:** 作为 API 使用者，我想要工作流执行接口的完整定义，以便调用公文起草、审查、优化等 AI 功能。

#### Acceptance Criteria

1. THE System SHALL 定义 `/workflows/run` 接口（阻塞模式）
2. THE System SHALL 定义 `/workflows/run` 接口（流式模式）
3. WHEN 执行工作流 THEN THE System SHALL 定义输入参数结构（inputs, user, response_mode）
4. WHEN 工作流执行完成 THEN THE System SHALL 定义输出结果结构（outputs, status, metadata）
5. WHEN 使用流式模式 THEN THE System SHALL 定义所有 SSE 事件类型（workflow_started, node_started, node_finished, text_chunk, workflow_finished, error, ping）
6. THE System SHALL 为不同工作流类型（起草/审查/优化）提供示例

### Requirement 4: 添加 Chat API 定义

**User Story:** 作为 API 使用者，我想要 RAG 问答接口的完整定义，以便实现智能问答功能。

#### Acceptance Criteria

1. THE System SHALL 定义 `/chat-messages` 接口（流式响应）
2. WHEN 发送问答请求 THEN THE System SHALL 定义请求参数（query, user, conversation_id, inputs）
3. WHEN 接收问答响应 THEN THE System SHALL 定义所有 SSE 事件类型（message, message_end, message_file, error, ping）
4. WHEN 问答完成 THEN THE System SHALL 定义引用来源结构（metadata.retriever_resources）
5. THE System SHALL 定义会话管理相关字段（conversation_id）

### Requirement 5: 定义完整的 Components/Schemas

**User Story:** 作为 API 使用者，我想要所有数据模型的完整定义，以便理解接口的输入输出结构。

#### Acceptance Criteria

1. THE System SHALL 定义所有请求 Schema（CreateDatasetRequest, CreateDocumentByTextRequest, WorkflowRunRequest, ChatRequest 等）
2. THE System SHALL 定义所有响应 Schema（DatasetResponse, DocumentResponse, WorkflowResponse, ChatMessageResponse 等）
3. THE System SHALL 定义所有错误 Schema（DifyError, ErrorResponse）
4. THE System SHALL 定义所有枚举类型（indexing_status, response_mode, event_type 等）
5. THE System SHALL 为所有 Schema 字段提供清晰的描述和示例

### Requirement 6: 标准化错误响应

**User Story:** 作为 API 使用者，我想要统一的错误响应格式，以便正确处理各种错误情况。

#### Acceptance Criteria

1. THE System SHALL 定义统一的错误响应结构（code, message, status, details）
2. WHEN 发生错误 THEN THE System SHALL 提供所有可能的错误码列表
3. WHEN 发生错误 THEN THE System SHALL 提供错误处理建议
4. THE System SHALL 为每个接口定义常见错误响应（400, 401, 403, 404, 413, 415, 429, 500）

### Requirement 7: 补充 Security 定义

**User Story:** 作为 API 使用者，我想要清晰的认证机制说明，以便正确配置 API Key。

#### Acceptance Criteria

1. THE System SHALL 定义 API Key 认证方式（Bearer Token）
2. THE System SHALL 说明不同 API Key 的用途和获取方式
3. THE System SHALL 为每个接口标注所需的 Security Scheme
4. WHEN 认证失败 THEN THE System SHALL 定义 401 错误响应

### Requirement 8: 添加接口示例和说明

**User Story:** 作为 API 使用者，我想要丰富的接口示例和调用说明，以便快速理解和使用 API。

#### Acceptance Criteria

1. WHEN 查看接口定义 THEN THE System SHALL 提供完整的请求示例
2. WHEN 查看接口定义 THEN THE System SHALL 提供完整的响应示例
3. WHEN 查看接口定义 THEN THE System SHALL 提供 GovAI 调用场景说明
4. WHEN 查看接口定义 THEN THE System SHALL 提供调用时序图或流程说明

### Requirement 9: 补充 Retrieval API（可选）

**User Story:** 作为 API 使用者，我想要知识库检索测试接口，以便验证知识库的检索效果。

#### Acceptance Criteria

1. THE System SHALL 定义 `/datasets/{dataset_id}/retrieval` 接口（如果后端已实现）
2. WHEN 执行检索 THEN THE System SHALL 定义检索参数（query, top_k, score_threshold）
3. WHEN 检索完成 THEN THE System SHALL 定义检索结果结构（documents, scores, metadata）

### Requirement 10: 文档结构优化

**User Story:** 作为 API 使用者，我想要结构清晰的 OpenAPI 文档，以便快速定位所需接口。

#### Acceptance Criteria

1. THE System SHALL 使用合理的 Tag 分组（Dataset, Document, Workflow, Chat, Retrieval）
2. THE System SHALL 为每个 Tag 提供清晰的描述
3. THE System SHALL 使用一致的命名规范（operationId, schema 名称）
4. THE System SHALL 在文档顶部提供架构图和认证说明
5. THE System SHALL 提供完整的 info 元数据（title, description, version, contact）
