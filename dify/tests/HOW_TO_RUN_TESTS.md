# 如何运行 Dify 服务测试

## 快速开始

### 1. 安装依赖

```bash
cd dify
pip install -r requirements.txt
pip install -r tests/requirements-test.txt
```

### 2. 运行测试的几种方式

#### 方式 1：运行单个测试文件（推荐用于开发）

```bash
# 运行聊天服务测试
pytest tests/test_chat.py -v

# 运行工作流服务测试
pytest tests/test_workflow.py -v

# 运行数据集服务测试
pytest tests/test_dataset.py -v

# 运行客户端测试
pytest tests/test_client.py -v
```

#### 方式 2：运行所有单元测试

```bash
# 运行所有单元测试（使用 Mock，不需要真实 API Key）
pytest tests/ -m unit -v

# 带覆盖率报告
pytest tests/ -m unit -v --cov=dify/services/dify --cov-report=html
```

#### 方式 3：运行特定测试函数

```bash
# 运行聊天服务中的知识库检索测试
pytest tests/test_chat.py::TestChatService::test_rag_chat_with_knowledge_base_retrieval -v

# 运行多个知识库测试
pytest tests/test_chat.py::TestChatService::test_rag_chat_multiple_datasets -v

# 运行所有知识库相关测试
pytest tests/test_chat.py -k "knowledge_base or dataset" -v
```

#### 方式 4：使用测试运行脚本

```bash
# 从 dify 目录运行
cd dify

# 运行单元测试
python tests/run_tests.py --unit

# 运行集成测试（需要配置 .env 文件）
python tests/run_tests.py --integration

# 运行所有测试
python tests/run_tests.py --all

# 生成覆盖率报告
python tests/run_tests.py --cov
```

#### 方式 5：快速验证

```bash
# 快速验证基本功能（不需要 API Key）
cd dify
python tests/test_quick.py
```

## 测试详解

### 聊天服务测试 (test_chat.py)

新增的知识库检查测试：

1. **test_rag_chat_with_knowledge_base_retrieval**
   - 测试 RAG 问答时检查知识库检索结果
   - 验证引用来源的完整性（dataset_id, document_name, score 等）
   - 验证引用按相关性排序

2. **test_rag_chat_no_retrieval_resources**
   - 测试无知识库检索结果的情况
   - 验证空检索结果的处理

3. **test_rag_chat_verify_dataset_usage**
   - 测试验证指定知识库被正确使用
   - 确保请求参数包含指定的 dataset_ids
   - 验证返回的引用都来自指定知识库

4. **test_rag_chat_multiple_datasets**
   - 测试使用多个知识库进行 RAG 问答
   - 验证多个知识库的引用来源

### 运行特定的知识库测试

```bash
# 运行所有知识库相关测试
pytest tests/test_chat.py -k "knowledge_base or dataset" -v

# 只运行知识库检索测试
pytest tests/test_chat.py::TestChatService::test_rag_chat_with_knowledge_base_retrieval -v

# 运行多知识库测试
pytest tests/test_chat.py::TestChatService::test_rag_chat_multiple_datasets -v
```

## 测试输出示例

```bash
$ pytest tests/test_chat.py -v

tests/test_chat.py::TestChatService::test_rag_chat_stream PASSED                    [ 12%]
tests/test_chat.py::TestChatService::test_rag_chat_stream_with_conversation PASSED  [ 25%]
tests/test_chat.py::TestChatService::test_rag_chat_collect PASSED                   [ 37%]
tests/test_chat.py::TestChatService::test_rag_chat_collect_empty_answer PASSED      [ 50%]
tests/test_chat.py::TestChatService::test_rag_chat_with_inputs PASSED               [ 62%]
tests/test_chat.py::TestChatService::test_rag_chat_with_knowledge_base_retrieval PASSED [ 75%]
tests/test_chat.py::TestChatService::test_rag_chat_no_retrieval_resources PASSED    [ 87%]
tests/test_chat.py::TestChatService::test_rag_chat_verify_dataset_usage PASSED      [100%]
tests/test_chat.py::TestChatService::test_rag_chat_multiple_datasets PASSED         [100%]

========================= 9 passed in 0.15s =========================
```

## 调试测试

### 显示 print 输出

```bash
pytest tests/test_chat.py -v -s
```

### 进入调试模式

```bash
# 遇到失败时进入 pdb
pytest tests/test_chat.py -v --pdb

# 详细输出
pytest tests/test_chat.py -vv
```

### 只运行失败的测试

```bash
# 第一次运行
pytest tests/test_chat.py -v

# 只重新运行失败的测试
pytest tests/test_chat.py --lf
```

## 集成测试（可选）

如果要运行真实的 Dify API 集成测试：

### 1. 配置环境变量

创建 `dify/.env` 文件：

```env
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_DATASET_API_KEY=dataset-xxx
DIFY_APP_DOC_DRAFT_KEY=app-xxx
DIFY_APP_DOC_CHECK_KEY=app-xxx
DIFY_APP_DOC_OPTIMIZE_KEY=app-xxx
DIFY_APP_ENTITY_EXTRACT_KEY=app-xxx
DIFY_APP_CHAT_KEY=app-xxx
```

### 2. 运行集成测试

```bash
# 运行所有集成测试
pytest tests/ -m integration -v

# 运行特定的集成测试
pytest tests/test_services.py -v
```

## 常见问题

### Q: 测试失败提示 "ModuleNotFoundError"

**解决：**
```bash
# 确保在 dify 目录下
cd dify

# 重新安装依赖
pip install -r requirements.txt
pip install -r tests/requirements-test.txt
```

### Q: 如何查看测试覆盖率？

**解决：**
```bash
# 生成 HTML 覆盖率报告
pytest tests/ -m unit --cov=dify/services/dify --cov-report=html

# 在浏览器中打开报告
# Windows
start htmlcov/index.html

# macOS
open htmlcov/index.html

# Linux
xdg-open htmlcov/index.html
```

### Q: 测试运行很慢怎么办？

**解决：**
```bash
# 并行运行测试（需要安装 pytest-xdist）
pip install pytest-xdist
pytest tests/ -m unit -n auto
```

## 持续集成 (CI)

在 CI/CD 流程中运行测试：

```yaml
# GitHub Actions 示例
- name: Run tests
  run: |
    cd dify
    pip install -r requirements.txt
    pip install -r tests/requirements-test.txt
    pytest tests/ -m unit --cov=dify/services/dify --cov-report=xml
```

## 参考文档

- [Pytest 文档](https://docs.pytest.org/)
