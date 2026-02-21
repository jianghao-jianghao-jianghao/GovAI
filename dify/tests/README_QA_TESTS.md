# QA库两级查询测试文档

## 概述

本目录包含QA库两级查询功能的测试代码，用于验证以下查询逻辑的可行性：

1. **先查询QA库** - 使用固定的QA知识库（dataset-02rZJb5w1S39SMUQMXT2sQR2）
2. **判断是否命中** - 如果QA库返回的相关性分数 >= 0.85，直接返回答案
3. **回退到知识库** - 如果QA库未命中，查询用户指定的知识库
4. **调用工作流** - 将知识库检索结果传递给智能问答工作流
5. **返回最终答案** - 返回工作流生成的答案和引用来源

## 文件说明

### 1. `test_qa_fallback_workflow.py`
**单元测试** - 使用mock进行测试，不需要真实的Dify服务

**测试场景：**
- ✅ QA库命中，直接返回答案
- ✅ QA库未命中，回退到知识库 + 工作流
- ✅ QA库返回空结果
- ✅ 多用户场景（不同用户使用不同知识库）
- ✅ 边界情况（阈值边界、知识库空结果等）

**运行方法：**
```bash
# 进入测试目录
cd backend-front/dify/tests

# 运行单元测试
pytest test_qa_fallback_workflow.py -v

# 只运行特定测试类
pytest test_qa_fallback_workflow.py::TestQAFallbackWorkflow -v

# 运行特定测试方法
pytest test_qa_fallback_workflow.py::TestQAFallbackWorkflow::test_qa_hit_direct_return -v
```

### 2. `test_qa_integration_real.py`
**集成测试** - 在真实Dify环境中测试，需要配置真实的API Key

**测试内容：**
- ✅ 验证QA库检索功能
- ✅ 验证两级查询逻辑（QA库命中场景）
- ✅ 验证两级查询逻辑（QA库未命中场景）
- ✅ 展示工作流输入格式

**配置步骤：**

1. 确保Dify服务正在运行：
   ```bash
   # 检查Dify服务
   curl http://127.0.0.1:19090/v1/info
   ```

2. 修改脚本中的配置：
   ```python
   # QA库配置（已配置）
   QA_DATASET_ID = "7047121a-8b6e-487c-893c-3ed489e0fd87"
   QA_API_KEY = "dataset-02rZJb5w1S39SMUQMXT2sQR2"
   
   # 用户知识库配置（需要替换）
   USER_DATASET_ID = "your-user-dataset-id"
   USER_DATASET_API_KEY = "your-user-dataset-api-key"
   
   # 工作流配置（需要替换）
   QA_WORKFLOW_API_KEY = "your-qa-workflow-api-key"
   ```

3. 运行集成测试：
   ```bash
   cd backend-front/dify/tests
   python test_qa_integration_real.py
   ```

### 3. `../services/dify/qa_service.py`
**服务层实现** - 封装了两级查询逻辑的完整实现

**主要功能：**
- `query()` - 执行两级查询（阻塞模式）
- `query_streaming()` - 执行两级查询（流式模式）
- `_query_qa_library()` - 查询QA库
- `_query_knowledge_base()` - 查询用户知识库
- `_call_qa_workflow()` - 调用智能问答工作流

**使用示例：**
```python
from services.dify import DifyClient, QAService

# 创建客户端和服务
client = DifyClient(base_url="http://127.0.0.1:19090/v1")
qa_service = QAService(client)

# 执行查询
result = await qa_service.query(
    query="什么是数据分类分级",
    user_dataset_id="user-dataset-123",
    user_dataset_api_key="dataset-key-123",
    workflow_api_key="workflow-key-123",
    user="user-001"
)

# 结果格式
{
    "answer": "答案内容",
    "source": "qa" | "workflow" | "fallback",
    "qa_score": 0.95,
    "citations": [...],
    "metadata": {...}
}
```

## 测试结果示例

### 场景1: QA库命中
```
查询: 什么是数据分类分级

[步骤1] 查询QA库...
  ✓ QA库返回结果
    相关性分数: 0.950
    阈值: 0.850

[结果] ✓ QA库命中！直接返回答案

答案: 数据分类分级是根据数据重要性和敏感性进行分类管理的制度...

流程结束 - 无需查询知识库和工作流
```

