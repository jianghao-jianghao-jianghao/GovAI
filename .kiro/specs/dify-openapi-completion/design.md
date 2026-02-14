# Design Document

## Overview

本设计文档描述如何完善 `后端-Dify-API-OpenAPI.json` 文件，使其成为一个完整、准确、易用的 API 规范文档。设计遵循 OpenAPI 3.0.1 标准，覆盖 GovAI 系统与 Dify 平台之间的所有交互接口。

设计目标：
1. **完整性**：覆盖所有已实现的功能接口
2. **准确性**：与实际代码实现保持一致
3. **可用性**：提供清晰的示例和说明
4. **可维护性**：使用模块化的 Schema 定义

## Architecture

### 文档结构

```
后端-Dify-API-OpenAPI.json
├── openapi: "3.0.1"
├── info (元数据)
│   ├── title
│   ├── description (架构图、认证说明)
│   ├── version
│   └── contact
├── servers (可选)
├── tags (接口分组)
│   ├── Dataset
│   ├── Document
│   ├── Workflow
│   ├── Chat
│   └── Retrieval (可选)
├── paths (接口定义)
│   ├── /datasets
│   ├── /datasets/{dataset_id}
│   ├── /datasets/{dataset_id}/documents
│   ├── /workflows/run
│   ├── /chat-messages
│   └── ...
├── components
│   ├── schemas (数据模型)
│   │   ├── 请求模型
│   │   ├── 响应模型
│   │   ├── 错误模型
│   │   └── 枚举类型
│   ├── responses (可复用响应)
│   ├── parameters (可复用参数)
│   └── securitySchemes (认证方式)
└── security (全局安全配置)
```

### 接口分层

```
┌─────────────────────────────────────────┐
│         OpenAPI 规范文档                 │
├─────────────────────────────────────────┤
│  Dataset API    │  知识库管理            │
│  Document API   │  文档管理              │
│  Workflow API   │  工作流执行            │
│  Chat API       │  RAG 问答              │
│  Retrieval API  │  检索测试（可选）       │
└─────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Dataset API

#### 接口列表

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| POST | `/datasets` | 创建知识库 | ✅ 已有 |
| GET | `/datasets` | 获取知识库列表 | ✅ 已有 |
| DELETE | `/datasets/{dataset_id}` | 删除知识库 | ✅ 已有 |

#### Schema 定义

**CreateDatasetRequest**
```json
{
  "type": "object",
  "required": ["name"],
  "properties": {
    "name": {
      "type": "string",
      "description": "知识库名称",
      "example": "政策法规知识库"
    },
    "description": {
      "type": "string",
      "description": "知识库描述",
      "example": "包含国家及地方政策法规文件"
    },
    "permission": {
      "type": "string",
      "enum": ["only_me", "all_team_members"],
      "default": "only_me",
      "description": "访问权限"
    },
    "indexing_technique": {
      "type": "string",
      "enum": ["high_quality", "economy"],
      "default": "high_quality",
      "description": "索引技术"
    }
  }
}
```

**DatasetResponse**
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "知识库 ID"
    },
    "name": {"type": "string"},
    "description": {"type": "string"},
    "provider": {"type": "string"},
    "permission": {"type": "string"},
    "data_source_type": {"type": "string", "nullable": true},
    "indexing_technique": {"type": "string"},
    "app_count": {"type": "integer"},
    "document_count": {"type": "integer"},
    "word_count": {"type": "integer"},
    "created_by": {"type": "string"},
    "created_at": {"type": "integer"},
    "updated_by": {"type": "string"},
    "updated_at": {"type": "integer"}
  }
}
```

### 2. Document API

#### 接口列表

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| POST | `/datasets/{dataset_id}/document/create-by-file` | 通过文件创建文档 | ✅ 已有 |
| POST | `/datasets/{dataset_id}/document/create_by_text` | 通过文本创建文档 | ✅ 已有 |
| POST | `/datasets/{dataset_id}/documents/{document_id}/update-by-file` | 通过文件更新文档 | ✅ 已有 |
| POST | `/datasets/{dataset_id}/documents/{document_id}/update_by_text` | 通过文本更新文档 | ✅ 已有 |
| GET | `/datasets/{dataset_id}/documents` | 获取文档列表 | ✅ 已有 |
| DELETE | `/datasets/{dataset_id}/documents/{document_id}` | 删除文档 | ✅ 已有 |
| GET | `/datasets/{dataset_id}/documents/{batch}/indexing-status` | 查询索引进度 | ⚠️ 需补充完整响应 |

