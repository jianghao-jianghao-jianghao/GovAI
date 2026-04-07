import { describe, expect, it } from "vitest";

import {
  buildFormatSuggestionInstructionText,
  buildFormatSuggestionsClipboardText,
  buildSingleFormatSuggestionClipboardText,
} from "./smartDocPanelUtils";

describe("smartDocPanelUtils", () => {
  it("builds a combined clipboard text for format suggestions", () => {
    const text = buildFormatSuggestionsClipboardText({
      formatSuggestResult: {
        doc_type_label: "公文请示",
        summary: {
          overall: "整体结构基本完整",
          recommended_preset: "标准公文",
        },
        suggestions: [],
      },
      formatSuggestions: [
        {
          category: "font",
          target: "标题",
          current: "宋体三号",
          suggestion: "改为方正小标宋体二号",
          standard: "GB/T 9704",
          priority: "high",
        },
      ],
    });

    expect(text).toContain("文档类型：公文请示");
    expect(text).toContain("总体评价：整体结构基本完整");
    expect(text).toContain("1. [字体] 标题");
    expect(text).toContain("推荐预设：标准公文");
  });

  it("builds instruction text from non-empty suggestions", () => {
    const text = buildFormatSuggestionInstructionText([
      {
        category: "spacing",
        target: "正文",
        current: "24磅",
        suggestion: "调整为28磅",
        standard: "",
        priority: "medium",
      },
      {
        category: "other",
        target: "附件说明",
        current: "",
        suggestion: "",
        standard: "",
        priority: "low",
      },
    ]);

    expect(text).toBe("正文：调整为28磅");
  });

  it("builds clipboard text for a single suggestion", () => {
    const text = buildSingleFormatSuggestionClipboardText({
      category: "alignment",
      target: "主标题",
      current: "左对齐",
      suggestion: "改为居中",
      standard: "标题应居中",
      priority: "medium",
    });

    expect(text).toContain("[对齐] 主标题");
    expect(text).toContain("当前：左对齐");
    expect(text).toContain("建议：改为居中");
    expect(text).toContain("标准：标题应居中");
  });
});
