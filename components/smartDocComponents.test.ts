import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PenTool, Settings2, ShieldAlert } from "lucide-react";

import type {
  DocDetail,
  DocVersion,
  FormatSuggestResult,
  FormatSuggestionItem,
} from "../api";
import { SmartDocAssistPanels } from "./SmartDocAssistPanels";
import { SmartDocAiStatusPanel } from "./SmartDocAiStatusPanel";
import { SmartDocDialogs } from "./SmartDocDialogs";
import {
  SmartDocEditorHeader,
  SmartDocEditorViewport,
} from "./SmartDocEditorPanel";
import { SmartDocHeader } from "./SmartDocHeader";
import { SmartDocImportPanel } from "./SmartDocImportPanel";
import { SmartDocOptimizeModal } from "./SmartDocOptimizeModal";
import { SmartDocPipelineStepper } from "./SmartDocPipelineStepper";
import { SmartDocPresetManager } from "./SmartDocPresetManager";
import { SmartDocSidePanel } from "./SmartDocSidePanel";
import { createDefaultSmartDocPresetForm } from "./smartDocPresetConfig";
import type { StructuredParagraph } from "./StructuredDocRenderer";

const noop = () => undefined;

function makeDocDetail(overrides: Partial<DocDetail> = {}): DocDetail {
  return {
    id: "doc-1",
    title: "关于专项经费申请的请示",
    category: "official",
    doc_type: "official",
    status: "draft",
    security: "internal",
    urgency: "normal",
    visibility: "private",
    creator_id: "user-1",
    created_at: "2026-04-06T08:00:00Z",
    updated_at: "2026-04-06T08:30:00Z",
    content: "第一段\n\n第二段",
    ...overrides,
  };
}

function makeFormatSuggestion(
  overrides: Partial<FormatSuggestionItem> = {},
): FormatSuggestionItem {
  return {
    category: "font",
    target: "主标题",
    current: "宋体三号",
    suggestion: "改为方正小标宋体二号",
    standard: "GB/T 9704",
    priority: "high",
    ...overrides,
  };
}