#### Schema 定义

**IndexingStatusResponse**（需新增）
```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "indexing_status": {
            "type": "string",
            "enum": ["waiting", "indexing", "completed", "paused", "error"]
          },
          "processing_started_at": {"type": "integer", "nullable": true},
          "parsing_completed_at": {"type": "integer", "nullable": true},
          "cleaning_completed_at": {"type": "integer", "nullable": true},
          "splitting_completed_at": {"type": "integer", "nullable": true},
          "completed_at": {"type": "integer", "nullable": true},
          "paused_at": {"type": "integer", "nullable": true},
          "error": {"type": "string", "nullable": true},
          "stopped_at": {"type": "integer", "nullable": true},
          "completed_segments": {"type": "integer"},
          "total_segments": {"type": "integer"}
        }
      }
    }
  }
}
```

### 3. Workflow API（需新增）

#### 接口列表

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| POST | `/workflows/run` | 执行工作流（阻塞/流式） | ❌ 需新增 |

#### Schema 定义

**WorkflowRunRequest**
```json
{
  "type": "object",
  "required": ["inputs", "user"],
  "properties": {
    "inputs": {
      "type": "object",
      "description": "工作流输入参数（根据具体工作流而定）",
      "additionalProperties": true,
      "example": {
        "template_content": "公文模板内容",
        "user_requirement": "用户需求描述"
      }
    },
    "response_mode": {
      "type": "string",
      "enum": ["blocking", "streaming"],
      "default": "blocking",
      "description": "响应模式：blocking=阻塞等待完整结果，streaming=流式返回"
    },
    "user": {
      "type": "string",
      "description": "用户标识",
      "example": "user-123"
    }
  }
}
```

**WorkflowRunResponse（阻塞模式）**
```json
{
  "type": "object",
  "properties": {
    "workflow_run_id": {"type": "string"},
    "task_id": {"type": "string"},
    "data": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "workflow_id": {"type": "string"},
        "status": {
          "type": "string",
          "enum": ["running", "succeeded", "failed", "stopped"]
        },
        "outputs": {
          "type": "object",
          "description": "工作流输出结果",
          "additionalProperties": true
        },
        "error": {"type": "string", "nullable": true},
        "elapsed_time": {"type": "number"},
        "total_tokens": {"type": "integer"},
        "total_steps": {"type": "integer"},
        "created_at": {"type": "integer"},
        "finished_at": {"type": "integer"}
      }
    }
  }
}
```

**WorkflowSSEEvent（流式模式）**
```json
{
  "type": "object",
  "properties": {
    "event": {
      "type": "string",
      "enum": [
        "workflow_started",
        "node_started",
        "node_finished",
        "text_chunk",
        "workflow_finished",
        "error",
        "ping"
      ]
    },
    "task_id": {"type": "string"},
    "workflow_run_id": {"type": "string"},
    "data": {
      "type": "object",
      "description": "事件数据（根据 event 类型而定）"
    }
  }
}
```

### 4. Chat API（需新增）

#### 接口列表

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| POST | `/chat-messages` | RAG 问答（流式） | ❌ 需新增 |

#### Schema 定义

**ChatRequest**
```json
{
  "type": "object",
  "required": ["query", "user"],
  "properties": {
    "query": {
      "type": "string",
      "description": "用户问题",
      "example": "什么是数据分类分级？"
    },
    "user": {
      "type": "string",
      "description": "用户标识",
      "example": "user-123"
    },
    "conversation_id": {
      "type": "string",
      "description": "会话 ID（多轮对话时传入）",
      "nullable": true
    },
    "inputs": {
      "type": "object",
      "description": "额外输入参数",
      "additionalProperties": true,
      "default": {}
    },
    "response_mode": {
      "type": "string",
      "enum": ["streaming", "blocking"],
      "default": "streaming",
      "description": "响应模式"
    }
  }
}
```

