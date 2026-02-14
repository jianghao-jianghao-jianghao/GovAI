# Dify 服务集成

这是GovAI系统与Dify平台的集成服务层,提供了完整的API封装。

## 功能特性

- ✅ 工作流服务 (Workflow Service)
  - 公文起草
  - 公文审查
  - 公文优化
  - 实体抽取
  - 流式/阻塞模式支持

- ✅ 聊天服务 (Chat Service)
  - RAG问答
  - 流式响应
  - 引用来源解析
  - 会话管理

- ✅ 数据集服务 (Dataset Service)
  - 知识库创建/删除
  - 文档上传/删除
  - 索引状态查询

- ✅ 错误处理
  - 自动重试机制
  - 指数退避策略
  - 统一异常体系

## 快速开始

### 1. 安装依赖

```bash
pip install httpx python-dotenv
```

### 2. 配置环境变量

创建 `.env` 文件:

```env
# Dify API配置
DIFY_BASE_URL=https://api.dify.ai/v1

# 工作流API Keys
DIFY_APP_DOC_DRAFT_KEY=app-xxx
DIFY_APP_DOC_CHECK_KEY=app-xxx
DIFY_APP_DOC_OPTIMIZE_KEY=app-xxx
DIFY_APP_ENTITY_EXTRACT_KEY=app-xxx

# 聊天API Key
DIFY_APP_CHAT_KEY=app-xxx

# 数据集API Key
DIFY_DATASET_API_KEY=dataset-xxx
```

### 3. 使用示例

#### 初始化服务

```python
from dify.services.dify import create_dify_service

# 创建服务工厂
dify = create_dify_service(
    base_url="https://api.dify.ai/v1",
    timeout=120
)
```

#### 工作流服务

```python
# 公文起草
result = await dify.workflow.run_doc_draft(
    api_key="app-xxx",
    template_content="关于{{主题}}的通知",
    user_requirement="撰写数据安全管理通知",
    user="user-123"
)

# 公文审查
result = await dify.workflow.run_doc_check(
    api_key="app-xxx",
    content="公文内容...",
    user="user-123"
)

# 公文优化
result = await dify.workflow.run_doc_optimize(
    api_key="app-xxx",
    content="公文内容...",
    user="user-123",
    optimization_focus="语言规范性",
    kb_dataset_ids=["dataset-xxx"]
)

# 实体抽取
result = await dify.workflow.extract_entities(
    api_key="app-xxx",
    text="文本内容...",
    user="user-123"
)

# 流式工作流
async for event in dify.workflow.run_workflow_streaming(
    api_key="app-xxx",
    inputs={"content": "..."},
    user="user-123"
):
    print(event)
```

#### 聊天服务

```python
# RAG问答 - 收集完整结果
answer, conv_id, citations = await dify.chat.rag_chat_collect(
    api_key="app-xxx",
    query="什么是数据分类分级？",
    user="user-123"
)

# RAG问答 - 流式响应
async for event in dify.chat.rag_chat_stream(
    api_key="app-xxx",
    query="什么是数据分类分级？",
    user="user-123",
    conversation_id=conv_id  # 可选,用于多轮对话
):
    if event.get("event") == "message":
        print(event.get("answer"), end="", flush=True)
    elif event.get("event") == "message_end":
        citations = event.get("metadata", {}).get("retriever_resources", [])
```

#### 数据集服务

```python
# 创建知识库
dataset_id = await dify.dataset.create_dataset(
    api_key="dataset-xxx",
    name="政策法规知识库",
    description="包含国家及地方政策法规文件"
)

# 上传文档
with open("document.pdf", "rb") as f:
    file_bytes = f.read()

result = await dify.dataset.upload_document(
    api_key="dataset-xxx",
    dataset_id=dataset_id,
    file_bytes=file_bytes,
    filename="document.pdf",
    content_type="application/pdf"
)

document_id = result["document"]["id"]
batch_id = result["batch"]

# 查询索引状态
status = await dify.dataset.get_indexing_status(
    api_key="dataset-xxx",
    dataset_id=dataset_id,
    batch=batch_id
)

# 删除文档
await dify.dataset.delete_document(
    api_key="dataset-xxx",
    dataset_id=dataset_id,
    document_id=document_id
)

# 删除知识库
await dify.dataset.delete_dataset(
    api_key="dataset-xxx",
    dataset_id=dataset_id
)
```

## 错误处理

```python
from dify.services.dify import (
    DifyError,
    DifyConnectionError,
    DifyTimeoutError,
    DifyRateLimitError,
    DifyStreamError
)

try:
    result = await dify.workflow.run_doc_draft(...)
except DifyRateLimitError as e:
    print(f"请求频率限制,请在{e.retry_after}秒后重试")
except DifyTimeoutError as e:
    print(f"请求超时({e.timeout}秒)")
except DifyConnectionError as e:
    print(f"连接失败: {e}")
except DifyError as e:
    print(f"Dify错误: {e.message} (code: {e.code})")
```

## 高级特性

### 自动重试

客户端内置了自动重试机制:
- 最多重试3次
- 指数退避策略 (1s, 2s, 4s)
- 自动处理429频率限制
- 自动重试5xx服务器错误

### 超时配置

```python
# 自定义超时时间
dify = create_dify_service(
    base_url="https://api.dify.ai/v1",
    timeout=180  # 3分钟超时
)
```

### 流式响应

所有支持流式的接口都返回异步生成器:

```python
async for event in dify.workflow.run_workflow_streaming(...):
    event_type = event.get("event")
    if event_type == "workflow_started":
        print("工作流开始")
    elif event_type == "text_chunk":
        print(event.get("data", {}).get("text"), end="")
    elif event_type == "workflow_finished":
        print("\n工作流完成")
```

## 测试

运行测试:

```bash
cd dify
python tests/test_services.py
```

## 架构说明

```
dify/services/dify/
├── __init__.py          # 模块导出
├── client.py            # HTTP客户端(底层)
├── exceptions.py        # 异常定义
├── factory.py           # 服务工厂
├── workflow.py          # 工作流服务
├── chat.py              # 聊天服务
├── dataset.py           # 数据集服务
└── README.md            # 本文档
```

### 设计原则

1. **单一职责**: 每个服务类只负责一类功能
2. **依赖注入**: 通过工厂模式管理依赖
3. **统一接口**: 所有服务方法都需要传入api_key
4. **错误处理**: 统一的异常体系和重试机制
5. **类型安全**: 使用类型注解提高代码可维护性

## 常见问题

### Q: 为什么每个方法都要传api_key?

A: 因为不同的功能(工作流/聊天/数据集)使用不同的API Key,这样设计更灵活。

### Q: 如何处理频率限制?

A: 客户端会自动重试429错误,并根据Retry-After头等待。你也可以捕获DifyRateLimitError手动处理。

### Q: 流式响应如何使用?

A: 使用async for循环遍历事件流,根据event字段判断事件类型。

### Q: 如何调试API调用?

A: 设置日志级别为DEBUG:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 参考资料

- [Dify官方文档](https://docs.dify.ai/)
- [Dify API文档](https://docs.dify.ai/guides/api-reference)
- [GovAI OpenAPI规范](../../../后端-Dify-API-OpenAPI.json)
