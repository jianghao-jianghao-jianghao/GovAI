import {
  AI_PROCESS_CHUNK_TYPES,
  type AiProcessChunk,
} from "../api";

export type SmartDocAiStageId =
  | "draft"
  | "review"
  | "format"
  | "format_suggest";

export type SmartDocFormatPresetLike = {
  name: string;
  instruction: string;
  systemPrompt?: string;
};

type AiReasoningSource = Pick<
  AiProcessChunk,
  "delta" | "reasoning_text" | "text" | "partial"
>;

type AiFeedbackSource = Pick<
  AiProcessChunk,
  "type" | "message" | "delta" | "reasoning_text" | "text" | "partial"
>;

export type AiReasoningUpdate =
  | { mode: "delta"; text: string }
  | { mode: "partial"; text: string }
  | { mode: "final"; text: string };

export type CommonAiFeedback =
  | { type: "reasoning"; update: AiReasoningUpdate }
  | { type: "status"; message: string }
  | { type: "error"; message: string };

export function isAiHeartbeatStatus(message: string): boolean {
  return (
    /^AI 正在(深度分析|排版分析|生成)/.test(message) ||
    /^正在格式化第/.test(message) ||
    (/^⚠/.test(message) && !/无效段落索引/.test(message))
  );
}

export function shouldReplaceHeartbeatStatus(
  previousMessage: string | undefined,
  nextMessage: string,
): boolean {
  return Boolean(
    previousMessage &&
      isAiHeartbeatStatus(previousMessage) &&
      isAiHeartbeatStatus(nextMessage),
  );
}

export function getAiReasoningUpdate(
  chunk: AiReasoningSource,
): AiReasoningUpdate | null {
  const delta = chunk.delta || "";
  const text = chunk.reasoning_text || chunk.text || "";
  const partial = chunk.partial !== false;

  if (delta) {
    return {
      mode: "delta",
      text: delta,
    };
  }

  if (!text) {
    return null;
  }

  return {
    mode: partial ? "partial" : "final",
    text,
  };
}

export function resolveCommonAiFeedbackChunk(
  chunk: AiFeedbackSource,
  options?: {
    defaultStatus?: string;
    defaultError?: string;
  },
): CommonAiFeedback | null {
  switch (chunk.type) {
    case AI_PROCESS_CHUNK_TYPES.reasoning: {
      const update = getAiReasoningUpdate(chunk);
      return update ? { type: "reasoning", update } : null;
    }
    case AI_PROCESS_CHUNK_TYPES.status:
      return {
        type: "status",
        message: chunk.message || options?.defaultStatus || "处理中…",
      };
    case AI_PROCESS_CHUNK_TYPES.error:
      return {
        type: "error",
        message: chunk.message || options?.defaultError || "AI 处理出错",
      };
    default:
      return null;
  }
}

export function prependDraftHeadingConstraint(
  instruction: string,
  draftHeadingLevel: number,
): string {
  if (draftHeadingLevel === -1) return instruction;

  const headingConstraint =
    draftHeadingLevel === 0
      ? "【标题层级要求 — 最高优先级】\n⚠️ 本文档不使用任何分级标题，全部内容作为正文段落输出（如请示件、批复件格式）。严禁添加一、二、三级等任何标题编号。"
      : `【标题层级要求 — 最高优先级】\n本文档最多使用到${draftHeadingLevel}级标题。${
          draftHeadingLevel >= 1 ? "一级标题用（一、二、三、）" : ""
        }${draftHeadingLevel >= 2 ? "，二级标题用（（一）（二）（三））" : ""}${
          draftHeadingLevel >= 3 ? "，三级标题用 1. 2. 3." : ""
        }${draftHeadingLevel >= 4 ? "，四级标题用 (1) (2) (3)" : ""}。不要使用超出指定层级的标题编号。`;

  return instruction
    ? `${headingConstraint}\n\n${instruction}`
    : headingConstraint;
}

export function buildAiProcessInstruction({
  stageId,
  aiInstruction,
  selectedPreset,
  draftHeadingLevel,
}: {
  stageId: SmartDocAiStageId;
  aiInstruction: string;
  selectedPreset?: SmartDocFormatPresetLike | null;
  draftHeadingLevel: number;
}): string {
  let finalInstruction = aiInstruction;

  if (stageId === "format") {
    const parts: string[] = [];
    if (selectedPreset) {
      const prompt = selectedPreset.systemPrompt || selectedPreset.instruction;
      parts.push(`【排版格式 - ${selectedPreset.name}】\n${prompt}`);
    }
    if (aiInstruction.trim()) {
      parts.push(
        parts.length > 0
          ? `【补充要求】\n${aiInstruction.trim()}`
          : aiInstruction.trim(),
      );
    }
    finalInstruction = parts.join("\n\n");
  }

  if (stageId === "draft") {
    finalInstruction = prependDraftHeadingConstraint(
      finalInstruction,
      draftHeadingLevel,
    );
  }

  return finalInstruction;
}

export function normalizeAiStreamingResult(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return content;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      const lines: string[] = [];
      if (parsed.request_more && Array.isArray(parsed.request_more)) {
        lines.push("AI 需要更多信息来完成任务：");
        parsed.request_more.forEach((item: unknown) => {
          if (typeof item === "string") lines.push(`• ${item}`);
        });
      }
      if (parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
        parsed.paragraphs.forEach((p: unknown) => {
          if (typeof p === "string" && p.trim()) lines.push(p);
          else if (
            typeof p === "object" &&
            p !== null &&
            "text" in p &&
            typeof p.text === "string"
          ) {
            lines.push(p.text);
          }
        });
      }
      if (typeof parsed.message === "string") {
        lines.push(parsed.message);
      }
      if (lines.length > 0) return lines.join("\n");
      return "AI 返回了空结果，请尝试提供更详细的指令。";
    }
  } catch {
    const matches = trimmed.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
    const extracted: string[] = [];
    for (const match of matches) {
      const value = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      if (value.trim()) extracted.push(value.trim());
    }
    if (extracted.length > 0) return extracted.join("\n");
  }

  return content;
}