**ChatSSEEvent**
```json
{
  "type": "object",
  "properties": {
    "event": {
      "type": "string",
      "enum": ["message", "message_end", "message_file", "error", "ping"]
    },
    "conversation_id": {"type": "string"},
    "message_id": {"type": "string"},
    "answer": {
      "type": "string",
      "description": "增量文本（event=message 时）"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "usage": {
          "type": "object",
          "properties": {
            "prompt_tokens": {"type": "integer"},
            "completion_tokens": {"type": "integer"},
            "total_tokens": {"type": "integer"}
          }
        },
        "retriever_resources": {
          "type": "array",
          "description": "引用来源",
          "items": {
            "type": "object",
            "properties": {
              "position": {"type": "integer"},
              "dataset_id": {"type": "string"},
              "dataset_name": {"type": "string"},
              "document_id": {"type": "string"},
              "document_name": {"type": "string"},
              "segment_id": {"type": "string"},
              "score": {"type": "number"},
              "content": {"type": "string"}
            }
          }
        }
      }
    }
  }
}
```

### 5. Error Handling

#### 统一错误响应

**DifyError**
```json
{
  "type": "object",
  "required": ["code", "message", "status"],
  "properties": {
    "code": {
      "type": "string",
      "description": "错误码",
      "example": "no_file_uploaded"
    },
    "message": {
      "type": "string",
      "description": "错误信息",
      "example": "Please upload your file."
    },
    "status": {
      "type": "integer",
      "description": "HTTP 状态码",
      "example": 400
    },
    "details": {
      "type": "object",
      "description": "错误详情（可选）",
      "additionalProperties": true
    }
  }
}
```

#### 常见错误码

| HTTP 状态码 | Dify 错误码 | 说明 | 处理建议 |
|------------|------------|------|---------|
| 400 | `no_file_uploaded` | 未上传文件 | 前端提示重新上传 |
| 400 | `too_many_files` | 文件过多 | 限制单文件上传 |
| 400 | `invalid_param` | 参数无效 | 检查参数格式 |
| 401 | `unauthorized` | 未授权 | 检查 API Key |
| 403 | `forbidden` | 禁止访问 | 检查权限 |
| 404 | `not_found` | 资源不存在 | 检查 ID 是否正确 |
| 413 | `file_too_large` | 文件过大 | 前端限制文件大小 |
| 415 | `unsupported_file_type` | 不支持的文件类型 | 前端限制文件类型 |
| 429 | `rate_limit_exceeded` | 请求过于频繁 | 指数退避重试 |
| 500 | `internal_server_error` | 服务器内部错误 | 重试或联系管理员 |

## Data Models

### 核心数据模型层次

```
Components/Schemas
├── Request Models
│   ├── CreateDatasetRequest
│   ├── CreateDocumentByTextRequest
│   ├── WorkflowRunRequest
│   └── ChatRequest
├── Response Models
│   ├── DatasetResponse
│   ├── DatasetListResponse
│   ├── DocumentResponse
│   ├── DocumentListResponse
│   ├── IndexingStatusResponse
│   ├── WorkflowRunResponse
│   └── ChatMessageResponse
├── Error Models
│   └── DifyError
└── Enum Types
    ├── IndexingStatus
    ├── ResponseMode
    ├── WorkflowEventType
    └── ChatEventType
```

### 枚举类型定义

**IndexingStatus**
```json
{
  "type": "string",
  "enum": ["waiting", "indexing", "completed", "paused", "error"],
  "description": "文档索引状态"
}
```

**ResponseMode**
```json
{
  "type": "string",
  "enum": ["blocking", "streaming"],
  "description": "响应模式"
}
```

**WorkflowEventType**
```json
{
  "type": "string",
  "enum": [
    "workflow_started",
    "node_started",
    "node_finished",
    "text_chunk",
    "workflow_finished",
    "error",
    "ping"
  ],
  "description": "工作流 SSE 事件类型"
}
```

