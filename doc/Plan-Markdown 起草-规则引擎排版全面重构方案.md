Final deep research for implementation spec

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2363-2363)，行 2363 到 2420

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2800-2800)，行 2800 到 2940

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2940-2940)，行 2940 到 3210

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#3390-3390)，行 3390 到 3600

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#659-659)，行 659 到 703

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/api/documents.ts#330-330)，行 330 到 400

搜索文本 `def run_doc_draft_stream` (`**/backend/app/services/dify/client.py`)，1 个结果

搜索文本 `def _sse` (`**/backend/app/api/documents.py`)，1 个结果

搜索文本 `message_end` (`**/backend/app/services/dify/client.py`)，20 个结果

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/services/dify/client.py#877-877)，行 877 到 920

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/services/dify/client.py#960-960)，行 960 到 1050

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2572-2572)，行 2572 到 2595

搜索正则表达式 `handleAiProcessChunk|structured_paragraph|draft_result|case [""]` (`**/views/SmartDocView.tsx`)，14 个结果

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/api/documents.ts#400-400)，行 400 到 440

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/views/SmartDocView.tsx#2290-2290)，行 2290 到 2420

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2700-2700)，行 2700 到 2800

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/services/dify/client.py#920-920)，行 920 到 960

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2600-2600)，行 2600 到 2700

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/views/SmartDocView.tsx#2420-2420)，行 2420 到 2500

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/views/SmartDocView.tsx#2500-2500)，行 2500 到 2600

搜索正则表达式 `re_heading1|re_title|_RE_HEADING|_RE_TITLE` (`**/backend/app/api/documents.py`)，5 个结果

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#735-735)，行 735 到 800

Get remaining code sections

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2363-2363)，行 2363 到 2420

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2800-2800)，行 2800 到 2940

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2940-2940)，行 2940 到 3060

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#3060-3060)，行 3060 到 3210

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#606-606)，行 606 到 670

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#3390-3390)，行 3390 到 3600

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/services/dify/client.py#877-877)，行 877 到 940

搜索文本 `def _sse(` (`**/backend/app/api/documents.py`)，1 个结果

