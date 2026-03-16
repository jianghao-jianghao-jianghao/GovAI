/**
 * 公文格式处理工具 — 完全复刻 docformat-gui 的布局与工作流
 *
 * 布局（从上至下）：
 *  1. 标题
 *  2. 输入/输出文件选择
 *  3. 三种模式卡片（智能一键处理[推荐]、格式诊断、标点修复）
 *  4. 格式预设选择（GB/T 公文标准、学术论文、法律文书、⚙️ 自定义）
 *  5. 「开始处理」按钮
 *  6. 结果展示区
 *  7. 可折叠运行日志
 */

import React, { useState, useEffect, useRef } from "react";
import { sanitizeHtml } from "../utils/sanitize";
import { useConfirm } from "./ui";
import {
  Wand2,
  Search,
  Pencil,
  FileText,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
  Info,
  X,
  Plus,
  Trash2,
  Edit3,
  Save,
} from "lucide-react";
import {
  apiListPresets,
  apiGetPresetDetail,
  apiCreatePreset,
  apiUpdatePreset,
  apiDeletePreset,
  apiAnalyzeFormat,
  apiFixPunctuation,
  apiSmartFormat,
  apiAiFormatStream,
  apiAiDiagnoseStream,
  apiAiPunctFixStream,
  downloadBlob,
  type PresetInfo,
  type PresetDetail,
  type AnalysisResult,
  type FormatStats,
  type SmartFormatStats,
} from "../api/docformat";

/* ================================================================
   Types
   ================================================================ */
type Mode = "smart" | "analyze" | "punctuation";

interface LogEntry {
  text: string;
  level: "info" | "success" | "warning" | "error";
}

interface FormatToolbarProps {
  toast: { success: (msg: string) => void; error: (msg: string) => void };
  /** 当嵌入在管线中时，直接传入文档 ID，无需上传文件 */
  documentId?: string;
  /** 当前文档标题（用于显示） */
  documentTitle?: string;
  /** 管线阶段右侧操作按钮（预览/下载/归档/上一步等） */
  stageActions?: React.ReactNode;
  /** AI 排版流式输出时更新文档内容（用于实时预览） */
  onContentUpdate?: (content: string) => void;
}

/* ================================================================
   Constants
   ================================================================ */
const PARA_TYPE_LABELS: Record<string, string> = {
  title: "标题",
  recipient: "主送",
  heading1: "一级标题",
  heading2: "二级标题",
  heading3: "三级标题",
  heading4: "四级标题",
  heading5: "五级标题",
  body: "正文",
  signature: "落款",
  date: "日期",
  attachment: "附件",
  closing: "结语",
};

const ALIGN_LABELS: Record<string, string> = {
  center: "居中",
  left: "左对齐",
  right: "右对齐",
  justify: "两端",
};

const COMMON_FONTS_CN = [
  "仿宋_GB2312",
  "仿宋",
  "宋体",
  "黑体",
  "楷体_GB2312",
  "楷体",
  "方正小标宋简体",
  "方正仿宋_GBK",
  "华文仿宋",
  "华文中宋",
];
const COMMON_FONTS_EN = ["Times New Roman", "Arial", "Calibri", "Cambria"];
const ALIGN_OPTIONS = ["left", "center", "right", "justify"];

const ELEMENT_KEYS = [
  { key: "title", label: "主标题" },
  { key: "recipient", label: "主送机关" },
  { key: "heading1", label: "一级标题" },
  { key: "heading2", label: "二级标题", optional: true },
  { key: "heading3", label: "三级标题", optional: true },
  { key: "heading4", label: "四级标题", optional: true },
  { key: "heading5", label: "五级标题", optional: true },
  { key: "body", label: "正文" },
  { key: "signature", label: "落款" },
  { key: "date", label: "日期" },
  { key: "attachment", label: "附件" },
  { key: "closing", label: "结语" },
] as const;

function groupPunctuation(
  items: Array<{ para: number; type: string; char: string }>,
): string[] {
  const byType: Record<string, number[]> = {};
  for (const item of items) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item.para);
  }
  return Object.entries(byType).map(([type, paras]) => {
    const unique = [...new Set(paras)].sort((a, b) => a - b);
    const paraStr =
      unique.length > 5
        ? `第${unique[0]},${unique[1]}...${unique[unique.length - 1]}段`
        : `第${unique.join(",")}段`;
    return `${type}: ${paraStr}`;
  });
}

/* ================================================================
   Component
   ================================================================ */