describe("smart doc components", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T19:28:30+08:00"));
  });

  it("renders editable header controls and relative save label", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocHeader, {
        currentDoc: makeDocDetail(),
        isReadOnly: false,
        statusClassName: "bg-gray-100 text-gray-700",
        rightPanel: "material",
        showVersionHistory: true,
        canUndo: true,
        canRedo: false,
        autoSaveEnabled: true,
        lastSavedAt: new Date("2026-04-06T19:28:10+08:00"),
        displayParagraphCount: 2,
        onBack: noop,
        onTitleInput: noop,
        onTitleCommit: noop,
        onUndo: noop,
        onRedo: noop,
        onSave: noop,
        onToggleAutoSave: noop,
        onToggleMaterialPanel: noop,
        onOpenVersionHistory: noop,
        onDownloadFormatted: noop,
        onDownloadPdf: noop,
        onOpenExportPreview: noop,
      }),
    );

    expect(html).toContain("关于专项经费申请的请示");
    expect(html).toContain("草稿");
    expect(html).toContain("公文标准");
    expect(html).toContain("私密");
    expect(html).toContain("自动");
    expect(html).toContain("20秒前");
    expect(html).toContain("下载文档");
    expect(html).not.toContain("只读查看");
  });

  it("renders read-only header badge", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocHeader, {
        currentDoc: makeDocDetail({ visibility: "public", creator_id: "other" }),
        isReadOnly: true,
        statusClassName: "bg-gray-100 text-gray-700",
        rightPanel: null,
        showVersionHistory: false,
        canUndo: false,
        canRedo: false,
        autoSaveEnabled: false,
        lastSavedAt: null,
        displayParagraphCount: 0,
        onBack: noop,
        onTitleInput: noop,
        onTitleCommit: noop,
        onUndo: noop,
        onRedo: noop,
        onSave: noop,
        onToggleAutoSave: noop,
        onToggleMaterialPanel: noop,
        onOpenVersionHistory: noop,
        onDownloadFormatted: noop,
        onDownloadPdf: noop,
        onOpenExportPreview: noop,
      }),
    );

    expect(html).toContain("只读查看");
    expect(html).toContain("公开");
    expect(html).not.toContain("自动");
  });

  it("renders outline confirmation and format suggestion panels", () => {
    const suggestions = [
      makeFormatSuggestion(),
      makeFormatSuggestion({
        category: "spacing",
        target: "正文",
        current: "24磅",
        suggestion: "调整为28磅",
        priority: "medium",
      }),
    ];
    const formatSuggestResult: FormatSuggestResult = {
      doc_type_label: "公文请示",
      suggestions,
      summary: {
        overall: "结构完整，但标题和正文排版仍需调整",
        top_issues: ["标题字号不规范", "正文行距偏小"],
        recommended_preset: "标准公文",
      },
      structure_analysis: {
        missing_elements: ["附件说明"],
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(SmartDocAssistPanels, {
        showOutlinePanel: true,
        outlineText: "一、申请背景\n二、经费测算",
        showFormatSuggestPanel: true,
        formatSuggestions: suggestions,
        isFormatSuggesting: false,
        formatSuggestResult,
        formatSuggestParas: [{ text: "正文", style_type: "body" }],
        toast: { success: noop },
        onOutlineChange: noop,
        onConfirmOutline: noop,
        onRegenerateOutline: noop,
        onSkipOutline: noop,
        onCloseFormatSuggest: noop,
        onReplaceAiInstruction: noop,
        onAppendAiInstruction: noop,
        onApplyFormatSuggestParas: noop,
      }),
    );

    expect(html).toContain("AI 已生成大纲，请确认后展开正文");
    expect(html).toContain("确认大纲并展开正文");
    expect(html).toContain("排版建议");
    expect(html).toContain("识别文档类型：");
    expect(html).toContain("公文请示");
    expect(html).toContain("推荐预设：");
    expect(html).toContain("标准公文");
    expect(html).toContain("⚠️ 缺少要素：附件说明");
    expect(html).toContain("一键应用");
  });

  it("renders version history and export preview dialogs", () => {
    const version: DocVersion = {
      id: "ver-1",
      version_number: 3,
      change_type: "format",
      change_summary: "应用格式化结果",
      has_format: true,
      created_at: "2026-04-06T11:20:00Z",
      created_by_name: "张三",
    };
    const paragraphs: StructuredParagraph[] = [
      { text: "关于专项经费申请的请示", style_type: "title" },
      { text: "正文第一段", style_type: "body" },
    ];

    const html = renderToStaticMarkup(
      React.createElement(SmartDocDialogs, {
        toast: { success: noop },
        currentDoc: makeDocDetail(),
        displayParagraphs: paragraphs,
        showVersionHistory: true,
        versionList: [version],
        isLoadingVersions: false,
        previewVersionId: "ver-1",
        previewVersionContent: "历史正文",
        isLoadingPreview: false,
        restoreConfirmVersion: version,
        showExportPreview: true,
        onCloseVersionHistory: noop,
        onPreviewVersion: noop,
        onRequestRestoreVersion: noop,
        onCancelRestoreVersion: noop,
        onConfirmRestoreVersion: noop,
        onCloseExportPreview: noop,
        onDownloadFormatted: noop,
        onDownloadPdf: noop,
      }),
    );

    expect(html).toContain("版本历史");
    expect(html).toContain("v3");
    expect(html).toContain("HEAD");
    expect(html).toContain("应用格式化结果");
    expect(html).toContain("恢复此版本");
    expect(html).toContain("确认恢复版本");
    expect(html).toContain("导出预览 — 关于专项经费申请的请示");
    expect(html).toContain("2 个段落，");
    expect(html).toContain("下载 Word");
    expect(html).toContain("下载 PDF");
  });

  it("renders editor header with review toolbar", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocEditorHeader, {
        aiStructuredParagraphs: [
          {
            text: "正文第一段",
            style_type: "body",
            _change: "modified",
            _original_text: "旧正文",
          },
          {
            text: "正文第二段",
            style_type: "body",
          },
        ],
        acceptedParagraphs: [],
        displayParagraphs: [
          {
            text: "正文第一段",
            style_type: "body",
          },
        ],
        isAiProcessing: false,
        currentDocContentLength: 120,
        onAcceptAll: noop,
        onRejectAll: noop,
        onApplyAiResult: noop,
      }),
    );

    expect(html).toContain("变更审查（接受或拒绝每条变更）");
    expect(html).toContain("1 处变更");
    expect(html).toContain("全部接受");
    expect(html).toContain("全部拒绝");
    expect(html).toContain("采用此结果");
  });

  it("renders editor viewport for accepted paragraphs and streaming text", () => {
    const acceptedHtml = renderToStaticMarkup(
      React.createElement(SmartDocEditorViewport, {
        aiStructuredParagraphs: [],
        acceptedParagraphs: [
          { text: "关于专项经费申请的请示", style_type: "title" },
          { text: "正文第一段", style_type: "body" },
        ],
        currentDocType: "official",
        isAiProcessing: false,
        isReadOnly: false,
        pipelineStage: 2,
        aiStreamingText: "",
        editableContentHtml: "<p>占位</p>",
        renderRichContent: () => React.createElement("div", null, "unused"),
        onAcceptedParagraphsChange: noop,
      }),
    );

    const streamingHtml = renderToStaticMarkup(
      React.createElement(SmartDocEditorViewport, {
        aiStructuredParagraphs: [],
        acceptedParagraphs: [],
        currentDocType: "official",
        isAiProcessing: true,
        isReadOnly: false,
        pipelineStage: 0,
        aiStreamingText: "AI 正在生成正文",
        editableContentHtml: "<p>占位</p>",
        renderRichContent: (content) =>
          React.createElement("div", null, content),
      }),
    );

    expect(acceptedHtml).toContain("正文第一段");
    expect(streamingHtml).toContain("AI 正在生成正文");
  });

  it("renders ai reasoning and processing status panel", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocAiStatusPanel, {
        aiReasoningText: "先识别文档结构，再补齐格式",
        isAiThinking: false,
        showReasoningPanel: true,
        processingLog: [
          { type: "status", message: "已进入格式化阶段", ts: 1 },
          { type: "info", message: "发现 2 条低置信度段落", ts: 2 },
        ],
        aiStructuredParagraphs: [
          {
            text: "关于专项经费申请的请示",
            style_type: "title",
            font_family: "方正小标宋体",
          },
        ],
        isAiProcessing: true,
        kbReferences: [
          {
            name: "请示写作规范",
            score: 0.92,
            type: "full_document",
            char_count: 1800,
          },
        ],
        onToggleReasoningPanel: noop,
      }),
    );

    expect(html).toContain("AI 推理过程");
    expect(html).toContain("先识别文档结构，再补齐格式");
    expect(html).toContain("已进入格式化阶段");
    expect(html).toContain("发现 2 条低置信度段落");
    expect(html).toContain("参考知识库文档");
    expect(html).toContain("请示写作规范");
    expect(html).toContain("结构化段落");
    expect(html).toContain("AI 正在处理…");
  });

  it("renders side panel template and material sections", () => {
    const templateHtml = renderToStaticMarkup(
      React.createElement(SmartDocSidePanel, {
        canManageMaterial: true,
        materialTab: "templates",
        currentStageId: "draft",
        currentStageLabel: "起草",
        instructionTemplates: [
          {
            id: "tpl-1",
            stage: "draft",
            label: "通知类公文",
            content: "请起草一份关于专项整治的通知。",
            builtIn: true,
          },
          {
            id: "tpl-2",
            stage: "all",
            label: "通用润色",
            content: "请提升表达正式性。",
            builtIn: false,
          },
        ],
        isAddingTemplate: true,
        newTemplate: {
          label: "自定义模板",
          content: "请补充背景说明",
          stage: "all",
        },
        materials: [],
        matSearch: "",
        matCategory: "全部",
        isAddingMat: false,
        newMat: {
          title: "",
          category: "通用",
          content: "",
        },
        onClose: noop,
        onMaterialTabChange: noop,
        onJumpToStage: noop,
        onUseTemplate: noop,
        onDeleteTemplate: noop,
        onStartAddingTemplate: noop,
        onCancelAddingTemplate: noop,
        onNewTemplateChange: noop,
        onSaveTemplate: noop,
        onMatSearchChange: noop,
        onMatCategoryChange: noop,
        onStartAddingMaterial: noop,
        onUseMaterial: noop,
        onDeleteMaterial: noop,
        onNewMaterialChange: noop,
        onSaveMaterial: noop,
        onCancelAddingMaterial: noop,
      }),
    );

    const materialListHtml = renderToStaticMarkup(
      React.createElement(SmartDocSidePanel, {
        canManageMaterial: true,
        materialTab: "material",
        currentStageId: "draft",
        currentStageLabel: "起草",
        instructionTemplates: [],
        isAddingTemplate: false,
        newTemplate: {
          label: "",
          content: "",
          stage: "all",
        },
        materials: [
          {
            id: "mat-1",
            title: "安全生产开头",
            category: "开头",
            content: "为进一步加强安全生产管理，现通知如下。",
            created_at: "2026-04-06T08:00:00Z",
          },
        ],
        matSearch: "安全",
        matCategory: "开头",
        isAddingMat: false,
        newMat: {
          title: "新素材",
          category: "通用",
          content: "内容示例",
        },
        onClose: noop,
        onMaterialTabChange: noop,
        onJumpToStage: noop,
        onUseTemplate: noop,
        onDeleteTemplate: noop,
        onStartAddingTemplate: noop,
        onCancelAddingTemplate: noop,
        onNewTemplateChange: noop,
        onSaveTemplate: noop,
        onMatSearchChange: noop,
        onMatCategoryChange: noop,
        onStartAddingMaterial: noop,
        onUseMaterial: noop,
        onDeleteMaterial: noop,
        onNewMaterialChange: noop,
        onSaveMaterial: noop,
        onCancelAddingMaterial: noop,
      }),
    );

    const addMaterialHtml = renderToStaticMarkup(
      React.createElement(SmartDocSidePanel, {
        canManageMaterial: true,
        materialTab: "material",
        currentStageId: "draft",
        currentStageLabel: "起草",
        instructionTemplates: [],
        isAddingTemplate: false,
        newTemplate: {
          label: "",
          content: "",
          stage: "all",
        },
        materials: [],
        matSearch: "",
        matCategory: "全部",
        isAddingMat: true,
        newMat: {
          title: "新素材",
          category: "通用",
          content: "内容示例",
        },
        onClose: noop,
        onMaterialTabChange: noop,
        onJumpToStage: noop,
        onUseTemplate: noop,
        onDeleteTemplate: noop,
        onStartAddingTemplate: noop,
        onCancelAddingTemplate: noop,
        onNewTemplateChange: noop,
        onSaveTemplate: noop,
        onMatSearchChange: noop,
        onMatCategoryChange: noop,
        onStartAddingMaterial: noop,
        onUseMaterial: noop,
        onDeleteMaterial: noop,
        onNewMaterialChange: noop,
        onSaveMaterial: noop,
        onCancelAddingMaterial: noop,
      }),
    );

    expect(templateHtml).toContain("素材 &amp; 指令");
    expect(templateHtml).toContain("通知类公文");
    expect(templateHtml).toContain("新增指令模板");
    expect(materialListHtml).toContain("搜索素材...");
    expect(materialListHtml).toContain("安全生产开头");
    expect(addMaterialHtml).toContain("新增素材");
  });

  it("renders preset manager dialog with form and grouped presets", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocPresetManager, {
        open: true,
        formatPresets: [
          {
            id: "preset-1",
            name: "标准公文",
            category: "公文写作",
            description: "适用于正式请示和通知",
            instruction: "标题二号小标宋，正文三号仿宋",
            systemPrompt: "严格执行国标公文格式",
            builtIn: true,
          },
          {
            id: "preset-2",
            name: "自定义公文格式",
            category: "排版格式",
            description: "用于特殊上报材料",
            instruction: "标题小二号，正文四号",
            systemPrompt: "按本单位上报规范排版",
            builtIn: false,
          },
        ],
        editingPreset: {
          id: "preset-1",
          name: "标准公文",
          category: "公文写作",
          description: "适用于正式请示和通知",
          instruction: "标题二号小标宋，正文三号仿宋",
          systemPrompt: "严格执行国标公文格式",
          builtIn: true,
        },
        presetForm: {
          ...createDefaultSmartDocPresetForm(),
          name: "标准公文",
          description: "适用于正式请示和通知",
          headingEnabled: true,
        },
        onClose: noop,
        onPresetFormChange: noop,
        onAddPreset: noop,
        onUpdatePreset: noop,
        onCancelEdit: noop,
        onEditPreset: noop,
        onCopyPreset: noop,
        onDeletePreset: noop,
      }),
    );

    expect(html).toContain("管理排版格式预设");
    expect(html).toContain("编辑预设「标准公文」");
    expect(html).toContain("保存修改");
    expect(html).toContain("公文写作（1 个）");
    expect(html).toContain("排版格式（1 个）");
    expect(html).toContain("复制为新预设");
    expect(html).toContain("自定义公文格式");
  });

  it("renders optimize modal with selected knowledge base scope", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocOptimizeModal, {
        open: true,
        targetTitle: "关于专项经费申请的请示",
        kbCollections: [
          {
            id: "kb-1",
            name: "公文规范库",
            document_count: 12,
            created_at: "2026-04-06T08:00:00Z",
            updated_at: "2026-04-06T09:00:00Z",
          },
        ],
        selectedKbId: "kb-1",
        onKbChange: noop,
        onClose: noop,
        onConfirm: noop,
      }),
    );

    expect(html).toContain("智能优化配置");
    expect(html).toContain("关于专项经费申请的请示");
    expect(html).toContain("引用知识库");
    expect(html).toContain("公文规范库");
    expect(html).toContain("确认优化");
  });

  it("renders pipeline stepper for active and completed stages", () => {
    const html = renderToStaticMarkup(
      React.createElement(SmartDocPipelineStepper, {
        stages: [
          {
            id: "draft",
            label: "起草",
            icon: PenTool,
            desc: "辅助起草公文内容",
          },
          {
            id: "review",
            label: "审查优化",
            icon: ShieldAlert,
            desc: "检查正文质量",
          },
          {
            id: "format",
            label: "格式化",
            icon: Settings2,
            desc: "规范排版格式",
          },
        ],
        activeStageIndex: 1,
        completedStages: new Set([0]),
        onSelectStage: noop,
      }),
    );

    expect(html).toContain("起草");
    expect(html).toContain("审查优化");
    expect(html).toContain("格式化");
    expect(html).toContain("辅助起草公文内容");
    expect(html).toContain("检查正文质量");
  });

  it("renders import panel for uploaded file and loading state", () => {
    const uploadedHtml = renderToStaticMarkup(
      React.createElement(SmartDocImportPanel, {
        uploadedFile: {
          name: "专项请示.docx",
          size: 20480,
        } as File,
        isDragOver: false,
        isProcessing: false,
        onDragOver: noop,
        onDragLeave: noop,
        onDrop: noop,
        onFileUpload: noop,
        onImport: noop,
      }),
    );

    const loadingHtml = renderToStaticMarkup(
      React.createElement(SmartDocImportPanel, {
        uploadedFile: null,
        isDragOver: true,
        isProcessing: true,
        onDragOver: noop,
        onDragLeave: noop,
        onDrop: noop,
        onFileUpload: noop,
        onImport: noop,
      }),
    );

    expect(uploadedHtml).toContain("导入公文");
    expect(uploadedHtml).toContain("专项请示.docx");
    expect(uploadedHtml).toContain("20.0 KB - 点击更换");
    expect(uploadedHtml).toContain("导入文档");
    expect(loadingHtml).toContain("正在导入...");
  });
});
