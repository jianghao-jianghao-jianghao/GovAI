# Dify 文档上传逻辑说明

## 概述

本文档详细说明了如何将文档上传到 Dify 知识库的完整流程和实现逻辑。

---

## 核心流程

### 1. 创建知识库 (Create Dataset)

**API 端点**: `POST /datasets`

**请求参数**:
```json
{
  "name": "知识库名称",
  "description": "知识库描述（可选）",
  "permission": "only_me",  // 权限设置
  "indexing_technique": "high_quality"  // 索引技术
}
```

**响应数据**:
```json
{
  "id": "dataset-uuid",  // 知识库 ID
  "name": "知识库名称"
}
```

**代码实现** (`client.py` 第 38-72 行):
```python
async def create_dataset(self, name: str) -> DatasetInfo:
    url = f"{self.base_url}/datasets"
    
    payload = {
        "name": name,
        "description": "",
        "permission": "only_me",
        "indexing_technique": "high_quality"
    }
    
    headers = {
        "Authorization": f"Bearer {self.dataset_api_key}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code >= 400:
            # 错误处理
            raise Exception(f"Dify create dataset failed: {error_detail}")
        
        result = response.json()
        return DatasetInfo(
            dataset_id=result.get("id", ""),
            name=result.get("name", name)
        )
```

---

### 2. 上传文档 (Upload Document)

**API 端点**: `POST /datasets/{dataset_id}/document/create-by-file`

**请求格式**: `multipart/form-data`

**请求参数**:
- `file`: 文件二进制内容（包含文件名和 MIME 类型）
- `data`: JSON 字符串，包含索引配置
  ```json
  {
    "indexing_technique": "high_quality",
    "process_rule": {
      "mode": "automatic"  // 自动处理模式
    }
  }
  ```

**响应数据**:
```json
{
  "document": {
    "id": "document-uuid"  // 文档 ID
  },
  "batch": "batch-id"  // 批次 ID（用于查询索引状态）
}
```

**代码实现** (`client.py` 第 108-154 行):
```python
async def upload_document(
    self, dataset_id: str, file_name: str, file_content: bytes, file_type: str
) -> DocumentUploadResult:
    url = f"{self.base_url}/datasets/{dataset_id}/document/create-by-file"
    
    # 准备 multipart/form-data
    files = {
        "file": (file_name, file_content, file_type)
    }
    
    # Dify 要求的额外参数
    data = {
        "data": '{"indexing_technique": "high_quality", "process_rule": {"mode": "automatic"}}'
    }
    
    headers = {
        "Authorization": f"Bearer {self.dataset_api_key}"
    }
    
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.post(
            url,
            headers=headers,
            files=files,
            data=data
        )
        
        if response.status_code >= 400:
            raise Exception(f"Dify upload failed: {error_detail}")
        
        result = response.json()
        document = result.get("document", {})
        batch = result.get("batch", "")
        
        return DocumentUploadResult(
            document_id=document.get("id", ""),
            batch_id=batch
        )
```

**关键点**:
1. 使用 `multipart/form-data` 格式上传文件
2. 文件内容以 `bytes` 形式传递
3. 需要指定文件名和 MIME 类型（如 `text/plain`, `application/pdf`）
4. 返回的 `batch_id` 用于后续查询索引状态

---

### 3. 查询索引状态 (Get Indexing Status)

**API 端点**: `GET /datasets/{dataset_id}/documents/{batch_id}/indexing-status`

**响应数据**:
```json
{
  "data": [
    {
      "indexing_status": "indexing" | "completed" | "error"
    }
  ]
}
```

**状态说明**:
- `indexing`: 正在索引中
- `completed`: 索引完成
- `error`: 索引失败

**代码实现** (`client.py` 第 180-212 行):
```python
async def get_indexing_status(self, dataset_id: str, batch_id: str) -> str:
    url = f"{self.base_url}/datasets/{dataset_id}/documents/{batch_id}/indexing-status"
    
    headers = {
        "Authorization": f"Bearer {self.dataset_api_key}"
    }
    
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.get(url, headers=headers)
        
        if response.status_code >= 400:
            raise Exception(f"Dify get indexing status failed: {error_detail}")
        
        result = response.json()
        status = result.get("data", [{}])[0].get("indexing_status", "error")
        return status
```

**轮询策略** (在 `test_upload.py` 中):
```python
# 等待索引完成
max_retries = 10
retry_count = 0
while status == "indexing" and retry_count < max_retries:
    print(f"  等待索引完成... ({retry_count + 1}/{max_retries})")
    await asyncio.sleep(2)  # 每 2 秒查询一次
    status = await dify_service.get_indexing_status(
        dataset_id=dataset_id,
        batch_id=upload_result.batch_id
    )
    retry_count += 1
```

---

### 4. 删除文档 (Delete Document)

**API 端点**: `DELETE /datasets/{dataset_id}/documents/{document_id}`

