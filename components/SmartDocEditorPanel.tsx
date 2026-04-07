import React from "react";
import {
  Check,
  CheckCircle,
  Edit3,
  Loader2,
  X,
} from "lucide-react";

import { StructuredDocRenderer, type StructuredParagraph } from "./StructuredDocRenderer";

type SmartDocPreset =
  | "official"
  | "academic"
  | "legal"
  | "proposal"
  | "lab_fund"
  | "school_notice_redhead";

const resolveDocPreset = (docType?: string): SmartDocPreset =>
  (docType as SmartDocPreset) || "official";

interface SmartDocEditorHeaderProps {
  aiStructuredParagraphs: StructuredParagraph[];
  acceptedParagraphs: StructuredParagraph[];
  displayParagraphs: StructuredParagraph[];
  isAiProcessing: boolean;
  currentDocContentLength: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApplyAiResult: () => void | Promise<void>;
}

export const SmartDocEditorHeader: React.FC<SmartDocEditorHeaderProps> = ({
  aiStructuredParagraphs,
  acceptedParagraphs,
  displayParagraphs,
  isAiProcessing,
  currentDocContentLength,
  onAcceptAll,
  onRejectAll,
  onApplyAiResult,
}) => {
  const hasAiParagraphs = aiStructuredParagraphs.length > 0;
  const hasAcceptedParagraphs = acceptedParagraphs.length > 0;
  const changeCount = aiStructuredParagraphs.filter(
    (paragraph) => paragraph._change,
  ).length;
  const hasChanges = changeCount > 0;
  const charCount =
    displayParagraphs.length > 0
      ? displayParagraphs.reduce(
          (sum, paragraph) => sum + (paragraph.text?.length || 0),
          0,
        )
      : currentDocContentLength;

  return (
    <div className="p-3 border-b bg-gray-50 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-3">
        <span className="font-medium text-gray-700">
          {hasAiParagraphs ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                {isAiProcessing && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isAiProcessing ? "bg-red-500" : "bg-green-500"}`}
                />
              </span>
              {isAiProcessing
                ? "AI 实时预览"
                : hasChanges
                  ? "变更审查（接受或拒绝每条变更）"
                  : "AI 结果预览（点击文字可直接编辑）"}
              <span className="text-blue-500 font-normal">
                · {aiStructuredParagraphs.length} 段
              </span>
              {!isAiProcessing && hasChanges && (
                <span className="text-amber-600 font-normal">
                  · {changeCount} 处变更
                </span>
              )}
            </span>
          ) : hasAcceptedParagraphs ? (
            <span className="flex items-center gap-1.5">
              <CheckCircle size={14} className="text-green-500" />
              已采纳排版（点击文字可直接编辑）
              <span className="text-green-600 font-normal">
                · {acceptedParagraphs.length} 段
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Edit3 size={12} className="text-gray-400" />
              公文编辑
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {!isAiProcessing && hasChanges && (
          <>
            <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
              {changeCount} 处变更
            </span>
            <button
              onClick={onAcceptAll}
              className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md text-[11px] font-medium hover:bg-green-600 hover:text-white hover:border-green-600 flex items-center gap-1 shadow-sm transition-colors"
            >
              <Check size={12} /> 全部接受
            </button>
            <button
              onClick={onRejectAll}
              className="px-2.5 py-1 bg-gray-50 text-gray-500 border border-gray-200 rounded-md text-[11px] font-medium hover:bg-red-500 hover:text-white hover:border-red-500 flex items-center gap-1 shadow-sm transition-colors"
            >
              <X size={12} /> 全部拒绝
            </button>
            <div className="h-4 w-px bg-gray-300" />
          </>
        )}

        {!isAiProcessing && hasAiParagraphs && (
          <button
            onClick={onApplyAiResult}
            className="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 flex items-center gap-1 shadow-sm"
          >
            <Check size={12} /> 采用此结果
          </button>
        )}

        <span>{charCount} 字</span>
      </div>
    </div>
  );
};

interface SmartDocEditorViewportProps {
  aiStructuredParagraphs: StructuredParagraph[];
  acceptedParagraphs: StructuredParagraph[];
  currentDocType?: string;
  isAiProcessing: boolean;
  isReadOnly: boolean;
  pipelineStage: number;
  aiStreamingText: string;
  editableContentHtml: string;
  renderRichContent: (content: string, plain: boolean) => React.ReactNode;
  onAiParagraphsChange?: (paragraphs: StructuredParagraph[]) => void;
  onAcceptedParagraphsChange?: (paragraphs: StructuredParagraph[]) => void;
  onAcceptChange?: (index: number) => void;
  onRejectChange?: (index: number) => void;
  onPlainFocus?: React.FocusEventHandler<HTMLDivElement>;
  onPlainInput?: React.FormEventHandler<HTMLDivElement>;
  onPlainBlur?: React.FocusEventHandler<HTMLDivElement>;
}

export const SmartDocEditorViewport: React.FC<SmartDocEditorViewportProps> = ({
  aiStructuredParagraphs,
  acceptedParagraphs,
  currentDocType,
  isAiProcessing,
  isReadOnly,
  pipelineStage,
  aiStreamingText,
  editableContentHtml,
  renderRichContent,
  onAiParagraphsChange,
  onAcceptedParagraphsChange,
  onAcceptChange,
  onRejectChange,
  onPlainFocus,
  onPlainInput,
  onPlainBlur,
}) => {
  const preset = resolveDocPreset(currentDocType);

  return (
    <div
      className="flex-1 w-full p-8 overflow-auto min-h-[400px]"
      style={{ background: "#fefefe" }}
    >
      {aiStructuredParagraphs.length > 0 ? (
        <StructuredDocRenderer
          paragraphs={aiStructuredParagraphs}
          preset={preset}
          streaming={isAiProcessing}
          onParagraphsChange={isAiProcessing || isReadOnly ? undefined : onAiParagraphsChange}
          onAcceptChange={isAiProcessing || isReadOnly ? undefined : onAcceptChange}
          onRejectChange={isAiProcessing || isReadOnly ? undefined : onRejectChange}
        />
      ) : acceptedParagraphs.length > 0 ? (
        <StructuredDocRenderer
          paragraphs={acceptedParagraphs}
          preset={preset}
          streaming={false}
          onParagraphsChange={isReadOnly ? undefined : onAcceptedParagraphsChange}
        />
      ) : aiStreamingText ? (
        <div className="whitespace-pre-wrap">
          {renderRichContent(aiStreamingText, pipelineStage < 2)}
          {isAiProcessing && (
            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
          )}
        </div>
      ) : isAiProcessing ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-gray-400 select-none">
          <Loader2 className="animate-spin mb-3 text-blue-400" size={28} />
          <p className="text-sm">AI 正在生成内容，请稍候…</p>
          <p className="text-xs mt-1 text-gray-300">生成完成后将自动显示</p>
        </div>
      ) : (
        <div
          contentEditable={!isReadOnly}
          suppressContentEditableWarning
          className="whitespace-pre-wrap outline-none min-h-[300px] text-gray-800 focus:ring-1 focus:ring-blue-200 rounded p-2"
          style={{
            fontFamily: "FangSong, STFangsong, serif",
            fontSize: "16pt",
            lineHeight: "28pt",
          }}
          dangerouslySetInnerHTML={{
            __html: editableContentHtml,
          }}
          onFocus={onPlainFocus}
          onInput={onPlainInput}
          onBlur={onPlainBlur}
        />
      )}
    </div>
  );
};
