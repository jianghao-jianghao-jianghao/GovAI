# Dify 集成模块

本目录提供 Dify AI 引擎的 Python 集成代码，供 FastAPI 后端开发者参考使用。

---

## 📁 目录结构

```
dify/
├── README.md                       # 本文件
├── .env.example                    # 环境变量配置模板
├── requirements.txt                # Python 依赖
├── dify-backend-api.md             # 完整 API 文档
├── services/dify/                  # 核心代码
│   ├── client.py                   # HTTP 客户端
│   ├── dataset.py                  # 知识库 API
│   ├── workflow.py                 # 工作流 API
│   ├── chat.py                     # RAG 对话 API
│   └── api.py                      # FastAPI 路由示例
├── tests/                          # 单元测试
├── workflows/                      # Workflow 设计文档
└── test_knowledge/                 # 测试文件
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 API Keys
```

**如何获取 API Keys：**

| API Key | 获取路径 |
|---------|----------|
| 知识库 Key | Dify → 知识库 → API 管理 → 创建密钥 |
| 应用 Key | Dify → 工作室 → 选择应用 → 访问 API → 复制密钥 |

### 3. 集成到 FastAPI

```python
from fastapi import FastAPI
from dify.services.dify.api import router as dify_router

app = FastAPI()
app.include_router(dify_router)
```

---

## 📖 核心功能

### 知识库管理

```python
from dify.services.dify import DifyClient, DifyClientConfig, DatasetService
import os

config = DifyClientConfig(base_url=os.getenv("DIFY_API_BASE_URL"))
client = DifyClient(config)
dataset_service = DatasetService(client, os.getenv("DIFY_DATASET_API_KEY"))

# 创建知识库
dataset_id = await dataset_service.create_dataset("政策法规库", "描述")

# 上传文件
with open("file.pdf", "rb") as f:
    result = await dataset_service.upload_document(
        dataset_id, f.read(), "file.pdf"
    )

# 查询索引进度
status = await dataset_service.get_indexing_status(dataset_id, batch_id)
```

### 工作流执行

```python
from dify.services.dify import WorkflowService

workflow_service = WorkflowService(client)

# 公文起草
result = await workflow_service.run_doc_draft(
    api_key=os.getenv("DIFY_APP_DOC_DRAFT_KEY"),
    template_content="模板",
    user_requirement="需求",
    user="admin"
)
```

### RAG 问答

```python
from dify.services.dify import ChatService

chat_service = ChatService(client, os.getenv("DIFY_APP_QA_CHAT_KEY"))

# 流式问答
async for event in chat_service.rag_chat_stream(
    query="什么是数据分类分级？",
    user="user-123"
):
    if event.get("event") == "message":
        print(event.get("answer"), end="", flush=True)
```

---

## 🔧 后端 A 需要实现的功能

### 1. 数据库同步逻辑

```python
# 示例：文件上传同步
async def upload_file_with_sync(collection_id, file, user_id):
    # 1. 查询 dify_dataset_id
    collection = await db.query(KBDataset).filter_by(id=collection_id).first()
    
    # 2. 写入 PgSQL (status='uploading')
    kb_file = KBDocument(
        dataset_id=collection_id,
        title=file.filename,
        status='uploading',
        created_by=user_id
    )
    db.add(kb_file)
    await db.commit()
    
    # 3. 调用 Dify API
    try:
        result = await dataset_service.upload_document(
            dataset_id=collection.dify_dataset_id,
            file_bytes=await file.read(),
            filename=file.filename
        )
        
        # 4. 回写 dify_document_id
        kb_file.dify_document_id = result["document"]["id"]
        kb_file.status = 'indexing'
        await db.commit()
        
    except Exception as e:
        kb_file.status = 'failed'
        await db.commit()
        raise
```

### 2. 业务接口

参考 `../分工.md`，需要实现：

- **知识库管理**：`POST /kb/collections`, `POST /kb/files/upload`, `DELETE /kb/files/{id}`
- **公文处理**：`POST /documents/draft`, `POST /documents/check`, `POST /documents/optimize`
- **智能问答**：`POST /chat/send`（SSE 流式）
- **知识图谱**：`POST /graph/entities`, `GET /graph/subgraph`

### 3. 知识图谱集成（Apache AGE）

```python
# 安装 Apache AGE
docker run --name age-postgres \
  -e POSTGRES_PASSWORD=your-password \
  -p 5432:5432 \
  -d apache/age

# 初始化图数据库
import psycopg2

conn = psycopg2.connect(
    host=os.getenv("AGE_DB_HOST"),
    database=os.getenv("AGE_DB_NAME"),
    user=os.getenv("AGE_DB_USER"),
    password=os.getenv("AGE_DB_PASSWORD")
)

# 创建实体
def create_entity(name: str, entity_type: str, doc_id: str):
    cypher = f"""
        MERGE (e:Entity {{name: '{name}', type: '{entity_type}', doc_id: '{doc_id}'}})
        RETURN e
    """
    # 执行 Cypher 查询

# 实体抽取 + 写入图数据库
result = await workflow_service.extract_entities(
    api_key=os.getenv("DIFY_APP_ENTITY_EXTRACT_KEY"),
    text="文本内容",
    source_doc_id="doc-123",
    user="admin"
)

for entity in result.get("entities", []):
    create_entity(entity["name"], entity["type"], entity["doc_id"])
```

---

## 🧪 测试

```bash
# 安装测试依赖
pip install -r tests/requirements-test.txt

# 运行测试
pytest tests/ -v --cov=services/dify
```

---

## ⚠️ 注意事项

1. **API Key 安全**：不要将 `.env` 提交到 Git
2. **错误处理**：所有 Dify API 调用都要 try-catch
3. **数据同步**：先删 Dify，再删 PgSQL（避免孤儿数据）
4. **文件存储**：支持本地文件系统和 OSS（配置见 `.env.example`）
5. **知识图谱**：需要安装 Apache AGE（配置见 `.env.example`）

---

## 📚 参考文档

- [dify-backend-api.md](./dify-backend-api.md) - 完整 API 文档
- [Dify 官方文档](https://docs.dify.ai/)
- [Apache AGE 文档](https://age.apache.org/)
- [workflows/](./workflows/) - Workflow 设计说明

---

## 🎯 定位说明

本目录中的代码是**模板/参考实现**，供后端 A（FastAPI 开发者）参考使用：

- ✅ 可以直接使用（快速原型）
- ✅ 可以修改适配（生产环境）
- ✅ 可以作为学习材料（理解 Dify API）
