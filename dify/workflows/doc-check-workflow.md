# doc-check-workflow（公文审查）设计稿

## 1. 目标

对公文草稿进行自动化检查，识别错别字、语法问题、敏感词以及格式规范问题。

## 2. 输入（inputs）

- `content` (string, required): 待审查的公文全文。

## 3. 输出（outputs）

- `typos` (array): 错别字列表。
- `grammar_issues` (array): 语法/语义问题。
- `sensitive_words` (array): 敏感词/违禁词。
- `format_issues` (array): 格式规范建议。
- `overall_score` (number): 评分（0-100）。
- `summary` (string): 整体评价。

## 4. 节点编排建议

- **节点 1：文本预处理**
  - 提取纯文本，去除冗余格式。

- **节点 2（并行）：三个 LLM 审查分支**
  - **分支 A（文字审查）**：专注错别字、别字、成语误用、专有名词。
  - **分支 B（逻辑与语法）**：专注主谓宾搭配、标点符号、语义连贯、句式规范。
  - **分支 C（合规与敏感性）**：专注政治敏感性、政策术语、涉密词汇（如有需要）。

- **节点 3：数据聚合与格式化**
  - 将各分支结果汇总，去除重复项，格式化为最终 JSON。

## 5. LLM Prompt（关键节点示例）

### System (审查任务)

你是一名严谨的公文审核专家，擅长发现文书中的各类瑕疵。你的目标是确保公文达到“零错别字、逻辑通顺、用语规范、立场正确”的标准。

### User (审查要求)

请对以下公文内容进行多维度审查：

{{content}}

输出格式必须严格遵循以下 JSON：
{
  "typos": [{"original": "...", "suggestion": "...", "reason": "...", "position": "..."}],
  "grammar_issues": [{"text": "...", "suggestion": "...", "severity": "error|warning"}],
  "sensitive_words": [{"word": "...", "suggestion": "..."}],
  "format_issues": [{"type": "...", "description": "..."}],
  "overall_score": 85,
  "summary": "..."
}
