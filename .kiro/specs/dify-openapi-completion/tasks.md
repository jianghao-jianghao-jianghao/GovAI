# Implementation Plan: Dify OpenAPI 规范完善

## Overview

本实施计划将 OpenAPI 规范完善工作分解为可执行的任务。按照设计文档的优先级，分为三个阶段：核心功能补充、Schema 完善、文档优化。

## Tasks

- [x] 1. Phase 1: 核心功能补充
  - [x] 1.1 补充 Workflow API 定义
    - ✓ 添加 `/workflows/run` 接口（阻塞模式）
    - ✓ 添加 `/workflows/run` 接口（流式模式）
    - ✓ 定义 WorkflowRunRequest Schema
    - ✓ 定义 WorkflowBlockingResponse Schema
    - ✓ 定义 WorkflowSSEEvent Schema
    - ✓ 添加公文起草/审查/优化/实体抽取的示例
    - ✓ 添加错误响应示例 (400, 401, 429, 500)
    - ✓ 完善流式响应文档和 SSE 事件说明
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
    - _Completed: 2026-02-12_

  - [x] 1.2 补充 Chat API 定义
    - ✓ 添加 `/chat-messages` 接口（流式响应）
    - ✓ 定义 ChatRequest Schema
    - ✓ 定义 ChatSSEEvent Schema
    - ✓ 定义引用来源结构（retriever_resources）
    - ✓ 添加问答示例
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
    - _Completed: 2026-02-12_

  - [x] 1.3 完善 Document API 索引状态响应
    - ✓ 补充 `/datasets/{dataset_id}/documents/{batch}/indexing-status` 的完整响应定义
    - ✓ 定义 IndexingStatusResponse Schema
    - ✓ 添加各种索引状态的示例
    - _Requirements: 2.1_
    - _Completed: 2026-02-12_

- [ ] 2. Phase 2: Schema 完善
  - [ ] 2.1 定义所有请求 Schema
    - 检查并补充 CreateDatasetRequest
    - 检查并补充 CreateDocumentByTextRequest
    - 添加 WorkflowRunRequest（已在 1.1 完成）
    - 添加 ChatRequest（已在 1.2 完成）
    - _Requirements: 5.1_

  - [ ] 2.2 定义所有响应 Schema
    - 检查并补充 DatasetResponse
    - 检查并补充 DatasetListResponse
    - 检查并补充 DocumentResponse
    - 检查并补充 DocumentListResponse
    - 添加 IndexingStatusResponse（已在 1.3 完成）
    - 添加 WorkflowRunResponse（已在 1.1 完成）
    - 添加 ChatMessageResponse（已在 1.2 完成）
    - _Requirements: 5.2_

  - [ ] 2.3 定义错误响应 Schema
    - 检查并补充 DifyError Schema
    - 为每个接口添加常见错误响应（400, 401, 403, 404, 413, 415, 429, 500）
    - 添加错误响应示例
    - _Requirements: 5.3, 6.1, 6.2, 6.4_

  - [ ] 2.4 定义枚举类型
    - 定义 IndexingStatus 枚举
    - 定义 ResponseMode 枚举
    - 定义 WorkflowEventType 枚举
    - 定义 ChatEventType 枚举
    - _Requirements: 5.4_

- [ ] 3. Phase 3: 文档优化
  - [ ] 3.1 优化接口说明和示例
    - 为每个接口添加详细的 description
    - 为每个接口添加完整的请求示例
    - 为每个接口添加完整的响应示例
    - 添加 GovAI 调用场景说明
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 3.2 优化 Tag 分组
    - 检查现有 Tag 定义（Dataset, Document, Segment, Retrieval, Workflow, Chat）
    - 为每个 Tag 添加清晰的描述
    - 确保所有接口都有正确的 Tag 标注
    - _Requirements: 10.1, 10.2_

  - [ ] 3.3 补充 Security 定义
    - 检查 securitySchemes 定义（DifyApiKey）
    - 在 info.description 中补充 API Key 说明
    - 为每个接口添加 security 声明
    - 定义 401 错误响应
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 3.4 优化文档元数据
    - 检查 info.title
    - 检查 info.description（架构图、认证说明）
    - 检查 info.version
    - 检查 info.contact
    - _Requirements: 10.5_

- [ ] 4. 验证与测试
  - [ ] 4.1 OpenAPI 格式验证
    - 使用 Swagger Editor 验证文档格式
    - 确保所有 $ref 引用都能正确解析
    - 修复格式错误

  - [ ] 4.2 Schema 完整性验证
    - 检查所有引用的 Schema 是否都有定义
    - 检查所有必填字段是否都在 properties 中定义
    - 检查所有枚举值是否一致

  - [ ] 4.3 示例有效性验证
    - 验证所有 example 字段符合 Schema 约束
    - 验证示例可以直接用于测试

  - [ ] 4.4 代码一致性验证
    - 对比 OpenAPI 定义与实际代码实现
    - 确保请求/响应结构一致
    - 修复不一致的地方

- [ ] 5. 最终检查
  - [ ] 5.1 完整性检查
    - 确认所有已实现的接口都有定义
    - 确认所有 Schema 都有完整定义
    - 确认所有错误响应都有定义

  - [ ] 5.2 可用性检查
    - 确认所有接口都有清晰的说明
    - 确认所有接口都有完整的示例
    - 确认文档结构清晰易读

  - [ ] 5.3 文档发布
    - 更新版本号
    - 添加变更记录
    - 提交最终版本

## Notes

- 任务按优先级排序，建议按顺序执行
- Phase 1 和 Phase 2 的任务可以并行进行
- 每个 Phase 完成后进行一次验证
- 最终检查确保文档质量