export const FormatToolbar: React.FC<FormatToolbarProps> = ({
  toast,
  documentId,
  documentTitle,
  stageActions,
  onContentUpdate,
}) => {
  // ── 嵌入管线模式（使用当前文档而非上传文件）──
  const embedded = !!documentId;
  const { confirm, ConfirmDialog } = useConfirm();
  // ── File ──
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Mode & Preset ──
  const [mode, setMode] = useState<Mode>("smart");
  const [selectedPreset, setSelectedPreset] = useState("official");
  const [presets, setPresets] = useState<PresetInfo[]>([]);

  // ── Preset detail modal ──
  const [presetDetail, setPresetDetail] = useState<PresetDetail | null>(null);
  const [showPresetDetail, setShowPresetDetail] = useState(false);

  // ── Preset editor (CRUD) ──
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Record<string, any>>({});
  const [editingName, setEditingName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [isNewPreset, setIsNewPreset] = useState(true);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [enabledOptionalHeadings, setEnabledOptionalHeadings] = useState<Record<string, boolean>>({
    heading2: true,
    heading3: true,
    heading4: true,
    heading5: false,
  });

  // ── Processing state ──
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Results ──
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [formatStats, setFormatStats] = useState<FormatStats | null>(null);
  const [smartStats, setSmartStats] = useState<SmartFormatStats | null>(null);
  const [punctStats, setPunctStats] = useState<{
    paragraphs_fixed: number;
    table_cells_fixed: number;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string | null>(null);

  // ── AI 流式状态 ──
  const [aiStreaming, setAiStreaming] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [diagnoseReport, setDiagnoseReport] = useState<string | null>(null);

  // ── Log ──
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      text: documentId ? `已绑定当前文档` : "工具已就绪，请选择文件",
      level: "info",
    },
  ]);
  const [logExpanded, setLogExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [...prev, { text, level }]);
  };

  // ── Load presets on mount ──
  useEffect(() => {
    apiListPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logExpanded) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logExpanded]);

  // ── File selection ──
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      addLog(`已选择: ${f.name}`);
      // Clear previous results
      setAnalysisResult(null);
      setFormatStats(null);
      setSmartStats(null);
      setPunctStats(null);
      setResultMessage(null);
      setResultFileName(null);
    }
  };

  // ── Preset detail ──
  const loadPresetDetail = async (name: string) => {
    try {
      const detail = await apiGetPresetDetail(name);
      setPresetDetail(detail);
      setShowPresetDetail(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ── Preset CRUD ──
  const openNewPresetEditor = async () => {
    try {
      // Load default custom settings as template
      const tpl = await apiGetPresetDetail("custom");
      const { key, ...settings } = tpl;
      setEditingPreset(settings);
      setEditingName("");
      setEditingKey(null);
      setIsNewPreset(true);
      setEnabledOptionalHeadings({
        heading2: !!settings.heading2,
        heading3: !!settings.heading3,
        heading4: !!settings.heading4,
        heading5: !!settings.heading5,
      });
      setShowPresetEditor(true);
    } catch (err: any) {
      toast.error("加载预设模板失败: " + err.message);
    }
  };

  const openEditPresetEditor = async (presetKey: string) => {
    try {
      const detail = await apiGetPresetDetail(presetKey);
      const { key, ...settings } = detail;
      setEditingPreset(settings);
      setEditingName(settings.name || "");
      setEditingKey(presetKey);
      setIsNewPreset(false);
      setEnabledOptionalHeadings({
        heading2: !!settings.heading2,
        heading3: !!settings.heading3,
        heading4: !!settings.heading4,
        heading5: !!settings.heading5,
      });
      setShowPresetEditor(true);
    } catch (err: any) {
      toast.error("加载预设失败: " + err.message);
    }
  };

  /** 将内置预设复制为新的自定义预设进行编辑 */
  const copyPresetToNew = async (presetKey: string) => {
    try {
      const detail = await apiGetPresetDetail(presetKey);
      const { key, ...settings } = detail;
      setEditingPreset(settings);
      setEditingName((settings.name || "") + " (副本)");
      setEditingKey(null);
      setIsNewPreset(true);
      setEnabledOptionalHeadings({
        heading2: !!settings.heading2,
        heading3: !!settings.heading3,
        heading4: !!settings.heading4,
        heading5: !!settings.heading5,
      });
      setShowPresetEditor(true);
    } catch (err: any) {
      toast.error("加载预设失败: " + err.message);
    }
  };

  const handleSavePreset = async () => {
    if (!editingName.trim()) {
      toast.error("请输入预设名称");
      return;
    }
    setIsSavingPreset(true);
    try {
      const data = { ...editingPreset, name: editingName };
      // Remove disabled optional headings
      for (const hKey of ["heading2", "heading3", "heading4", "heading5"]) {
        if (!enabledOptionalHeadings[hKey]) {
          delete data[hKey];
        }
      }
      if (isNewPreset) {
        // Generate key from name
        const key = "custom_" + Date.now();
        await apiCreatePreset(key, data);
        toast.success("预设创建成功");
      } else if (editingKey) {
        await apiUpdatePreset(editingKey, data);
        toast.success("预设更新成功");
      }
      // Refresh presets
      const refreshed = await apiListPresets();
      setPresets(refreshed);
      setShowPresetEditor(false);
    } catch (err: any) {
      toast.error("保存失败: " + err.message);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async (key: string) => {
    if (
      !(await confirm({
        message: "确定删除此预设？",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeletePreset(key);
      const refreshed = await apiListPresets();
      setPresets(refreshed);
      if (selectedPreset === key) setSelectedPreset("official");
      toast.success("预设已删除");
    } catch (err: any) {
      toast.error("删除失败: " + err.message);
    }
  };

  const updateElementProp = (element: string, prop: string, value: any) => {
    setEditingPreset((prev) => ({
      ...prev,
      [element]: {
        ...prev[element],
        [prop]: value,
      },
    }));
  };

  // ── Whether presets should be enabled ──
  const presetsEnabled = mode === "smart";

  // ── Main process ──
  const handleProcess = async () => {
    // 嵌入模式需要 documentId，独立模式需要 file
    if (!embedded && !file) {
      toast.error("请先选择输入文件");
      return;
    }
    if (!embedded && !file!.name.toLowerCase().endsWith(".docx")) {
      toast.error("仅支持 .docx 格式文件");
      return;
    }

    setIsProcessing(true);
    setAnalysisResult(null);
    setFormatStats(null);
    setSmartStats(null);
    setPunctStats(null);
    setResultMessage(null);
    setResultFileName(null);
    setDiagnoseReport(null);
    setAiStreaming(false);

    addLog("");
    addLog("───────────────────────────────────");
    addLog(`开始处理: ${embedded ? documentTitle || "当前文档" : file!.name}`);

    try {
      if (embedded) {
        // ── 嵌入模式：全部使用 Dify AI 流式处理 ──
        setAiStreaming(true);
        let accumulated = "";
        const abortCtrl = new AbortController();
        aiAbortRef.current = abortCtrl;

        if (mode === "smart") {
          const presetLabel =
            presets.find((p) => p.key === selectedPreset)?.name ||
            selectedPreset;
          addLog(`AI 智能排版开始 — 格式预设: ${presetLabel}`);

          await apiAiFormatStream(
            documentId!,
            selectedPreset,
            {
              onTextChunk: (text) => {
                accumulated += text;
                onContentUpdate?.(accumulated);
              },
              onEnd: () => {
                addLog(`智能排版完成 (${accumulated.length} 字符)`, "success");
              },
              onError: (msg) => {
                addLog(`排版错误: ${msg}`, "error");
                toast.error(msg);
              },
            },
            abortCtrl.signal,
          );

          setResultMessage("智能排版完成 — 结果已显示在公文预览区");
          toast.success("智能排版完成，请查看预览区");
        } else if (mode === "analyze") {
          addLog("AI 格式诊断开始...");

          await apiAiDiagnoseStream(
            documentId!,
            {
              onTextChunk: (text) => {
                accumulated += text;
                setDiagnoseReport(accumulated);
              },
              onEnd: () => {
                addLog(`格式诊断完成`, "success");
              },
              onError: (msg) => {
                addLog(`诊断错误: ${msg}`, "error");
                toast.error(msg);
              },
            },
            abortCtrl.signal,
          );

          setResultMessage("格式诊断完成");
          toast.success("格式诊断完成");
        } else if (mode === "punctuation") {
          addLog("AI 标点修复开始...");

          await apiAiPunctFixStream(
            documentId!,
            {
              onTextChunk: (text) => {
                accumulated += text;
                onContentUpdate?.(accumulated);
              },
              onEnd: () => {
                addLog(`标点修复完成 (${accumulated.length} 字符)`, "success");
              },
              onError: (msg) => {
                addLog(`修复错误: ${msg}`, "error");
                toast.error(msg);
              },
            },
            abortCtrl.signal,
          );

          setResultMessage("标点修复完成 — 结果已显示在公文预览区");
          toast.success("标点修复完成，请查看预览区");
        }

        setAiStreaming(false);
        aiAbortRef.current = null;
      } else {
        // ── 独立模式：使用后端 Python 处理 ──
        if (mode === "analyze") {
          addLog("正在诊断...");
          const result = await apiAnalyzeFormat(file!);
          setAnalysisResult(result);
          addLog("诊断完成", "success");
          toast.success(`诊断完成，发现 ${result.summary.total_issues} 处问题`);
        } else if (mode === "punctuation") {
          addLog("修复标点...");
          const { blob, stats, filename } = await apiFixPunctuation(file!);
          setPunctStats(stats);
          downloadBlob(blob, filename);
          setResultMessage("标点修复完成");
          setResultFileName(filename);
          addLog(
            `修复了 ${stats.paragraphs_fixed} 段 + ${stats.table_cells_fixed} 个表格单元格`,
            "success",
          );
          toast.success("标点修复完成，已下载文件");
        } else {
          // smart
          addLog("步骤 1/2: 修复标点...");
          addLog("步骤 2/2: 应用格式...");
          const { blob, stats, filename } = await apiSmartFormat(
            file!,
            selectedPreset,
          );
          setSmartStats(stats);
          downloadBlob(blob, filename);
          setResultMessage("处理完成");
          setResultFileName(filename);
          const presetLabel =
            presets.find((p) => p.key === selectedPreset)?.name ||
            selectedPreset;
          addLog(`应用格式: ${presetLabel}`, "success");
          toast.success("智能格式化完成，已下载文件");
        }
      }
      addLog("全部完成", "success");
    } catch (err: any) {
      addLog(`错误: ${err.message}`, "error");
      toast.error("处理失败: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasResult = !!(
    analysisResult ||
    formatStats ||
    smartStats ||
    punctStats ||
    resultMessage ||
    diagnoseReport
  );

  /* ==============================================================
     Render
     ============================================================== */
  return (
    <div className={`w-full ${embedded ? "space-y-0" : "space-y-0"}`}>
      {/* ── 嵌入模式：阶段头部（与起草/审核/优化阶段保持一致风格） ── */}
      {embedded && (
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Settings size={20} />
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">
                格式化 — 国标格式排版规范化
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                当前文档：{documentTitle || "未命名文档"}
              </div>
            </div>
          </div>
          {stageActions}
        </div>
      )}

      <div className={embedded ? "p-4 space-y-4" : ""}>
        {/* ── 1. 标题（仅独立模式） ── */}
        {!embedded && (
          <h1 className="text-2xl font-bold text-gray-800 mb-8">
            公文格式处理工具
          </h1>
        )}

        {/* Hidden file input */}
        <input
          type="file"
          accept=".docx"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* ── 2. 文件选择（仅独立模式） ── */}
        {!embedded && (
          <div className="space-y-2 mb-8">
            <div className="flex items-center">
              <span className="text-sm text-gray-500 w-10 shrink-0">输入</span>
              <div
                onClick={handleFileSelect}
                className="flex-1 flex items-center border border-gray-200 bg-gray-50/70 rounded px-4 py-2.5 cursor-pointer hover:border-gray-300 transition group"
              >
                <span
                  className={`flex-1 text-sm truncate ${file ? "text-gray-800 font-medium" : "text-gray-400"}`}
                >
                  {file ? file.name : "未选择"}
                </span>
                <span className="h-4 w-px bg-gray-300 mx-3" />
                <span className="text-sm text-blue-600 group-hover:text-blue-700 whitespace-nowrap">
                  点击选择需要修改的文档
                </span>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-500 w-10 shrink-0">输出</span>
              <div className="flex-1 flex items-center border border-gray-200 bg-gray-50/70 rounded px-4 py-2.5">
                <span className="flex-1 text-sm text-gray-400 truncate">
                  {file
                    ? `${file.name.replace(/\.docx$/i, "")}_processed.docx`
                    : "未选择"}
                </span>
                <span className="h-4 w-px bg-gray-300 mx-3" />
                <span className="text-sm text-gray-400 whitespace-nowrap">
                  文档修改后的储存位置
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. 模式选择 ── */}
        {embedded ? (
          /* 嵌入模式：紧凑横排三按钮 */
          <div className="flex gap-2">
            {(
              [
                {
                  key: "smart" as Mode,
                  icon: Wand2,
                  label: "智能排版",
                  badge: "AI",
                },
                {
                  key: "analyze" as Mode,
                  icon: Search,
                  label: "格式诊断",
                  badge: "AI",
                },
                {
                  key: "punctuation" as Mode,
                  icon: Pencil,
                  label: "标点修复",
                  badge: "AI",
                },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all ${
                  mode === m.key
                    ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                }`}
              >
                <m.icon size={16} />
                {m.label}
                {mode === m.key && (
                  <span className="text-[10px] text-white px-1.5 py-0.5 rounded bg-blue-600">
                    {m.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          /* 独立模式：卡片样式 */
          <div className="space-y-3 mb-6">
            {/* 智能一键处理 — 大卡片（推荐） */}
            <div
              onClick={() => setMode("smart")}
              className={`border rounded-lg p-5 cursor-pointer transition-all ${
                mode === "smart"
                  ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-4">
                <Wand2
                  size={28}
                  className={`mt-0.5 shrink-0 ${mode === "smart" ? "text-blue-600" : "text-gray-500"}`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-gray-800">
                      智能一键处理
                    </span>
                    <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">
                      推荐
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    自动修复标点符号，并应用标准格式规范，一步到位完成文档处理
                  </p>
                </div>
              </div>
            </div>

            {/* 格式诊断 & 标点修复 — 两列 */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setMode("analyze")}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  mode === "analyze"
                    ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Search
                    size={24}
                    className={`shrink-0 ${mode === "analyze" ? "text-blue-600" : "text-gray-500"}`}
                  />
                  <div>
                    <div className="font-bold text-sm text-gray-800">
                      格式诊断
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      仅分析文档问题，不修改文件
                    </p>
                  </div>
                </div>
              </div>
              <div
                onClick={() => setMode("punctuation")}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  mode === "punctuation"
                    ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Pencil
                    size={24}
                    className={`shrink-0 ${mode === "punctuation" ? "text-blue-600" : "text-gray-500"}`}
                  />
                  <div>
                    <div className="font-bold text-sm text-gray-800">
                      标点修复
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      仅修复中英文标点混用
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. 格式预设 + 开始处理（嵌入模式横排） ── */}
        {embedded ? (
          <div className="space-y-3">
            {/* 预设选择 + CRUD */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0">格式预设</span>
                {presets
                  .filter((p) => p.key !== "custom")
                  .map((p) => (
                    <div key={p.key} className="relative group/preset">
                      <button
                        onClick={() => {
                          if (presetsEnabled) setSelectedPreset(p.key);
                        }}
                        className={`px-3 py-1.5 border rounded text-xs transition-all ${
                          !presetsEnabled
                            ? "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
                            : selectedPreset === p.key
                              ? "border-blue-500 bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-500"
                              : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white cursor-pointer"
                        }`}
                      >
                        {p.name}
                      </button>
                      {/* 自定义预设：编辑/删除按钮 */}
                      {presetsEnabled && !p.is_builtin && (
                        <div className="absolute -top-1 -right-1 hidden group-hover/preset:flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditPresetEditor(p.key);
                            }}
                            className="w-4 h-4 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600"
                            title="编辑"
                          >
                            <Edit3 size={8} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(p.key);
                            }}
                            className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                            title="删除"
                          >
                            <Trash2 size={8} />
                          </button>
                        </div>
                      )}
                      {/* 内置预设：复制为新预设 */}
                      {presetsEnabled && p.is_builtin && (
                        <div className="absolute -top-1 -right-1 hidden group-hover/preset:flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyPresetToNew(p.key);
                            }}
                            className="w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600"
                            title="复制为新预设"
                          >
                            <Plus size={8} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                {presetsEnabled && (
                  <>
                    <button
                      onClick={() => loadPresetDetail(selectedPreset)}
                      className="px-1.5 py-1.5 text-gray-400 hover:text-blue-600 transition"
                      title="查看预设详情"
                    >
                      <Info size={14} />
                    </button>
                    <button
                      onClick={openNewPresetEditor}
                      className="px-2 py-1.5 text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded hover:bg-blue-50 flex items-center gap-1 transition"
                    >
                      <Plus size={12} /> 新建预设
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* 开始处理 */}
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-bold text-sm shadow-md shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={16} /> 处理中...
                </>
              ) : (
                "开始处理"
              )}
            </button>
          </div>
        ) : (
          <>
            {/* ── 4. 格式预设（独立模式）── */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">格式预设</span>
                {presetsEnabled && (
                  <button
                    onClick={openNewPresetEditor}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus size={12} /> 新建预设
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {presets
                  .filter((p) => p.key !== "custom")
                  .map((p) => (
                    <div key={p.key} className="relative group/preset">
                      <button
                        onClick={() => {
                          if (presetsEnabled) setSelectedPreset(p.key);
                        }}
                        className={`px-4 py-2 border rounded text-sm transition-all ${
                          !presetsEnabled
                            ? "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
                            : selectedPreset === p.key
                              ? "border-blue-500 bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-500"
                              : "border-gray-200 text-gray-700 hover:border-gray-300 bg-white cursor-pointer"
                        }`}
                      >
                        {p.name}
                      </button>
                      {/* 自定义预设：编辑/删除按钮 */}
                      {presetsEnabled && !p.is_builtin && (
                        <div className="absolute -top-1 -right-1 hidden group-hover/preset:flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditPresetEditor(p.key);
                            }}
                            className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600"
                            title="编辑"
                          >
                            <Edit3 size={10} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(p.key);
                            }}
                            className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                            title="删除"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                      {/* 内置预设：复制为新预设 */}
                      {presetsEnabled && p.is_builtin && (
                        <div className="absolute -top-1 -right-1 hidden group-hover/preset:flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyPresetToNew(p.key);
                            }}
                            className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600"
                            title="复制为新预设"
                          >
                            <Plus size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                {/* 查看详情按钮 */}
                {presetsEnabled && (
                  <button
                    onClick={() => loadPresetDetail(selectedPreset)}
                    className="px-2 py-2 text-gray-400 hover:text-blue-600 transition"
                    title="查看预设详情"
                  >
                    <Info size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* ── 5. 开始处理按钮 ── */}
            <button
              onClick={handleProcess}
              disabled={!file || isProcessing}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-bold text-base shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mb-6"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> 处理中...
                </>
              ) : (
                "开始处理"
              )}
            </button>
          </>
        )}

        {/* ── 6. 结果展示区 ── */}
        <div className={embedded ? "min-h-[40px]" : "mb-4 min-h-[60px]"}>
          {!hasResult && (
            <div className="text-center py-6 text-gray-400 text-sm">
              处理结果将在此处显示
            </div>
          )}

          {/* 成功消息（标点修复 / 智能格式化） */}
          {resultMessage && (
            <div className="border border-gray-200 rounded-lg p-5 bg-white space-y-2">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={24} className="text-green-500" />
                <span className="font-bold text-lg text-gray-800">
                  {resultMessage}
                </span>
              </div>
              {resultFileName && (
                <div className="text-sm text-gray-500">
                  输出文件：{resultFileName}
                </div>
              )}
            </div>
          )}

          {/* 诊断报告 */}
          {analysisResult && (
            <div className="border border-gray-200 rounded-lg p-5 bg-white space-y-4">
              <h3 className="font-bold text-base text-gray-800">诊断报告</h3>

              {/* 分类计数 */}
              <div className="space-y-2">
                {[
                  { name: "标点问题", items: analysisResult.punctuation },
                  { name: "序号问题", items: analysisResult.numbering },
                  { name: "段落问题", items: analysisResult.paragraph },
                  { name: "字体问题", items: analysisResult.font },
                ].map((cat) => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-20">
                      {cat.name}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        cat.items.length > 0
                          ? "text-amber-600"
                          : "text-green-600"
                      }`}
                    >
                      {cat.items.length > 0
                        ? `${cat.items.length} 处`
                        : "无问题"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="h-px bg-gray-200" />

              {/* 总结 */}
              <div
                className={`font-bold text-sm ${
                  analysisResult.summary.total_issues === 0
                    ? "text-green-600"
                    : "text-amber-600"
                }`}
              >
                {analysisResult.summary.total_issues === 0
                  ? "文档格式规范，未发现问题"
                  : `共发现 ${analysisResult.summary.total_issues} 处格式问题`}
              </div>

              {/* 详细问题 */}
              {analysisResult.summary.total_issues > 0 && (
                <div className="space-y-2 mt-2">
                  {analysisResult.punctuation.length > 0 && (
                    <IssueGroup
                      title="标点问题"
                      items={groupPunctuation(analysisResult.punctuation)}
                    />
                  )}
                  {analysisResult.numbering.length > 0 && (
                    <IssueGroup
                      title="序号问题"
                      items={analysisResult.numbering.map(
                        (i) => `${i.type}: ${i.detail || ""}`,
                      )}
                    />
                  )}
                  {analysisResult.paragraph.length > 0 && (
                    <IssueGroup
                      title="段落问题"
                      items={analysisResult.paragraph.map((i) =>
                        i.type === "缺少首行缩进"
                          ? `${i.type}: 第${(i.paras || []).slice(0, 5).join(",")}${(i.paras || []).length > 5 ? "..." : ""}段`
                          : `${i.type}: ${i.detail || ""}`,
                      )}
                    />
                  )}
                  {analysisResult.font.length > 0 && (
                    <IssueGroup
                      title="字体问题"
                      items={analysisResult.font.map(
                        (i) => `${i.type}: ${i.detail || ""}`,
                      )}
                    />
                  )}
                  {analysisResult.summary.suggestions.length > 0 && (
                    <div className="p-3 bg-blue-50 rounded text-xs text-blue-700 space-y-1">
                      <div className="font-medium">建议：</div>
                      {analysisResult.summary.suggestions.map((s, i) => (
                        <div key={i}>• {s}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 标点修复统计（仅在非 smart 模式） */}
          {punctStats && !smartStats && (
            <div className="border border-gray-200 rounded-lg p-4 bg-white mt-3">
              <div className="text-sm text-gray-700">
                修复 <strong>{punctStats.paragraphs_fixed}</strong> 段 +{" "}
                <strong>{punctStats.table_cells_fixed}</strong> 个表格单元格
              </div>
            </div>
          )}

          {/* 智能格式化统计 */}
          {smartStats && (
            <div className="border border-gray-200 rounded-lg p-4 bg-white mt-3 space-y-3">
              <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                <span>发现 {smartStats.analysis.total_issues} 处问题</span>
                <span className="text-gray-300">→</span>
                <span>
                  修复 {smartStats.punctuation.paragraphs_fixed} 段标点
                </span>
                <span className="text-gray-300">→</span>
                <span>格式化完成</span>
              </div>
              {Object.keys(smartStats.format).filter(
                (k) => (smartStats.format as any)[k] > 0,
              ).length > 0 && (
                <div className="grid grid-cols-5 gap-1.5 text-xs">
                  {Object.entries(smartStats.format)
                    .filter(([, v]) => (v as number) > 0)
                    .map(([k, v]) => (
                      <div
                        key={k}
                        className="bg-gray-50 rounded px-2 py-1.5 text-center"
                      >
                        <div className="font-bold text-gray-700">{v}</div>
                        <div className="text-gray-400">
                          {PARA_TYPE_LABELS[k] || k}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* AI 流式处理状态提示 */}
          {aiStreaming && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30 mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="text-blue-600 animate-spin" />
                <span className="text-sm font-bold text-blue-800">
                  {mode === "smart"
                    ? "AI 智能排版中..."
                    : mode === "analyze"
                      ? "AI 格式诊断中..."
                      : "AI 标点修复中..."}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {mode === "analyze"
                  ? "正在分析文档格式，诊断报告将显示在下方"
                  : "正在流式输出到下方「📄 公文预览」区域，请实时查看效果"}
              </p>
              <button
                onClick={() => {
                  aiAbortRef.current?.abort();
                  setAiStreaming(false);
                  addLog("已手动取消处理", "warning");
                }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <X size={12} /> 取消
              </button>
            </div>
          )}

          {/* AI 格式诊断报告 */}
          {diagnoseReport && !aiStreaming && (
            <div className="border border-gray-200 rounded-lg p-5 bg-white mt-3 space-y-2">
              <div
                className="prose prose-sm max-w-none text-gray-700"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(
                    diagnoseReport
                      .replace(
                        /^## (.+)$/gm,
                        '<h2 class="text-base font-bold text-gray-800 mt-4 mb-2">$1</h2>',
                      )
                      .replace(
                        /^### (.+)$/gm,
                        '<h3 class="text-sm font-bold text-gray-700 mt-3 mb-1">$1</h3>',
                      )
                      .replace(
                        /^- (.+)$/gm,
                        '<div class="text-xs text-gray-600 pl-3 py-0.5">• $1</div>',
                      )
                      .replace(/\n\n/g, '<div class="h-2"></div>')
                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                  ),
                }}
              />
            </div>
          )}

          {/* 格式化统计（单独操作） */}
          {formatStats && (
            <div className="border border-gray-200 rounded-lg p-4 bg-white mt-3">
              <div className="grid grid-cols-4 gap-2 text-xs">
                {Object.entries(formatStats)
                  .filter(([, v]) => (v as number) > 0)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      className="bg-gray-50 rounded px-2 py-1 text-center"
                    >
                      <div className="font-bold text-green-700">{v}</div>
                      <div className="text-gray-400">
                        {PARA_TYPE_LABELS[k] || k}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 7. 可折叠运行日志 ── */}
        <div className="border-t border-gray-200">
          <button
            onClick={() => setLogExpanded(!logExpanded)}
            className="w-full flex items-center gap-2 py-2.5 px-1 text-sm text-gray-500 hover:text-gray-700 transition"
          >
            {logExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span>{logExpanded ? "收起运行日志" : "展开运行日志"}</span>
          </button>
          {logExpanded && (
            <div className="bg-gray-900 rounded-b-lg px-5 py-4 max-h-60 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.map((entry, i) => (
                <div
                  key={i}
                  className={
                    entry.level === "success"
                      ? "text-green-400"
                      : entry.level === "warning"
                        ? "text-yellow-400"
                        : entry.level === "error"
                          ? "text-red-400"
                          : "text-gray-300"
                  }
                >
                  {entry.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* ── 预设详情弹窗 ── */}
        {showPresetDetail && presetDetail && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowPresetDetail(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-800">
                  {presetDetail.name}
                </h3>
                <button
                  onClick={() => setShowPresetDetail(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>

              {presetDetail.page && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-gray-600">
                    页边距 (cm)
                  </h4>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {Object.entries(presetDetail.page).map(([k, v]) => (
                      <div
                        key={k}
                        className="bg-gray-50 rounded p-2 text-center"
                      >
                        <div className="text-gray-400">
                          {(
                            {
                              top: "上",
                              bottom: "下",
                              left: "左",
                              right: "右",
                            } as any
                          )[k] || k}
                        </div>
                        <div className="font-bold">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ELEMENT_KEYS.map(({ key, label }) => {
                const fmt = (presetDetail as any)[key];
                if (!fmt || typeof fmt !== "object" || !fmt.font_cn)
                  return null;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100"
                  >
                    <span className="font-medium text-gray-700 w-20">
                      {label}
                    </span>
                    <span className="text-gray-500">
                      {fmt.font_cn} / {fmt.font_en}
                    </span>
                    <span className="text-gray-500">{fmt.size}pt</span>
                    <span className="text-gray-500">
                      {fmt.bold ? "粗体" : "常规"}{fmt.italic ? " 斜体" : ""}
                    </span>
                    <span className="text-gray-400">
                      {ALIGN_LABELS[fmt.align] || fmt.align}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 预设编辑器弹窗（新建/编辑自定义预设）── */}
        {showPresetEditor && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowPresetEditor(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-800">
                  {isNewPreset ? "新建格式预设" : "编辑格式预设"}
                </h3>
                <button
                  onClick={() => setShowPresetEditor(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 预设名称 */}
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1 block">
                  预设名称
                </label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="如：会议纪要格式"
                />
              </div>

              {/* 页边距 */}
              {editingPreset.page && (
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-2 block">
                    页边距 (cm)
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {(["top", "bottom", "left", "right"] as const).map(
                      (side) => (
                        <div key={side}>
                          <label className="text-[10px] text-gray-400 block mb-1">
                            {
                              {
                                top: "上",
                                bottom: "下",
                                left: "左",
                                right: "右",
                              }[side]
                            }
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            className="w-full border rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                            value={editingPreset.page?.[side] ?? ""}
                            onChange={(e) =>
                              setEditingPreset((prev) => ({
                                ...prev,
                                page: {
                                  ...prev.page,
                                  [side]: parseFloat(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* 各元素格式 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-600">
                    各元素格式
                  </label>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-gray-400">可选标题级别：</span>
                    {(["heading2", "heading3", "heading4", "heading5"] as const).map((hKey) => {
                      const hLabel = { heading2: "二级", heading3: "三级", heading4: "四级", heading5: "五级" }[hKey];
                      return (
                        <label key={hKey} className="flex items-center gap-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={!!enabledOptionalHeadings[hKey]}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setEnabledOptionalHeadings((prev) => ({ ...prev, [hKey]: checked }));
                              if (checked && !editingPreset[hKey]) {
                                // Add default heading format when enabled
                                setEditingPreset((prev) => ({
                                  ...prev,
                                  [hKey]: {
                                    font_cn: "仿宋_GB2312", font_en: "Times New Roman",
                                    size: 16, bold: false, italic: false, align: "left", indent: 32,
                                    line_spacing: 28, space_before: 0, space_after: 0,
                                  },
                                }));
                              }
                            }}
                          />
                          <span className={enabledOptionalHeadings[hKey] ? "text-gray-700" : "text-gray-400"}>{hLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  {/* 表头 */}
                  <div className="grid grid-cols-[2fr_3fr_2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-0 bg-gray-50 text-[10px] text-gray-500 font-medium px-3 py-2 border-b">
                    <div>元素</div>
                    <div>中文字体</div>
                    <div>英文字体</div>
                    <div>字号</div>
                    <div className="text-center">粗体</div>
                    <div className="text-center">斜体</div>
                    <div>对齐</div>
                    <div>缩进</div>
                    <div>行距</div>
                  </div>
                  {/* 各行 */}
                  {ELEMENT_KEYS.map(({ key, label, ...rest }) => {
                    const isOptional = "optional" in rest && rest.optional;
                    if (isOptional && !enabledOptionalHeadings[key]) return null;
                    const el = editingPreset[key];
                    if (!el || typeof el !== "object" || !el.font_cn)
                      return null;
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-[2fr_3fr_2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-0 px-3 py-1.5 border-b last:border-b-0 items-center text-xs hover:bg-gray-50"
                      >
                        <div className="font-medium text-gray-700 truncate">
                          {label}
                        </div>
                        <div className="pr-1">
                          <select
                            className="w-full border rounded px-1 py-1 text-[11px] outline-none"
                            value={el.font_cn}
                            onChange={(e) =>
                              updateElementProp(key, "font_cn", e.target.value)
                            }
                          >
                            {COMMON_FONTS_CN.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pr-1">
                          <select
                            className="w-full border rounded px-1 py-1 text-[11px] outline-none"
                            value={el.font_en}
                            onChange={(e) =>
                              updateElementProp(key, "font_en", e.target.value)
                            }
                          >
                            {COMMON_FONTS_EN.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pr-1">
                          <input
                            type="number"
                            className="w-full border rounded px-1 py-1 text-[11px] outline-none"
                            value={el.size}
                            onChange={(e) =>
                              updateElementProp(
                                key,
                                "size",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={!!el.bold}
                            onChange={(e) =>
                              updateElementProp(key, "bold", e.target.checked)
                            }
                          />
                        </div>
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={!!el.italic}
                            onChange={(e) =>
                              updateElementProp(key, "italic", e.target.checked)
                            }
                          />
                        </div>
                        <div className="pr-1">
                          <select
                            className="w-full border rounded px-0.5 py-1 text-[10px] outline-none"
                            value={el.align}
                            onChange={(e) =>
                              updateElementProp(key, "align", e.target.value)
                            }
                          >
                            {ALIGN_OPTIONS.map((a) => (
                              <option key={a} value={a}>
                                {ALIGN_LABELS[a] || a}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pr-1">
                          <input
                            type="number"
                            className="w-full border rounded px-1 py-1 text-[11px] outline-none"
                            value={el.indent ?? 0}
                            onChange={(e) =>
                              updateElementProp(
                                key,
                                "indent",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            className="w-full border rounded px-1 py-1 text-[11px] outline-none"
                            value={el.line_spacing ?? 28}
                            onChange={(e) =>
                              updateElementProp(
                                key,
                                "line_spacing",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 保存按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowPresetEditor(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSavePreset}
                  disabled={isSavingPreset}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingPreset ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {isNewPreset ? "创建预设" : "保存修改"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
};

/* ================================================================
   Sub-components
   ================================================================ */

const IssueGroup = ({ title, items }: { title: string; items: string[] }) => (
  <div className="p-3 bg-gray-50 rounded space-y-1">
    <div className="font-medium text-xs text-gray-600">
      【{title}】{items.length} 处
    </div>
    {items.slice(0, 8).map((item, i) => (
      <div key={i} className="text-xs text-gray-500 pl-2">
        • {item}
      </div>
    ))}
    {items.length > 8 && (
      <div className="text-xs text-gray-400 pl-2">
        ... 另有 {items.length - 8} 处
      </div>
    )}
  </div>
);
