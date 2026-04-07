import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Download,
  Eye,
  FileText,
  History,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";

import {
  DOC_STATUS_MAP,
  DOC_TYPE_MAP,
  VISIBILITY_MAP,
  type DocDetail,
} from "../api";

interface SmartDocHeaderProps {
  currentDoc: DocDetail | null;
  isReadOnly: boolean;
  statusClassName: string;
  rightPanel: string | null;
  showVersionHistory: boolean;
  canUndo: boolean;
  canRedo: boolean;
  autoSaveEnabled: boolean;
  lastSavedAt: Date | null;
  displayParagraphCount: number;
  onBack: () => void;
  onTitleInput: (title: string) => void;
  onTitleCommit: (title: string, originalTitle: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onToggleAutoSave: () => void;
  onToggleMaterialPanel: () => void;
  onOpenVersionHistory: () => void;
  onDownloadFormatted: () => void;
  onDownloadPdf: () => void;
  onOpenExportPreview: () => void;
}

function renderLastSavedLabel(lastSavedAt: Date | null) {
  if (!lastSavedAt) return null;
  const diff = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
  if (diff < 5) return "刚刚保存";
  if (diff < 60) return `${diff}秒前`;
  return `${Math.floor(diff / 60)}分钟前`;
}

export const SmartDocHeader: React.FC<SmartDocHeaderProps> = ({
  currentDoc,
  isReadOnly,
  statusClassName,
  rightPanel,
  showVersionHistory,
  canUndo,
  canRedo,
  autoSaveEnabled,
  lastSavedAt,
  displayParagraphCount,
  onBack,
  onTitleInput,
  onTitleCommit,
  onUndo,
  onRedo,
  onSave,
  onToggleAutoSave,
  onToggleMaterialPanel,
  onOpenVersionHistory,
  onDownloadFormatted,
  onDownloadPdf,
  onOpenExportPreview,
}) => {
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const originalTitleRef = useRef("");
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target as Node)
      ) {
        setShowDownloadMenu(false);
      }
    };

    if (showDownloadMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [showDownloadMenu]);

  return (
    <div className="h-14 border-b flex items-center justify-between px-4 bg-gray-50 shrink-0">
      <div className="flex items-center space-x-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 rounded text-gray-500"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col">
          {currentDoc ? (
            <input
              className="font-bold text-gray-800 text-sm bg-transparent border-none outline-none hover:bg-gray-100 focus:bg-white focus:ring-1 focus:ring-blue-400 rounded px-1 -ml-1 max-w-[260px] truncate"
              value={currentDoc.title}
              onChange={(event) => onTitleInput(event.target.value)}
              onFocus={(event) => {
                originalTitleRef.current = event.target.value;
              }}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== originalTitleRef.current) {
                  onTitleCommit(value, originalTitleRef.current);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
          ) : (
            <span className="font-bold text-gray-800 text-sm">
              导入公文处理
            </span>
          )}
          {currentDoc && (
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${statusClassName}`}
              >
                {DOC_STATUS_MAP[currentDoc.status] || currentDoc.status}
              </span>
              <span className="text-[10px] text-gray-400">
                {DOC_TYPE_MAP[currentDoc.doc_type] || currentDoc.doc_type}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  currentDoc.visibility === "public"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {VISIBILITY_MAP[currentDoc.visibility] || "私密"}
              </span>
            </div>
          )}
        </div>
      </div>

      {currentDoc && (
        <div className="flex items-center space-x-2">
          {isReadOnly ? (
            <>
              <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium flex items-center gap-1">
                <Eye size={14} /> 只读查看
              </span>
              <div className="h-6 w-px bg-gray-300 mx-1" />
            </>
          ) : (
            <>
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className={`p-2 rounded ${canUndo ? "hover:bg-gray-200 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}
                title="撤销 (Ctrl+Z)"
              >
                <Undo2 size={18} />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className={`p-2 rounded ${canRedo ? "hover:bg-gray-200 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}
                title="重做 (Ctrl+Y)"
              >
                <Redo2 size={18} />
              </button>
              <div className="h-6 w-px bg-gray-300 mx-1" />
              <button
                onClick={onSave}
                className="p-2 rounded hover:bg-gray-200 text-gray-600"
                title="保存 (Ctrl+S)"
              >
                <Save size={18} />
              </button>
              <button
                onClick={onToggleAutoSave}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${autoSaveEnabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                title={
                  autoSaveEnabled
                    ? "自动保存已开启（3秒无操作自动保存）"
                    : "点击开启自动保存"
                }
              >
                <div
                  className={`w-6 h-3.5 rounded-full relative transition-colors ${autoSaveEnabled ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${autoSaveEnabled ? "left-3" : "left-0.5"}`}
                  />
                </div>
                <span>{autoSaveEnabled ? "自动" : "手动"}</span>
              </button>
              {lastSavedAt && (
                <span
                  className="text-[10px] text-gray-400"
                  title={lastSavedAt.toLocaleString("zh-CN")}
                >
                  {renderLastSavedLabel(lastSavedAt)}
                </span>
              )}
              <div className="h-6 w-px bg-gray-300 mx-1" />
              <button
                onClick={onToggleMaterialPanel}
                className={`p-2 rounded ${rightPanel === "material" ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
                title="素材库"
              >
                <BookOpen size={18} />
              </button>
              <button
                onClick={onOpenVersionHistory}
                className={`p-2 rounded ${showVersionHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
                title="版本历史"
              >
                <History size={18} />
              </button>
              <div className="h-6 w-px bg-gray-300 mx-1" />
            </>
          )}

          <div className="relative" ref={downloadMenuRef}>
            <button
              onClick={() => setShowDownloadMenu((prev) => !prev)}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 shadow-sm flex items-center gap-1"
              title="下载排版文档"
            >
              <Download size={16} /> 下载文档 <ChevronDown size={14} />
            </button>
            {showDownloadMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    onDownloadFormatted();
                  }}
                  className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <FileText size={16} className="text-blue-500" />
                  <span>下载 Word (.docx)</span>
                </button>
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    onDownloadPdf();
                  }}
                  className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <BookOpen size={16} className="text-red-500" />
                  <span>下载 PDF (.pdf)</span>
                </button>
                <hr className="my-1 border-gray-100" />
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    onOpenExportPreview();
                  }}
                  disabled={displayParagraphCount === 0}
                  className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors disabled:opacity-40"
                >
                  <Eye size={16} className="text-green-500" />
                  <span>导出预览</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
