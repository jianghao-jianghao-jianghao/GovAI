import React from "react";
import { CloudUpload, FileText, Loader2, Upload } from "lucide-react";

interface SmartDocImportPanelProps {
  uploadedFile: File | null;
  isDragOver: boolean;
  isProcessing: boolean;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileUpload: React.ChangeEventHandler<HTMLInputElement>;
  onImport: () => void | Promise<void>;
}

export const SmartDocImportPanel: React.FC<SmartDocImportPanelProps> = ({
  uploadedFile,
  isDragOver,
  isProcessing,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileUpload,
  onImport,
}) => (
  <div className="w-full max-w-xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="w-full bg-white p-10 rounded-2xl shadow-sm space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CloudUpload size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">导入公文</h2>
        <p className="text-gray-500 mt-2 text-sm">
          上传公文文档后，可通过流水线完成起草、审核、优化、格式化
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragOver ? "border-blue-500 bg-blue-50 scale-[1.02]" : uploadedFile ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-blue-500 hover:bg-blue-50"}`}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".docx,.doc,.pdf,.txt,.md,.csv,.xlsx,.pptx,.html,.htm"
          onChange={onFileUpload}
          className="hidden"
          id="doc-upload"
        />
        <label htmlFor="doc-upload" className="cursor-pointer block w-full h-full">
          {uploadedFile ? (
            <div className="flex flex-col items-center text-green-700">
              <FileText size={48} className="mb-2" />
              <span className="font-bold text-lg">{uploadedFile.name}</span>
              <span className="text-xs mt-1">
                {(uploadedFile.size / 1024).toFixed(1)} KB - 点击更换
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-500">
              <Upload size={32} className="mb-2" />
              <span className="font-medium">点击上传或拖拽文档至此</span>
              <span className="text-xs mt-1 text-gray-400">
                支持 .docx .doc .pdf .txt .md .xlsx .pptx .csv .html 格式，最大
                50MB
              </span>
            </div>
          )}
        </label>
      </div>

      <button
        onClick={onImport}
        disabled={isProcessing}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
      >
        {isProcessing ? (
          <>
            <Loader2 className="animate-spin mr-2" /> 正在导入...
          </>
        ) : (
          <>
            <Upload size={18} className="mr-2" />
            {uploadedFile ? "导入文档" : "创建空白文档"}
          </>
        )}
      </button>
    </div>
  </div>
);
