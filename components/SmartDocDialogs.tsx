import React from "react";
import {
  AlertTriangle,
  BookOpen,
  Eye,
  FileText,
  History,
  Loader2,
  Undo2,
} from "lucide-react";

import { type DocDetail, type DocVersion } from "../api";
import { StructuredDocRenderer, type StructuredParagraph } from "./StructuredDocRenderer";
import { Modal } from "./ui";

type ToastLike = {
  success: (message: string) => void;
};

interface SmartDocDialogsProps {
  toast: ToastLike;
  currentDoc: DocDetail | null;
  displayParagraphs: StructuredParagraph[];
  showVersionHistory: boolean;
  versionList: DocVersion[];
  isLoadingVersions: boolean;
  previewVersionId: string | null;
  previewVersionContent: string | null;
  isLoadingPreview: boolean;
  restoreConfirmVersion: DocVersion | null;
  showExportPreview: boolean;
  onCloseVersionHistory: () => void;
  onPreviewVersion: (versionId: string) => void;
  onRequestRestoreVersion: (versionId: string) => void;
  onCancelRestoreVersion: () => void;
  onConfirmRestoreVersion: (versionId: string) => void;
  onCloseExportPreview: () => void;
  onDownloadFormatted: () => void;
  onDownloadPdf: () => void;
}