**ChatEventType**
```json
{
  "type": "string",
  "enum": ["message", "message_end", "message_file", "error", "ping"],
  "description": "Chat SSE 事件类型"
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Schema 完整性

*For any* 在 paths 中引用的 Schema，该 Schema 必须在 components/schemas 中有完整定义。

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 2: 接口一致性

*For any* 接口定义，其请求/响应结构必须与实际代码实现保持一致。

**Validates: Requirements 1.2, 2.1, 3.4, 4.2**

### Property 3: 错误响应完整性

*For any* 接口定义，必须包含至少一个错误响应（4xx 或 5xx）。

**Validates: Requirements 6.2, 6.4**

### Property 4: 示例有效性

*For any* Schema 定义，如果包含 example 字段，该 example 必须符合 Schema 的约束。

**Validates: Requirements 8.1, 8.2**

### Property 5: 安全配置一致性

*For any* 需要认证的接口，必须在 security 字段中声明所需的 securityScheme。

**Validates: Requirements 7.3**

### Property 6: 枚举值一致性

*For any* 枚举类型字段，其所有可能的值必须在 enum 数组中定义。

**Validates: Requirements 5.4**

### Property 7: 必填字段完整性

*For any* Schema 定义，如果字段在 required 数组中，则该字段必须在 properties 中定义。

**Validates: Requirements 5.1, 5.2**

## Testing Strategy

### 验证方法

1. **Schema 验证**
   - 使用 OpenAPI 验证工具（如 Swagger Editor、openapi-generator-cli）验证文档格式
   - 确保所有 $ref 引用都能正确解析

2. **代码对比验证**
   - 对比 OpenAPI 定义与实际代码实现
   - 确保请求/响应结构一致

3. **示例验证**
   - 验证所有 example 字段符合 Schema 约束
   - 确保示例可以直接用于测试

4. **完整性检查**
   - 检查所有已实现的接口是否都有定义
   - 检查所有引用的 Schema 是否都有定义

### 测试用例

#### Unit Tests（示例验证）

1. **测试 CreateDatasetRequest 示例有效性**
   - 验证示例符合 Schema 约束
   - 验证必填字段都存在

2. **测试 WorkflowRunRequest 示例有效性**
   - 验证 inputs 字段结构
   - 验证 response_mode 枚举值

3. **测试错误响应示例**
   - 验证 DifyError 结构
   - 验证错误码格式

#### Property Tests（结构验证）

1. **Property Test: Schema 引用完整性**
   - 遍历所有 $ref 引用
   - 验证每个引用都能在 components 中找到定义

2. **Property Test: 必填字段完整性**
   - 遍历所有 Schema 的 required 数组
   - 验证每个必填字段都在 properties 中定义

3. **Property Test: 枚举值一致性**
   - 遍历所有枚举类型字段
   - 验证示例值在 enum 数组中

4. **Property Test: 安全配置一致性**
   - 遍历所有接口定义
   - 验证需要认证的接口都有 security 声明

## Implementation Notes

### 开发优先级

基于一个月开发周期和功能重要性，建议按以下顺序完善：

**Phase 1: 核心功能补充（Week 1-2）**
1. 补充 Workflow API 定义（公文处理核心功能）
2. 补充 Chat API 定义（问答核心功能）
3. 完善 Document API 的索引状态响应

**Phase 2: Schema 完善（Week 2-3）**
4. 定义所有请求/响应 Schema
5. 定义错误响应 Schema
6. 定义枚举类型

**Phase 3: 文档优化（Week 3-4）**
7. 添加详细的接口说明和示例
8. 优化 Tag 分组和描述
9. 补充 Security 定义
10. 添加 GovAI 调用场景说明

### 技术约束

1. **OpenAPI 版本**: 3.0.1（保持与现有文档一致）
2. **JSON 格式**: 使用标准 JSON 格式，注意转义字符
3. **文件大小**: 控制在合理范围内（< 500KB）
4. **兼容性**: 确保与 Swagger UI、Postman 等工具兼容

### 维护建议

1. **版本管理**: 在 info.version 中使用语义化版本号
2. **变更记录**: 在 info.description 中记录重要变更
3. **代码同步**: 代码变更时同步更新 OpenAPI 文档
4. **自动化验证**: 在 CI/CD 中集成 OpenAPI 验证