### 场景2: QA库未命中，回退到知识库
```
查询: 如何实施具体的数据安全技术措施

[步骤1] 查询QA库...
  ✓ QA库返回结果
    相关性分数: 0.720
    阈值: 0.850

[步骤2] QA库未命中，查询用户知识库...
  ✓ 找到 2 条相关文档
    [1] 数据安全管理办法.pdf (分数: 0.920)
    [2] 数据安全技术指南.pdf (分数: 0.880)

[步骤3] 调用智能问答工作流...
  ✓ 工作流执行成功

最终答案: 根据检索到的资料，数据安全技术措施包括：
1. 建立健全数据安全管理制度
2. 采取加密、访问控制等技术措施
3. 定期开展数据安全风险评估
...
```

## 配置说明

### QA库配置
- **数据集ID**: `7047121a-8b6e-487c-893c-3ed489e0fd87`
- **API Key**: `dataset-02rZJb5w1S39SMUQMXT2sQR2`
- **访问地址**: http://127.0.0.1:19090/datasets/7047121a-8b6e-487c-893c-3ed489e0fd87/documents
- **命中阈值**: 0.85（可调整）

### 用户知识库配置
- 每个用户可以有不同的知识库
- 前端需要传递用户的 `dataset_id` 和 `api_key`
- 支持多个知识库同时查询

### 工作流配置
- 使用智能问答工作流（需要配置API Key）
- 输入格式：
  ```json
  {
    "query": "用户问题",
    "context": "从知识库检索到的内容",
    "dataset_ids": ["dataset-id-1"]
  }
  ```

## 性能优化建议

1. **缓存QA库结果**
   - 对于常见问题，可以缓存QA库的查询结果
   - 减少重复查询，提高响应速度

2. **并行查询**
   - 如果QA库分数接近阈值，可以并行查询知识库
   - 减少总体响应时间

3. **分数阈值调优**
   - 根据实际使用情况调整阈值（当前0.85）
   - 过高：QA库命中率低，增加工作流调用
   - 过低：可能返回不准确的QA答案

4. **知识库检索优化**
   - 使用混合检索（向量 + 全文）提高准确性
   - 启用重排序（reranking）提高相关性
   - 调整 top_k 和 score_threshold 参数

## 错误处理

### QA库查询失败
- 不中断流程，直接查询知识库
- 记录错误日志

### 知识库查询失败
- 返回友好提示："抱歉，暂时无法查询知识库"
- 记录错误日志

### 工作流调用失败
- 回退到简单拼接检索结果
- 返回："根据检索到的资料：[内容]"

## 后续开发建议

1. **集成到后端API**
   - 在 `backend/app/api/qa.py` 中创建查询接口
   - 使用 `QAService` 处理查询逻辑

2. **前端集成**
   - 前端调用后端API，传递用户问题和知识库ID
   - 支持流式显示（实时返回答案）

3. **监控和日志**
   - 记录QA库命中率
   - 记录知识库查询性能
   - 记录工作流调用成功率

4. **用户反馈**
   - 允许用户对答案进行评分
   - 收集未命中的问题，补充到QA库

## 常见问题

### Q1: QA库命中率太低怎么办？
A: 
- 降低阈值（如从0.85降到0.80）
- 补充更多QA对到QA库
- 优化QA库中问题的表述

### Q2: 工作流返回的答案质量不高？
A:
- 检查知识库检索结果是否相关
- 调整知识库检索参数（top_k, score_threshold）
- 优化工作流的prompt设计

### Q3: 如何支持多个QA库？
A:
- 可以按优先级查询多个QA库
- 修改 `_query_qa_library()` 支持多个数据集ID

### Q4: 如何实现缓存？
A:
```python
from functools import lru_cache
import hashlib

@lru_cache(maxsize=1000)
async def _query_qa_library_cached(query_hash: str):
    # 实现缓存逻辑
    pass
```

## 联系方式

如有问题，请联系开发团队。