function formatVersionRelativeTime(createdAt: string): string {
  const timestamp = new Date(createdAt);
  const diffMinutes = Math.floor((Date.now() - timestamp.getTime()) / 60000);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}小时前`;
  return `${Math.floor(diffMinutes / 1440)}天前`;
}

export const SmartDocDialogs: React.FC<SmartDocDialogsProps> = ({
  toast,
  currentDoc,
  displayParagraphs,
  showVersionHistory,
  versionList,
  isLoadingVersions,
  previewVersionId,
  previewVersionContent,
  isLoadingPreview,
  restoreConfirmVersion,
  showExportPreview,
  onCloseVersionHistory,
  onPreviewVersion,
  onRequestRestoreVersion,
  onCancelRestoreVersion,
  onConfirmRestoreVersion,
  onCloseExportPreview,
  onDownloadFormatted,
  onDownloadPdf,
}) => (
  <>
    {showVersionHistory && (
      <Modal
        title={
          <div className="flex items-center gap-2 text-sm">
            <History size={16} className="text-gray-500" />
            <span className="font-semibold">版本历史</span>
            <span className="text-xs text-gray-400">
              {versionList.length} commits
            </span>
          </div>
        }
        onClose={onCloseVersionHistory}
        size="lg"
        footer={null}
      >
        <div style={{ maxHeight: "60vh" }} className="overflow-auto">
          {isLoadingVersions ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">加载中…</span>
            </div>
          ) : versionList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">暂无版本记录</p>
              <p className="text-xs mt-1">保存或 AI 处理后自动创建快照</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {versionList.map((version, index) => {
                const isFirst = index === 0;
                const isExpanded = previewVersionId === version.id;
                const typeMap: Record<string, { color: string; label: string }> = {
                  format: {
                    color: "text-purple-600 bg-purple-50",
                    label: "格式化",
                  },
                  review: {
                    color: "text-amber-600 bg-amber-50",
                    label: "审查",
                  },
                  draft: {
                    color: "text-blue-600 bg-blue-50",
                    label: "起草",
                  },
                  restore: {
                    color: "text-green-600 bg-green-50",
                    label: "恢复",
                  },
                  edit: {
                    color: "text-gray-600 bg-gray-100",
                    label: "编辑",
                  },
                  optimize: {
                    color: "text-teal-600 bg-teal-50",
                    label: "优化",
                  },
                  check: {
                    color: "text-orange-600 bg-orange-50",
                    label: "检查",
                  },
                };
                const typeInfo = typeMap[version.change_type || ""] || {
                  color: "text-gray-500 bg-gray-50",
                  label: version.change_type || "保存",
                };
                const createdAt = new Date(version.created_at);

                return (
                  <div key={version.id}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      onClick={() => onPreviewVersion(version.id)}
                    >
                      <code
                        className={`text-xs font-mono shrink-0 ${isFirst ? "text-blue-600 font-bold" : "text-gray-400"}`}
                      >
                        v{version.version_number}
                      </code>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                      {isFirst && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium shrink-0">
                          HEAD
                        </span>
                      )}
                      {(version as DocVersion & { has_format?: boolean })
                        .has_format && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium shrink-0"
                          title="包含排版数据"
                        >
                          排版
                        </span>
                      )}
                      <span className="text-xs text-gray-700 truncate flex-1 min-w-0">
                        {version.change_summary || "无备注"}
                      </span>
                      <span
                        className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap"
                        title={createdAt.toLocaleString("zh-CN")}
                      >
                        {version.created_by_name
                          ? `${version.created_by_name} · `
                          : ""}
                        {formatVersionRelativeTime(version.created_at)}
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onRequestRestoreVersion(version.id);
                        }}
                        className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition shrink-0"
                        title="恢复到此版本"
                      >
                        <Undo2 size={13} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-b border-gray-100 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        {isLoadingPreview ? (
                          <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
                            <Loader2 className="animate-spin" size={14} />
                            <span className="text-xs">加载预览…</span>
                          </div>
                        ) : previewVersionContent !== null ? (
                          <>
                            <div className="flex items-center gap-3 mb-2 text-[11px] text-gray-500">
                              <span>{previewVersionContent.length} 字</span>
                              {currentDoc?.content && (
                                <span
                                  className={
                                    previewVersionContent.length >
                                    (currentDoc.content || "").length
                                      ? "text-green-600"
                                      : previewVersionContent.length <
                                          (currentDoc.content || "").length
                                        ? "text-red-500"
                                        : "text-gray-400"
                                  }
                                >
                                  vs 当前{" "}
                                  {(() => {
                                    const diff =
                                      previewVersionContent.length -
                                      (currentDoc.content || "").length;
                                    if (diff > 0) return `+${diff}`;
                                    if (diff < 0) return `${diff}`;
                                    return "±0";
                                  })()}{" "}
                                  字
                                </span>
                              )}
                              <div className="flex-1" />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    previewVersionContent,
                                  );
                                  toast.success("已复制");
                                }}
                                className="text-gray-400 hover:text-gray-600 text-[11px] hover:underline"
                              >
                                复制
                              </button>
                              <button
                                onClick={() =>
                                  onRequestRestoreVersion(version.id)
                                }
                                className="text-blue-600 hover:text-blue-700 text-[11px] hover:underline font-medium"
                              >
                                恢复此版本
                              </button>
                            </div>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed bg-white border rounded p-3 max-h-48 overflow-auto font-[FangSong,STFangsong,serif]">
                              {previewVersionContent || "(空内容)"}
                            </pre>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    )}

    {restoreConfirmVersion &&
      (() => {
        const version = restoreConfirmVersion;
        const createdAt = new Date(version.created_at);
        const typeLabels: Record<string, string> = {
          format: "格式化",
          review: "审查",
          draft: "起草",
          restore: "恢复",
          edit: "编辑",
          optimize: "优化",
          check: "检查",
        };

        return (
          <Modal
            title={
              <div className="flex items-center gap-2">
                <Undo2 size={18} className="text-blue-600" />
                <span>确认恢复版本</span>
              </div>
            }
            onClose={onCancelRestoreVersion}
            size="sm"
            footer={
              <div className="flex gap-2">
                <button
                  onClick={onCancelRestoreVersion}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  取消
                </button>
                <button
                  onClick={() => onConfirmRestoreVersion(version.id)}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  确认恢复
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-blue-500" />
                  <span className="text-sm font-bold text-blue-800">
                    v{version.version_number}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">
                    {typeLabels[version.change_type || ""] ||
                      version.change_type ||
                      "保存"}
                  </span>
                </div>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>
                    <span className="text-blue-500">备注：</span>
                    {version.change_summary || "无备注"}
                  </div>
                  <div>
                    <span className="text-blue-500">时间：</span>
                    {createdAt.toLocaleString("zh-CN")}
                  </div>
                  {version.created_by_name && (
                    <div>
                      <span className="text-blue-500">操作人：</span>
                      {version.created_by_name}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <AlertTriangle
                  size={16}
                  className="text-amber-500 shrink-0 mt-0.5"
                />
                <div className="text-xs text-amber-700 leading-relaxed">
                  <p className="font-medium mb-1">请注意</p>
                  <p>
                    恢复操作将把文档内容替换为该版本的内容。当前内容会自动保存为一个新的版本快照，可随时再次恢复。
                  </p>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

    {showExportPreview && currentDoc && displayParagraphs.length > 0 && (
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-green-600" />
            <span>导出预览 — {currentDoc.title}</span>
          </div>
        }
        onClose={onCloseExportPreview}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500">
              {displayParagraphs.length} 个段落，
              {displayParagraphs.reduce(
                (sum, paragraph) => sum + (paragraph.text?.length || 0),
                0,
              )}{" "}
              字
            </span>
            <div className="flex gap-2">
              <button
                onClick={onCloseExportPreview}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  onCloseExportPreview();
                  onDownloadFormatted();
                }}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-1"
              >
                <FileText size={14} /> 下载 Word
              </button>
              <button
                onClick={() => {
                  onCloseExportPreview();
                  onDownloadPdf();
                }}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-1"
              >
                <BookOpen size={14} /> 下载 PDF
              </button>
            </div>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-auto bg-white border border-gray-200 rounded-lg p-6">
          <StructuredDocRenderer
            paragraphs={displayParagraphs}
            preset={
              (currentDoc.doc_type as
                | "official"
                | "academic"
                | "legal"
                | "proposal"
                | "lab_fund"
                | "school_notice_redhead") || "official"
            }
            streaming={false}
          />
        </div>
      </Modal>
    )}
  </>
);
