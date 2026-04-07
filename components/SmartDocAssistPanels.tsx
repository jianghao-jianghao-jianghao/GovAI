import React from "react";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";

import type { FormatSuggestResult, FormatSuggestionItem } from "../api";
import type { StructuredParagraph } from "./StructuredDocRenderer";
import {
  buildFormatSuggestionInstructionText,
  buildFormatSuggestionsClipboardText,
  buildSingleFormatSuggestionClipboardText,
  FORMAT_SUGGESTION_CATEGORY_ICONS,
  FORMAT_SUGGESTION_CATEGORY_LABELS,
  FORMAT_SUGGESTION_PRIORITY_LABELS,
  FORMAT_SUGGESTION_PRIORITY_STYLES,
  getFormatSuggestionCategoryLabel,
} from "./smartDocPanelUtils";

type ToastLike = {
  success: (message: string) => void;
};

interface SmartDocAssistPanelsProps {
  showOutlinePanel: boolean;
  outlineText: string;
  showFormatSuggestPanel: boolean;
  formatSuggestions: FormatSuggestionItem[];
  isFormatSuggesting: boolean;
  formatSuggestResult: FormatSuggestResult | null;
  formatSuggestParas: StructuredParagraph[];
  toast: ToastLike;
  onOutlineChange: (text: string) => void;
  onConfirmOutline: () => void;
  onRegenerateOutline: () => void;
  onSkipOutline: () => void;
  onCloseFormatSuggest: () => void;
  onReplaceAiInstruction: (instruction: string) => void;
  onAppendAiInstruction: (instruction: string) => void;
  onApplyFormatSuggestParas: (paragraphs: StructuredParagraph[]) => void;
}

