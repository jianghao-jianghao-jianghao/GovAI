# doc-draft-workflow（公文起草）设计稿

## 1. 目标

根据用户的起草需求与模板（可选参考素材/知识库检索结果），生成符合“军用/政务公文”风格的草稿。

## 2. 输入（inputs）

- `template_content` (string, required)
- `user_requirement` (string, required)
- `reference_materials` (string, optional)

> 如需引用知识库：推荐在 Workflow 内部增加 RAG 节点，将召回内容拼入 `reference_materials` 或另设 `rag_context`。

## 3. 输出（outputs）

- `generated_text` (string)
- `sections` (array, optional)

建议 `generated_text` 为可直接展示/可导出的全文；`sections` 用于前端做结构化渲染。

## 4. 节点编排建议

- Node A：输入校验/清洗
  - 若 `template_content` 过短：提示用户选择模板或提供格式要求

- Node B（可选）：RAG 检索
  - 输入：`user_requirement`
  - 数据集：由后端A控制（通常在业务层先选定可引用的 KB，再把检索结果传入），或在 Dify 应用里固定数据集
  - 输出：`rag_context`

- Node C：LLM 生成
  - Prompt 见下
  - 输出：`generated_text`、`sections`

## 5. LLM Prompt（建议）

### System

你是一个军政公文写作助手。你的任务是基于用户的起草要求、给定的模板与参考材料，生成结构严谨、措辞规范、符合公文格式的草稿。

严格要求：
- 不要编造不存在的政策条款、编号、日期、单位名称。
- 如果参考材料不足以支撑结论，必须用“需进一步核实/待补充依据”的措辞。
- 输出必须使用简体中文。

### User

【起草要求】
{{user_requirement}}

【模板】
{{template_content}}

【参考材料】
{{reference_materials}}

请生成公文草稿。

输出 JSON：
{
  "generated_text": "...全文...",
  "sections": [
    {"title": "标题", "content": "..."},
    {"title": "主送机关", "content": "..."},
    {"title": "正文", "content": "..."},
    {"title": "落款", "content": "..."},
    {"title": "日期", "content": "..."}
  ]
}

要求：
- generated_text 必须与 sections 内容一致。
- 若模板包含占位符（如 {{"{{主题}}"}}），请合理替换。
