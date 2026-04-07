import React from "react";
import { BrainCircuit, ChevronDown, Eye, Loader2 } from "lucide-react";

import type { KbReferenceItem } from "../api";
import type { StructuredParagraph } from "./StructuredDocRenderer";

type ProcessingLogEntry = {
  type: "status" | "error" | "info";
  message: string;
  ts: number;
};

interface SmartDocAiStatusPanelProps {
  aiReasoningText: string;
  isAiThinking: boolean;
  showReasoningPanel: boolean;
  processingLog: ProcessingLogEntry[];
  aiStructuredParagraphs: StructuredParagraph[];
  isAiProcessing: boolean;
  kbReferences: KbReferenceItem[];
  aiOutputRef?: React.RefObject<HTMLDivElement | null>;
  onToggleReasoningPanel: () => void;
}

export const SmartDocAiStatusPanel: React.FC<SmartDocAiStatusPanelProps> = ({
  aiReasoningText,
  isAiThinking,
  showReasoningPanel,
  processingLog,
  aiStructuredParagraphs,
  isAiProcessing,
  kbReferences,
  aiOutputRef,
  onToggleReasoningPanel,
}) => {
  const showReasoning = !!(aiReasoningText || isAiThinking);
  const showProcessingPanel =
    processingLog.length > 0 || aiStructuredParagraphs.length > 0 || isAiProcessing;

  return (
    <>
      {showReasoning && (
        <div className="border border-orange-200 rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 cursor-pointer select-none"
            onClick={onToggleReasoningPanel}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-orange-700">
              <BrainCircuit size={14} className="text-orange-500" />
              {isAiThinking ? (
                <>
                  <Loader2 size={12} className="animate-spin text-orange-500" />
                  AI 正在思考…
                </>
              ) : (
                "AI 推理过程"
              )}
            </span>
            <ChevronDown
              size={14}
              className={`text-orange-400 transition-transform ${showReasoningPanel ? "rotate-180" : ""}`}
            />
          </div>
          {showReasoningPanel && (
            <div className="bg-gradient-to-br from-orange-50/50 to-amber-50/50 p-3 max-h-48 overflow-auto">
              <div className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-mono">
                {aiReasoningText}
                {isAiThinking && (
                  <span className="inline-block w-1.5 h-3.5 bg-orange-400 ml-0.5 animate-pulse rounded-sm" />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showProcessingPanel && (
        <div
          ref={aiOutputRef}
          className={`border rounded-lg overflow-auto text-sm text-gray-700 leading-relaxed ${
            aiStructuredParagraphs.length > 0
              ? "bg-slate-50 max-h-[70vh] shadow-inner"
              : "bg-slate-50 max-h-48"
          }`}
        >
          {aiStructuredParagraphs.length > 0 && (
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-white/90 backdrop-blur border-b text-xs text-gray-500">
              <span>
                结构化段落 · {aiStructuredParagraphs.length} 段
                {aiStructuredParagraphs.some(
                  (paragraph) => paragraph.font_size || paragraph.font_family,
                ) && (
                  <span className="ml-2 text-blue-500 font-medium">
                    含排版格式
                  </span>
                )}
                {isAiProcessing && (
                  <span className="ml-2 text-blue-600">
                    <Loader2 className="animate-spin inline" size={12} /> 接收中…
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="p-3 space-y-1.5">
            {processingLog.map((entry, index) => (
              <div
                key={`${entry.ts}-${index}`}
                className={`flex items-start gap-2 text-xs ${
                  entry.type === "error"
                    ? "text-red-600"
                    : entry.type === "info"
                      ? "text-amber-600"
                      : "text-gray-500"
                }`}
              >
                <span className="shrink-0 mt-0.5">
                  {entry.type === "error"
                    ? "❌"
                    : entry.type === "info"
                      ? "💡"
                      : "✓"}
                </span>
                <span className="whitespace-pre-wrap">{entry.message}</span>
              </div>
            ))}

            {kbReferences.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-3 py-2 mt-1">
                <div className="text-xs font-medium text-blue-700 mb-1.5 flex items-center gap-1">
                  📚 参考知识库文档
                </div>
                <div className="space-y-1">
                  {kbReferences.map((reference, index) => (
                    <div
                      key={`${reference.name}-${index}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-medium ${
                          reference.type === "full_document"
                            ? "bg-blue-500"
                            : "bg-gray-400"
                        }`}
                      >
                        {reference.type === "full_document" ? "全文" : "片段"}
                      </span>
                      <span
                        className="text-gray-700 font-medium truncate max-w-[200px]"
                        title={reference.name}
                      >
                        「{reference.name}」
                      </span>
                      <span className="text-blue-600 font-mono">
                        {Math.round(reference.score * 100)}%
                      </span>
                      {reference.char_count && (
                        <span className="text-gray-400">
                          {reference.char_count > 1000
                            ? `${(reference.char_count / 1000).toFixed(1)}k字`
                            : `${reference.char_count}字`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isAiProcessing && (
              <div className="flex items-center gap-2 text-blue-600 text-xs">
                <Loader2 className="animate-spin" size={12} />
                <span>AI 正在处理…</span>
              </div>
            )}

            {aiStructuredParagraphs.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mt-1">
                <Eye size={14} />
                <span>
                  结构化段落已在下方「公文预览」区域实时展示
                  <span className="ml-1 font-medium">
                    · {aiStructuredParagraphs.length} 段
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
