import type { FormatSuggestResult, FormatSuggestionItem } from "../api";

export const FORMAT_SUGGESTION_CATEGORY_LABELS: Record<string, string> = {
  font: "字体",
  spacing: "间距",
  alignment: "对齐",
  indent: "缩进",
  structure: "结构",
  page: "页面",
  other: "其他",
};

export const FORMAT_SUGGESTION_CATEGORY_ICONS: Record<string, string> = {
  font: "🔤",
  spacing: "↕️",
  alignment: "↔️",
  indent: "➡️",
  structure: "🏗️",
  page: "📄",
  other: "📌",
};

export const FORMAT_SUGGESTION_PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const FORMAT_SUGGESTION_PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

export function getFormatSuggestionCategoryLabel(category: string): string {
  return FORMAT_SUGGESTION_CATEGORY_LABELS[category] || category;
}

export function buildFormatSuggestionInstructionText(
  formatSuggestions: FormatSuggestionItem[],
): string {
  return formatSuggestions
    .filter((suggestion) => suggestion.suggestion)
    .map((suggestion) => `${suggestion.target}：${suggestion.suggestion}`)
    .join("；");
}

export function buildFormatSuggestionsClipboardText({
  formatSuggestResult,
  formatSuggestions,
}: {
  formatSuggestResult: FormatSuggestResult | null;
  formatSuggestions: FormatSuggestionItem[];
}): string {
  const lines: string[] = [];

  if (formatSuggestResult?.doc_type_label) {
    lines.push(`文档类型：${formatSuggestResult.doc_type_label}`);
  }
  if (formatSuggestResult?.summary?.overall) {
    lines.push(`总体评价：${formatSuggestResult.summary.overall}`);
  }
  lines.push("");
  lines.push("排版建议：");

  formatSuggestions.forEach((suggestion, index) => {
    const category = getFormatSuggestionCategoryLabel(suggestion.category);
    let line = `${index + 1}. [${category}] ${suggestion.target}`;
    if (suggestion.current) line += ` — 当前：${suggestion.current}`;
    line += ` → 建议：${suggestion.suggestion}`;
    if (suggestion.standard) line += `（${suggestion.standard}）`;
    lines.push(line);
  });

  if (formatSuggestResult?.summary?.recommended_preset) {
    lines.push("");
    lines.push(`推荐预设：${formatSuggestResult.summary.recommended_preset}`);
  }

  return lines.join("\n");
}

export function buildSingleFormatSuggestionClipboardText(
  suggestion: FormatSuggestionItem,
): string {
  let text = `[${getFormatSuggestionCategoryLabel(suggestion.category)}] ${
    suggestion.target
  }`;
  if (suggestion.current) text += `\n当前：${suggestion.current}`;
  text += `\n建议：${suggestion.suggestion}`;
  if (suggestion.standard) text += `\n标准：${suggestion.standard}`;
  return text;
}