**代码实现** (`client.py` 第 156-178 行):
```python
async def delete_document(self, dataset_id: str, document_id: str) -> None:
    url = f"{self.base_url}/datasets/{dataset_id}/documents/{document_id}"
    
    headers = {
        "Authorization": f"Bearer {self.dataset_api_key}"
    }
    
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.delete(url, headers=headers)
        
        if response.status_code >= 400:
            raise Exception(f"Dify delete document failed: {error_detail}")
```

---

### 5. 删除知识库 (Delete Dataset)

**API 端点**: `DELETE /datasets/{dataset_id}`

**代码实现** (`client.py` 第 74-94 行):
```python
async def delete_dataset(self, dataset_id: str) -> None:
    url = f"{self.base_url}/datasets/{dataset_id}"
    
    headers = {
        "Authorization": f"Bearer {self.dataset_api_key}"
    }
    
    async with httpx.AsyncClient(timeout=self.timeout) as client:
        response = await client.delete(url, headers=headers)
        
        if response.status_code >= 400:
            raise Exception(f"Dify delete dataset failed: {error_detail}")
```

**注意**: 删除知识库可能遇到速率限制（rate limit），这是 Dify Cloud 的正常限制。

---

## 完整流程示例

```python
# 1. 创建知识库
dataset = await dify_service.create_dataset(name="我的知识库")
dataset_id = dataset.dataset_id

# 2. 上传文档
file_content = b"文档内容..."
upload_result = await dify_service.upload_document(
    dataset_id=dataset_id,
    file_name="document.txt",
    file_content=file_content,
    file_type="text/plain"
)

# 3. 等待索引完成
status = await dify_service.get_indexing_status(
    dataset_id=dataset_id,
    batch_id=upload_result.batch_id
)

while status == "indexing":
    await asyncio.sleep(2)
    status = await dify_service.get_indexing_status(
        dataset_id=dataset_id,
        batch_id=upload_result.batch_id
    )

# 4. 使用知识库（查询、检索等）
# ...

# 5. 清理（可选）
await dify_service.delete_document(
    dataset_id=dataset_id,
    document_id=upload_result.document_id
)
await dify_service.delete_dataset(dataset_id=dataset_id)
```

---

## 配置说明

### 环境变量 (`.env` 文件)

```properties
# Dify 配置
DIFY_BASE_URL=https://api.dify.ai/v1  # Dify API 基础 URL
DIFY_DATASET_API_KEY=dataset-xxxxx    # 知识库 API Key
```

### 获取 API Key

1. 登录 Dify Cloud: https://cloud.dify.ai
2. 创建或选择一个知识库
3. 在知识库设置中找到 "API Key"
4. 复制 API Key（格式：`dataset-xxxxxxxxxx`）

---

## 支持的文件类型

Dify 支持多种文件类型，常见的包括：

- **文本文件**: `text/plain` (.txt)
- **Markdown**: `text/markdown` (.md)
- **PDF**: `application/pdf` (.pdf)
- **Word**: `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
- **Excel**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)
- **HTML**: `text/html` (.html)

---

## 错误处理

### 常见错误

1. **认证失败** (`401 Unauthorized`)
   - 检查 `DIFY_DATASET_API_KEY` 是否正确
   - 确认 API Key 有效且未过期

2. **速率限制** (`429 Too Many Requests`)
   - Dify Cloud 有 API 调用频率限制
   - 建议添加重试逻辑和延迟

3. **文件格式不支持** (`400 Bad Request`)
   - 检查文件类型是否被 Dify 支持
   - 确认 MIME 类型设置正确

4. **网络超时**
   - 默认超时设置：连接 10 秒，总计 60 秒
   - 可在 `RealDifyService.__init__` 中调整

### 错误处理示例

```python
try:
    upload_result = await dify_service.upload_document(...)
except Exception as e:
    if "rate limit" in str(e).lower():
        print("遇到速率限制，请稍后重试")
        await asyncio.sleep(60)  # 等待 1 分钟
    elif "401" in str(e):
        print("认证失败，请检查 API Key")
    else:
        print(f"上传失败: {e}")
```

---

## 性能优化建议

1. **批量上传**: 如果有多个文档，可以并发上传（注意速率限制）
2. **异步处理**: 使用 `asyncio` 进行异步操作，提高效率
3. **索引状态轮询**: 合理设置轮询间隔，避免过于频繁的 API 调用
4. **错误重试**: 实现指数退避重试策略

---

## 测试

运行测试脚本：

```bash
cd backend-front/backend
python test_upload.py
```

测试脚本会：
1. 创建测试知识库
2. 上传测试文档
3. 查询索引状态
4. 清理测试数据

---

## 相关文件

- `app/services/dify/client.py` - Dify 客户端实现
- `app/services/dify/base.py` - 基础接口定义
- `app/core/config.py` - 配置管理
- `test_upload.py` - 上传功能测试脚本
- `.env` - 环境变量配置

---

## 参考资料

- [Dify 官方文档](https://docs.dify.ai/)
- [Dify Dataset API](https://docs.dify.ai/guides/knowledge-base/dataset-api)
