# qa-chat-workflow（RAG 问答）设计稿

## 1. 目标

实现“知识库优先”的智能问答：

- 优先基于已授权知识库（Dataset）检索并回答
- 返回可用于前端展示的引用来源（citations / retriever_resources）
- 支持多轮对话（conversation_id）
- 支持流式输出（SSE）

## 2. Dify 应用形态建议

- 若你希望最稳定的 SSE 事件与引用字段：优先用 **Chat App**（`/chat-messages`）
- 若你希望把 RAG / 规则 / 结构化输出全部强控：可以用 **Workflow** 并启用 streaming

本项目的 OpenAPI 约定是：RAG 问答使用 `POST /chat-messages`。

## 3. 输入

Chat App 请求体：

- `query` (string, required)
- `conversation_id` (string, optional)
- `user` (string, required)
- `inputs` (object, optional)

建议在 Dify Chat App 中定义以下 inputs（可选）：

- `dataset_ids` (array[string])：前端选择的 KB（若 Dify 支持动态选择；否则由后端预检索再拼 context）
- `scene` (string)：问答场景（制度查询/流程咨询/业务答疑）

> 注意：不同 Dify 版本对“动态 dataset_ids”支持不一致。若不能动态指定数据集，采用“应用固定绑定某些 Dataset + 后端用权限控制可选范围”的方式。

## 4. 输出（SSE）

- `message` 事件：增量 `answer`
- `message_end`：`metadata.retriever_resources` 引用列表

后端A应保存：

- 最终 answer 文本
- citations（从 retriever_resources 转换）
- dify conversation_id（写入 `chat_sessions.dify_conversation_id`）

## 5. Prompt（Chat App 系统提示词建议）

### System

你是一个严谨的法规/制度问答助手。你必须优先使用知识库检索到的内容作答，并给出依据。

规则：
- 如果知识库没有足够依据，请明确说明“知识库未检索到直接依据”，并给出建议的补充信息或下一步查询方向。
- 不要编造具体条款编号、文件名称、发布日期。
- 回答要简洁、结构清晰（可用分点）。
- 输出简体中文。

### 需要 Dify 返回引用

请确保引用信息可在 `retriever_resources` 中返回。

## 6. 检索策略建议

- `search_method`: `hybrid_search`
- `top_k`: 5~8
- `score_threshold`: 0.45~0.6（根据召回噪声调整）
- 若启用 rerank：优先保证延迟可接受

## 7. 多轮对话策略

- 只携带最近 N 轮（例如 5 轮）上下文，避免 prompt 过长
- 对于“追问型”问题，优先基于上一轮 citations 进行补充解释