export const SmartDocAssistPanels: React.FC<SmartDocAssistPanelsProps> = ({
  showOutlinePanel,
  outlineText,
  showFormatSuggestPanel,
  formatSuggestions,
  isFormatSuggesting,
  formatSuggestResult,
  formatSuggestParas,
  toast,
  onOutlineChange,
  onConfirmOutline,
  onRegenerateOutline,
  onSkipOutline,
  onCloseFormatSuggest,
  onReplaceAiInstruction,
  onAppendAiInstruction,
  onApplyFormatSuggestParas,
}) => {
  const hasFormatSuggestions =
    showFormatSuggestPanel &&
    (formatSuggestions.length > 0 || isFormatSuggesting);

  return (
    <>
      {showOutlinePanel && outlineText && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden bg-gradient-to-br from-emerald-50/60 to-teal-50/60">
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/80 border-b border-emerald-100">
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <FileText size={15} className="text-emerald-500" />
              AI 已生成大纲，请确认后展开正文
            </span>
          </div>
          <div className="p-3">
            <textarea
              value={outlineText}
              onChange={(event) => onOutlineChange(event.target.value)}
              className="w-full border border-emerald-200 rounded-md px-3 py-2 text-sm font-mono leading-relaxed bg-white resize-y outline-none focus:ring-2 focus:ring-emerald-300 min-h-[120px] max-h-[300px]"
              rows={8}
              placeholder="大纲内容…"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={onConfirmOutline}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Check size={15} />
                确认大纲并展开正文
              </button>
              <button
                onClick={onRegenerateOutline}
                className="px-3 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
              >
                <Undo2 size={14} />
                重新生成
              </button>
              <button
                onClick={onSkipOutline}
                className="px-3 py-2 border border-gray-300 text-gray-500 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
              >
                <SkipForward size={14} />
                跳过大纲
              </button>
            </div>
          </div>
        </div>
      )}

      {hasFormatSuggestions && (
        <div className="border rounded-lg bg-amber-50/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-amber-100/60 border-b">
            <span className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
              <Lightbulb size={14} className="text-amber-600" />
              排版建议
              {formatSuggestions.length > 0 && (
                <span className="bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {formatSuggestions.length}
                </span>
              )}
              {isFormatSuggesting && (
                <span className="ml-1 text-amber-600">
                  <Loader2 className="animate-spin inline" size={12} /> 分析中…
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {formatSuggestions.length > 0 && !isFormatSuggesting && (
                <>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        buildFormatSuggestionsClipboardText({
                          formatSuggestResult,
                          formatSuggestions,
                        }),
                      );
                      toast.success("排版建议已复制到剪贴板");
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
                    title="复制全部建议到剪贴板"
                  >
                    <Copy size={12} />
                    <span>复制全部</span>
                  </button>
                  <button
                    onClick={() => {
                      onReplaceAiInstruction(
                        buildFormatSuggestionInstructionText(formatSuggestions),
                      );
                      onCloseFormatSuggest();
                      toast.success("建议已填入排版指令");
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
                    title="将全部建议填入排版指令"
                  >
                    <ArrowRight size={12} />
                    <span>填入指令</span>
                  </button>
                  {formatSuggestParas.length > 0 && (
                    <button
                      onClick={() => {
                        onApplyFormatSuggestParas(formatSuggestParas);
                        onCloseFormatSuggest();
                        const changeCount = formatSuggestParas.filter(
                          (paragraph) => paragraph._change,
                        ).length;
                        toast.success(
                          `已应用规则引擎排版（${changeCount} 段变更）`,
                        );
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-100 hover:bg-green-200 rounded-md transition-colors"
                      title="一键应用规则引擎排版结果"
                    >
                      <CheckCircle size={12} />
                      <span>一键应用</span>
                    </button>
                  )}
                </>
              )}
              <button
                onClick={onCloseFormatSuggest}
                className="text-amber-400 hover:text-amber-600"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {formatSuggestResult && (
            <div className="px-4 py-2 border-b bg-white/60 space-y-1">
              {formatSuggestResult.doc_type_label && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">
                    识别文档类型：
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px]">
                    {formatSuggestResult.doc_type_label}
                  </span>
                </div>
              )}
              {formatSuggestResult.summary?.overall && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">总体评价：</span>
                  {formatSuggestResult.summary.overall}
                </div>
              )}
              {formatSuggestResult.summary?.top_issues &&
                formatSuggestResult.summary.top_issues.length > 0 && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium text-gray-700">
                      主要问题：
                    </span>
                    {formatSuggestResult.summary.top_issues.join("、")}
                  </div>
                )}
              {formatSuggestResult.summary?.recommended_preset && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">推荐预设：</span>
                  <span className="text-blue-600">
                    {formatSuggestResult.summary.recommended_preset}
                  </span>
                </div>
              )}
              {formatSuggestResult.structure_analysis?.missing_elements &&
                formatSuggestResult.structure_analysis.missing_elements.length >
                  0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                    ⚠️ 缺少要素：
                    {formatSuggestResult.structure_analysis.missing_elements.join(
                      "、",
                    )}
                  </div>
                )}
            </div>
          )}

          <div className="max-h-[400px] overflow-auto divide-y divide-amber-100">
            {formatSuggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.category}-${suggestion.target}-${index}`}
                className="px-4 py-2.5 hover:bg-amber-50/80 transition-colors group/sug"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono text-gray-400">
                      {index + 1}.
                    </span>
                    <span className="text-sm">
                      {FORMAT_SUGGESTION_CATEGORY_ICONS[suggestion.category] ||
                        "📌"}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                      {FORMAT_SUGGESTION_CATEGORY_LABELS[suggestion.category] ||
                        suggestion.category}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${FORMAT_SUGGESTION_PRIORITY_STYLES[suggestion.priority] || FORMAT_SUGGESTION_PRIORITY_STYLES.medium}`}
                    >
                      {FORMAT_SUGGESTION_PRIORITY_LABELS[suggestion.priority] ||
                        "中"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        onAppendAiInstruction(
                          `${suggestion.target}：${suggestion.suggestion}`,
                        );
                        toast.success(`已填入：${suggestion.target}`);
                      }}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                      title="填入排版指令"
                    >
                      <ArrowRight size={10} />
                      <span>填入</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          buildSingleFormatSuggestionClipboardText(suggestion),
                        );
                        toast.success("已复制");
                      }}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                      title="复制此条"
                    >
                      <Copy size={10} />
                      <span>复制</span>
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-800 font-medium">
                  {suggestion.target}
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] font-mono bg-gray-50 rounded px-2 py-1.5 border border-gray-100 select-all">
                  {suggestion.current && (
                    <div className="text-gray-500">
                      <span className="text-gray-400 select-none">当前：</span>
                      {suggestion.current}
                    </div>
                  )}
                  <div className="text-blue-700 font-medium">
                    <span className="text-blue-400 select-none">建议：</span>
                    {suggestion.suggestion}
                  </div>
                  {suggestion.standard && (
                    <div className="text-gray-400">
                      <span className="select-none">标准：</span>
                      {suggestion.standard}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isFormatSuggesting && formatSuggestions.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-amber-600">
                <Loader2 className="animate-spin inline mr-1" size={14} />
                正在分析文档排版…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
