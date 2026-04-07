import { describe, expect, it } from "vitest";

import { AI_PROCESS_CHUNK_TYPES } from "../api";
import {
  buildAiProcessInstruction,
  getAiReasoningUpdate,
  resolveCommonAiFeedbackChunk,
  normalizeAiStreamingResult,
  prependDraftHeadingConstraint,
  shouldReplaceHeartbeatStatus,
} from "./smartDocAiFlowUtils";

describe("smartDocAiFlowUtils", () => {
  it("prepends draft heading constraints when heading level is specified", () => {
    const result = prependDraftHeadingConstraint("请起草一份请示", 2);

    expect(result).toContain("本文档最多使用到2级标题");
    expect(result).toContain("请起草一份请示");
  });

  it("builds format instructions from preset and user supplement", () => {
    const result = buildAiProcessInstruction({
      stageId: "format",
      aiInstruction: "请再紧凑一点",
      selectedPreset: {
        name: "标准公文",
        instruction: "默认说明",
        systemPrompt: "严格按公文规范排版",
      },
      draftHeadingLevel: -1,
    });

    expect(result).toContain("【排版格式 - 标准公文】");
    expect(result).toContain("严格按公文规范排版");
    expect(result).toContain("【补充要求】");
    expect(result).toContain("请再紧凑一点");
  });

  it("keeps non-format non-draft instructions unchanged", () => {
    const result = buildAiProcessInstruction({
      stageId: "review",
      aiInstruction: "请审查措辞",
      selectedPreset: null,
      draftHeadingLevel: 0,
    });

    expect(result).toBe("请审查措辞");
  });

  it("normalizes streamed json into readable text", () => {
    const result = normalizeAiStreamingResult(
      JSON.stringify({
        request_more: ["补充主送机关"],
        paragraphs: [{ text: "第一段正文" }],
        message: "请继续补充细节",
      }),
    );

    expect(result).toContain("AI 需要更多信息来完成任务：");
    expect(result).toContain("• 补充主送机关");
    expect(result).toContain("第一段正文");
    expect(result).toContain("请继续补充细节");
  });

  it("resolves reasoning updates from delta and final payloads", () => {
    expect(
      getAiReasoningUpdate({
        delta: "先分析标题",
        reasoning_text: "",
        text: "",
        partial: true,
      }),
    ).toEqual({
      mode: "delta",
      text: "先分析标题",
    });

    expect(
      getAiReasoningUpdate({
        delta: "",
        reasoning_text: "分析完成",
        text: "",
        partial: false,
      }),
    ).toEqual({
      mode: "final",
      text: "分析完成",
    });
  });

  it("replaces heartbeat statuses only when both sides are heartbeat updates", () => {
    expect(
      shouldReplaceHeartbeatStatus("AI 正在深度分析文档结构…", "AI 正在生成正文…"),
    ).toBe(true);
    expect(
      shouldReplaceHeartbeatStatus("⚠ 排版分析稍慢，继续处理中", "正在格式化第 3 / 10 段"),
    ).toBe(true);
    expect(
      shouldReplaceHeartbeatStatus("⚠ 无效段落索引: 3", "正在格式化第 3 / 10 段"),
    ).toBe(false);
    expect(shouldReplaceHeartbeatStatus("处理完成", "正在格式化第 3 / 10 段")).toBe(
      false,
    );
  });

  it("resolves common ai feedback chunks with fallback messages", () => {
    expect(
      resolveCommonAiFeedbackChunk({
        type: AI_PROCESS_CHUNK_TYPES.status,
        message: "",
        delta: "",
        reasoning_text: "",
        text: "",
        partial: true,
      }),
    ).toEqual({
      type: "status",
      message: "处理中…",
    });

    expect(
      resolveCommonAiFeedbackChunk(
        {
          type: AI_PROCESS_CHUNK_TYPES.error,
          message: "",
          delta: "",
          reasoning_text: "",
          text: "",
          partial: true,
        },
        {
          defaultError: "排版建议生成出错",
        },
      ),
    ).toEqual({
      type: "error",
      message: "排版建议生成出错",
    });

    expect(
      resolveCommonAiFeedbackChunk({
        type: AI_PROCESS_CHUNK_TYPES.reasoning,
        message: "",
        delta: "继续推理",
        reasoning_text: "",
        text: "",
        partial: true,
      }),
    ).toEqual({
      type: "reasoning",
      update: {
        mode: "delta",
        text: "继续推理",
      },
    });
  });
});