读取 [](file:///d%3A/apache-maven-3.9.1/GovAI/backend/app/api/documents.py#2572-2572)，行 2572 到 2600

已汇总会话历史记录## Plan: Markdown 起草 + 规则引擎排版 全面重构方案

将起草阶段从 JSON 输出切换为 **Markdown 纯文本**（新建）/ **行标记指令**（增量），排版阶段引入 **正则规则引擎 + LLM 降级** 混合模式。核心收益：消除 JSON 截断/续写不稳定问题，排版速度提升 5-10×，整体 token 消耗降低 ~40%。方案分为 **3 个批次 12 步**，建议由两个 Agent 窗口并行执行（Agent-A 负责后端 documents.py + client.py，Agent-B 负责 Dify Workflow YAML + 前端 + Redis）。

---

### 批次一：零功能变更的性能优化（Agent-B 先行）

#### Step 1 — 排版 Workflow 关闭 thinking

- 文件：Dify 管理后台或 workflows_dsl/智能文档排版.yml 中 LLM 节点
- 改动：`enable_thinking: true` → `false`（排版只需结构化输出，不需要推理链）
- 预计 token 节省 30-50%，排版延迟降低 ~40%

#### Step 2 — ThinkTagFilter reasoning 增量传输

- 文件：client.py `ThinkTagFilter` 类
- 当前问题：[L65, L85, L92, L105, L110](backend/app/services/dify/client.py#L65) 每次都发送完整 `self.all_reasoning` → O(n²)
- 改动：新增 `_last_sent_len` 字段，每次只 yield 增量 `delta = self.all_reasoning[self._last_sent_len:]`，SSE event data 新增 `"delta"` 字段
- 前端配合：[SmartDocView.tsx ~L2320](views/SmartDocView.tsx#L2320) 的 `reasoning` handler 改为追加模式 `setReasoningText(prev => prev + chunk.delta)`

#### Step 3 — 前端段落 RAF 批量合并

- 文件：[SmartDocView.tsx L2331-2334](views/SmartDocView.tsx#L2331-L2334) `structured_paragraph` handler
- 当前问题：每个段落 SSE 事件触发一次 `setAiStructuredParagraphs(prev => [...prev, para])`，N 段 = N 次 re-render
- 改动：引入 `_pendingParas: React.MutableRefObject<dict[]>` + `requestAnimationFrame` 批量 flush，每帧最多一次 setState

---

### 批次二：起草阶段重构 — Markdown + 行标记（Agent-A 主导）

#### Step 4 — 提取模块级正则常量

- 文件：[backend/app/api/documents.py L743-752](backend/app/api/documents.py#L743-L752)
- 当前问题：9 个正则（`re_heading1` ~ `re_attachment`）定义在 `_analyze_document_structure()` 函数内部，无法复用
- 改动：提取为模块级常量 `_RE_HEADING1` ~ `_RE_ATTACHMENT`（约 L30-50 区域），同时在 `_analyze_document_structure` 中引用新常量

#### Step 5 — 新建 `_parse_markdown_to_paragraphs()` 函数

- 文件：documents.py，在 `_strip_markdown_inline`（documents.py）之后插入
- 功能：接收 Markdown 纯文本，逐行匹配 Step 4 提取的正则 → 输出 `list[dict]`（每项含 `text` + `style_type`）
- 逻辑：
  - 跳过空行
  - 对每行依次匹配 `_RE_TITLE` → `_RE_RECIPIENT` → `_RE_HEADING1` → … → `_RE_DATE` → `_RE_ATTACHMENT`
  - 未匹配任何正则的行 → `style_type = "body"`
  - 调用 `_strip_markdown_inline()` 清除残留 Markdown 符号
- 约 40 行代码，无外部依赖

#### Step 6 — 新建 `_parse_line_diff_commands()` 函数

- 文件：同上，紧接 Step 5 函数之后
- 功能：解析增量模式 LLM 输出的行标记指令 → 输出 `list[dict]`，格式与 `_apply_draft_diff()`（[L2493-2571](backend/app/api/documents.py#L2493-L2571)）兼容
- 行标记语法：`[REPLACE:3|style:heading1] 新文本内容` / `[ADD:after=5|style:body] 新段落` / `[DELETE:7]` / `[NEED_INFO] 提示文字`
- 核心正则：`r'^\[(REPLACE|ADD|DELETE|NEED_INFO)(?::([^\]]*))?\]\s*(.*)'`
- 输出示例：`{"op": "replace", "index": 3, "text": "新文本", "style_type": "heading1"}`
- 约 35 行代码

#### Step 7 — 重写 Dify 起草 Workflow prompt

- 文件：Dify 管理后台「智能公文起草」App → LLM 节点 system prompt
- **新建模式 prompt**：要求输出 Markdown 纯文本（标题用 `#`，正文直接写，编号用 `一、` `（一）` 等中文编号），**禁止 JSON**
- **增量模式 prompt**：要求输出行标记指令格式（`[REPLACE:n|style:xx]`），仅输出变更行
- 同时在 Dify LLM 节点设置中：**移除** `response_format: json_object`（否则 Markdown 输出会被强制包裹在 JSON 中）
- `enable_thinking` 保持 `true`（起草需要推理）

#### Step 8 — 重写新建模式 SSE 流（核心，~80 行替换 ~280 行）

- 文件：[backend/app/api/documents.py L2826-3200](backend/app/api/documents.py#L2826-L3200)
- **替换范围**：从 `_PARA_FORMAT` 构造（L2828）到 fallback 结束（~L3220）
- **新逻辑**：
  1. **指令构造**：去除 `_PARA_FORMAT` JSON 模板，改为 `"请用 Markdown 格式输出完整公文。标题用 # 开头。"`
  2. **流式接收**：`_acc_text += chunk`（与现在相同），但不再做 `_find_brace_end` / `_process_cmd` 的 JSON 解析
  3. **逐行实时推送**：每收到 `\n` 时，对已完成的行调用 `_parse_markdown_to_paragraphs()` 单行版，yield `structured_paragraph` 事件
  4. **`message_end` 处理**：从 `sse_event.data` 中读取 `usage.completion_tokens`（[client.py L877+](backend/app/services/dify/client.py#L877) 已经 yield 此字段），若 `>= 15500` 且文档不完整（缺少 closing/signature/date）→ 触发续写
  5. **续写逻辑**（~30 行替代现有 149 行）：
     - 续写指令：`"请继续写。上文最后一段是：{last_para_text}。请从此处继续，确保文档有完整结尾。"`
     - 拼接方式：纯文本 append（`_acc_text += new_round_text`）
     - 续写次数上限：3 轮（Markdown 比 JSON 更高效，通常 1-2 轮足够）
     - 防死循环：本轮 `completion_tokens < 100` → 停止
  6. **最终处理**：整体 `_acc_text` 调用 `_parse_markdown_to_paragraphs()` → `_streamed_paras`，保存到 DB
- **删除的代码**：`_find_brace_end()`、`_process_cmd()`、`_check_json_truncated()`、`_in_array_mode` 逻辑、`jr_loads` fallback、整个 JSON 整体解析降级分支
- **保留的代码**：`_sse()`、`_capture_usage()`、`_record_stage_usage()`、Redis 锁、KB 检索全部不变

#### Step 9 — 重写增量模式 SSE 流

- 文件：同上，documents.py 增量指令构造 + documents.py 结果处理
- **指令构造**：替换 JSON 示例为行标记示例（`[REPLACE:3|style:heading1] 新文本`）
- **流式接收**：累积文本，每收到 `\n` 时尝试 `_parse_line_diff_commands()` 解析当前行
- **结果处理**：收集所有 commands → 调用 `_apply_draft_diff()`（[L2493-2571](backend/app/api/documents.py#L2493-L2571) **零修改**）→ yield `draft_result`
- **续写**：增量模式通常 <20 行指令，**不需要续写**，但保留 `completion_tokens >= 15500` 安全阀

---

### 批次三：排版阶段规则引擎 + LLM 混合（Agent-A + Agent-B 协作）

#### Step 10 — 新建 `_detect_style_with_confidence()` 函数

- 文件：documents.py，在 Step 5 函数之后
- 功能：对单段落文本返回 `(style_type, confidence: float)`
- 逻辑：复用 Step 4 的模块级正则，按优先级匹配；匹配成功 `confidence=0.95`，启发式匹配（长度 < 20 字 + 无标点 → 可能是标题）`confidence=0.6`，兜底 `("body", 0.3)`
- 可选：Redis 缓存 `style_rules:{pattern_hash}` 查询历史学习结果，命中则 confidence += 0.1

#### Step 11 — 新建 `_rules_format_paragraphs()` 函数

- 文件：同上
- 功能：接收 `list[dict]`（段落列表），对每段调用 `_detect_style_with_confidence()` + `_apply_format_template()`（[L1381-1390](backend/app/api/documents.py#L1381-L1390) **零修改**）
- 逻辑：
  - confidence >= 0.8 → 直接应用 `_FORMAT_TEMPLATES[doc_type]` 模板属性，标记 `_rule_formatted = True`
  - confidence < 0.8 → 标记 `_needs_llm = True`，收集到 `_llm_batch` 列表
- 返回：`(formatted_paras: list[dict], llm_needed_indices: list[int])`

#### Step 12 — 重写排版 4 路策略为"规则优先 + LLM 降级"

- 文件：[backend/app/api/documents.py L3397-3600](backend/app/api/documents.py#L3397-L3600)
- **新逻辑**：
  1. 先调用 `_rules_format_paragraphs()` 处理全部段落
  2. 对 `_rule_formatted=True` 的段落立即 yield `structured_paragraph`（毫秒级）
  3. 若存在 `_needs_llm` 段落 → 组装为紧凑文本，调用 `dify.run_doc_format_stream()`（仅发送需要 LLM 的部分）
  4. LLM 返回结果合并回完整段落列表
- **保留**：分块逻辑（长文档 LLM 部分仍需分块），`_chunked_format_stream` / `_chunked_incremental_format_stream` 作为 LLM 降级路径
- **Redis 学习**（可选增强）：LLM 返回的 `style_type` 与 `_detect_style_with_confidence` 不同时，将 `{text_pattern → llm_style_type}` 写入 Redis hash `style_rules:{doc_type}`，下次同类文本可命中缓存

---

### 两个 Agent 窗口的分工建议

| 窗口                          | 负责步骤                             | 涉及文件                                         |
| ----------------------------- | ------------------------------------ | ------------------------------------------------ |
| **Agent-A**（后端核心）       | Step 4, 5, 6, 8, 9, 10, 11, 12       | documents.py                                     |
| **Agent-B**（Dify/前端/辅助） | Step 1, 2, 3, 7 + Step 12 Redis 部分 | client.py, SmartDocView.tsx, Dify YAML, redis.py |

**执行顺序**：批次一（Step 1-3）两个 Agent 可并行 → 批次二（Step 4-9）Agent-A 主导，Agent-B 同步改 Dify prompt → 批次三（Step 10-12）Agent-A 主导，Agent-B 配合 Redis

---

### 进一步考虑

1. **Dify Workflow 的 `response_format` 移除风险**：当前起草 Workflow 设置了 `json_object`，移除后 LLM 可能偶尔输出额外解释文字。建议在 system prompt 末尾加强约束 `"只输出公文正文，不要任何解释或说明"`，并在后端添加简单的前缀/后缀清理（去除 `"以下是..."` 等）。
2. **向后兼容**：建议保留 `_find_brace_end` + `_process_cmd` + JSON fallback 作为降级路径（`try Markdown parse → fallback to JSON parse`），这样即使 Dify prompt 未及时更新也不会崩溃。过渡期后再删除。
3. **`_apply_draft_diff` 的 `style_type` 可选字段**：行标记 `[REPLACE:3|style:heading1]` 中的 `style` 部分应为可选——如果 LLM 只修改文字不改样式，不传 `style_type`，`_apply_draft_diff` 会保留原值。需确认当前实现是否已支持（从 documents.py 看，`style_type` 是 `.get()` 取的，应该兼容）。
