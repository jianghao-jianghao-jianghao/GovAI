import React, {
  memo,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";

import {
  FileText,
  Sparkles,
  Save,
  BookOpen,
  PenTool,
  ShieldAlert,
  Loader2,
  Search,
  Plus,
  Trash2,
  X,
  MoreVertical,
  Edit3,
  Archive,
  CheckCircle,
  AlertTriangle,
  Settings2,
  Check,
  ArrowLeft,
  ArrowRight,
  Download,
  SkipForward,
  Eye,
  Send,
  MessageSquare,
  Undo2,
  Redo2,
  History,
  ChevronDown,
  Lightbulb,
  StopCircle,
  FilePlus,
  Upload,
} from "lucide-react";
import {
  apiListDocuments,
  apiGetDocument,
  apiCreateDocument,
  apiUpdateDocument,
  apiDeleteDocument,
  apiArchiveDocument,
  apiImportDocument,
  apiExportDocuments,
  apiDownloadDocumentSource,
  apiProcessDocument,
  apiListMaterials,
  apiCreateMaterial,
  apiDeleteMaterial,
  apiListCollections,
  apiListDocVersions,
  apiGetDocVersion,
  apiRestoreDocVersion,
  apiExportFormattedDocx,
  apiExportFormattedPdf,
  apiToggleDocVisibility,
  apiBatchDeleteDocuments,
  apiReleaseAiLock,
  DOC_STATUS_MAP,
  DOC_TYPE_MAP,
  SECURITY_MAP,
  VISIBILITY_MAP,
  URGENCY_MAP,
  type AppUser,
  type DocListItem,
  type DocDetail,
  type Material,
  type KBCollection,
  type KBFile,
  apiListFiles,
  type AiProcessChunk,
  type DocVersion,
  type FormatParams,
  type FormatStats,
  type KbReferenceItem,
  type ReviewResultState,
  type ReviewSuggestionItem,
  type FormatSuggestionItem,
  type FormatSuggestResult,
  apiListFormatPresets,
  apiCreateFormatPreset,
  apiUpdateFormatPreset,
  apiDeleteFormatPreset,
} from "../api";
import { EmptyState, useConfirm } from "../components/ui";
import {
  StructuredDocRenderer,
  type StructuredParagraph,
} from "../components/StructuredDocRenderer";
import { SmartDocAssistPanels } from "../components/SmartDocAssistPanels";
import { SmartDocAiStatusPanel } from "../components/SmartDocAiStatusPanel";
import { SmartDocDialogs } from "../components/SmartDocDialogs";
import {
  SmartDocEditorHeader,
  SmartDocEditorViewport,
} from "../components/SmartDocEditorPanel";
import { SmartDocHeader } from "../components/SmartDocHeader";
import { SmartDocImportPanel } from "../components/SmartDocImportPanel";
import { SmartDocOptimizeModal } from "../components/SmartDocOptimizeModal";
import {
  SmartDocPipelineStepper,
  type SmartDocPipelineStage,
} from "../components/SmartDocPipelineStepper";
import { SmartDocPresetManager } from "../components/SmartDocPresetManager";
import {
  SmartDocSidePanel,
  type SmartDocInstructionTemplate,
  type SmartDocNewMaterialDraft,
  type SmartDocNewTemplateDraft,
} from "../components/SmartDocSidePanel";
import {
  SMART_DOC_FORMAT_PRESET_CATEGORIES,
  createDefaultSmartDocPresetForm,
  type SmartDocFormatPreset,
  type SmartDocPresetForm,
} from "../components/smartDocPresetConfig";
import { useSmartDocAiFlow } from "../hooks/useSmartDocAiFlow";
import { normalizeAiStreamingResult } from "../hooks/smartDocAiFlowUtils";
import { sanitizeHtml } from "../utils/sanitize";

/* ── 常量 ── */
const DOC_TYPES = [
  { value: "", label: "格式类型：全部" },
  { value: "official", label: "公文标准" },
  { value: "academic", label: "学术论文" },
  { value: "legal", label: "法律文书" },
  { value: "school_notice_redhead", label: "高校红头请示" },
  { value: "custom", label: "自定义" },
];
const SECURITY_OPTS = [
  { value: "", label: "可见性：全部" },
  { value: "private", label: "私密" },
  { value: "public", label: "公开" },
];
const DOC_STATUS_OPTS = [
  { value: "", label: "状态：全部" },
  { value: "unfilled", label: "未补充" },
  { value: "draft", label: "草稿" },
  { value: "reviewed", label: "已审查" },
  { value: "formatted", label: "已格式化" },
  { value: "archived", label: "已归档" },
];

/* ── 流水线阶段定义 ── */
const PIPELINE_STAGES: readonly SmartDocPipelineStage[] = [
  {
    id: "draft",
    label: "起草",
    icon: PenTool,
    desc: "辅助起草公文内容",
    statusKey: "draft",
  },
  {
    id: "review",
    label: "审查优化",
    icon: ShieldAlert,
    desc: "错别字/语法/标点/措辞/敏感词/时效性/数据一致性检测与优化",
    statusKey: "reviewed",
  },
  {
    id: "format",
    label: "格式化",
    icon: Settings2,
    desc: "国标格式排版规范化",
    statusKey: "formatted",
  },
] as const;

const BUILTIN_FORMAT_PRESETS: SmartDocFormatPreset[] = [
  // ── 公文写作 ──
  {
    id: "fp-gbt",
    name: "GB/T公文标准",
    category: "公文写作",
    description: "党政机关公文格式国家标准",
    instruction:
      "GB/T 9704-2012 标准，标题二号方正小标宋体居中，正文三号仿宋，行距28磅",
    systemPrompt:
      "请严格按照 GB/T 9704-2012《党政机关公文格式》排版：标题用二号方正小标宋体居中，主送机关三号仿宋顶格，正文三号仿宋体、首行缩进2字符、行距28磅，一级标题三号黑体、二级标题三号楷体，成文日期右对齐用阿拉伯数字，页边距上3.7cm下3.5cm左2.8cm右2.6cm。",
    builtIn: true,
  },
  {
    id: "fp-redhead",
    name: "红头文件",
    category: "公文写作",
    description: "带红色机关标志的正式文件",
    instruction:
      "红头文件格式，发文机关标志红色居中，红色分隔线，标题红色二号方正小标宋体",
    systemPrompt:
      "请按红头文件格式排版：发文机关标志用红色二号方正小标宋体居中排列、上边缘至版心上边缘35mm，红色分隔线宽度与版心等宽，标题二号方正小标宋体居中红色，份号六位阿拉伯数字顶格，密级三号黑体顶格，正文三号仿宋体首行缩进2字符行距28磅，落款右对齐。",
    builtIn: true,
  },
  {
    id: "fp-school-redhead-request",
    name: "高校红头请示",
    category: "公文写作",
    description: "高校红头请示公文，带校名红色标题、版记线及承办单位信息",
    instruction:
      "高校红头请示格式，校名红色方正小标宋体居中加宽字距，标题二号方正小标宋体居中，正文三号仿宋首行缩进2字符",
    systemPrompt: `请按高校红头请示格式排版。每个段落输出为一个JSON对象，必须包含style_type和text字段。

## 段落类型及格式规范

| # | 内容 | style_type | font_family | font_size | color | alignment | indent |
|---|------|------------|-------------|-----------|-------|-----------|--------|
| 1 | 校名（发文机关标志，如"×××大学"） | title | 方正小标宋简体 | 32pt | #CC0000 | center | 0 |
| 2 | 文档标题（"关于×××的请示"） | subtitle | 方正小标宋简体 | 二号 | #000000 | center | 0 |
| 3 | 主送单位（"×××部：""×××厅："） | recipient | 仿宋_GB2312 | 三号 | #000000 | left | 0 |
| 4 | 正文段落 | body | 仿宋_GB2312 | 三号 | #000000 | justify | 2em |
| 5 | 一级标题（一、二、三、） | heading1 | 黑体 | 三号 | #000000 | left | 2em |
| 6 | 二级标题（（一）（二）） | heading2 | 楷体_GB2312 | 三号 | #000000 | left | 2em |
| 7 | 三级标题（1. 2. 3.） | heading3 | 仿宋_GB2312 | 三号 | #000000 | left | 2em |
| 8 | 结束语（"妥否，请批示。"） | closing | 仿宋_GB2312 | 三号 | #000000 | left | 2em |
| 9 | 署名（落款单位名称） | signature | 仿宋_GB2312 | 三号 | #000000 | right | 0 |
| 10 | 日期（2026年X月X日） | date | 仿宋_GB2312 | 三号 | #000000 | right | 0 |
| 11 | 版记区（承办单位/联系人/电话） | attachment | 仿宋_GB2312 | 四号 | #000000 | left | 0 |

## 关键规则
- title 必须设 red_line=true, letter_spacing="0.6em"
- 校名（title）是红色的发文机关标志，与文档标题（subtitle）是两个不同段落，校名不含"关于"二字
- 版记区内容全部用 style_type="attachment"，系统自动在第一个attachment上方和最后一个下方渲染横线
- 版记区只写一行：承办单位+联系人+电话合并为一行，如："承办单位：安全管理处综合科 联系人：张XX 电话：010-XXXXXXX"
- 不要输出"抄送"、"印发"、"（版记区）"、"（此页无正文）"等内容`,
    builtIn: true,
  },
  {
    id: "fp-notice",
    name: "通知",
    category: "公文写作",
    description: "关于某项工作的正式通知",
    instruction:
      "通知类公文，标题「关于…的通知」，三号仿宋，首行缩进，行距28磅",
    systemPrompt:
      "这是一份通知类公文，请按GB/T 9704公文标准排版：标题「关于…的通知」用二号方正小标宋体居中，主送机关三号仿宋顶格，正文三号仿宋首行缩进2字符行距28磅，事项编号用（一）（二）三号楷体加粗，附件列表在正文后空一行标注，落款右对齐。",
    builtIn: true,
  },
  {
    id: "fp-request",
    name: "请示",
    category: "公文写作",
    description: "向上级请求批准事项",
    instruction:
      "请示类公文 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      '这是一份请示类公文，请按公文标准排版：标题「关于…的请示」用二号方正小标宋体居中，正文三号仿宋体首行缩进2字符行距28磅，说明请示事由、请示内容、请求事项，结尾用"当否，请批示"，落款右对齐，每份请示只写一件事。',
    builtIn: true,
  },
  {
    id: "fp-report",
    name: "报告",
    category: "公文写作",
    description: "向上级汇报工作、反映情况",
    instruction:
      "报告类公文 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份报告类公文，请按公文标准排版：标题「关于…的报告」用二号方正小标宋体居中，正文三号仿宋体首行缩进2字符行距28磅，包含情况说明、问题分析、下步措施，结尾不写请批示字样，落款右对齐。",
    builtIn: true,
  },
  {
    id: "fp-reply",
    name: "批复",
    category: "公文写作",
    description: "答复下级请示事项",
    instruction:
      "批复类公文 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      '这是一份批复类公文，请按公文标准排版：标题「关于…的批复」用二号方正小标宋体居中，开头写"你单位…请示收悉"，正文三号仿宋体首行缩进2字符行距28磅，明确批复意见，语言简洁明确，结尾可写"此复"，落款右对齐。',
    builtIn: true,
  },
  {
    id: "fp-letter",
    name: "函件",
    category: "公文写作",
    description: "平行机关间往来公文",
    instruction:
      "函件类公文 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      '这是一份函件类公文，请按公文标准排版：标题「关于…的函」或「关于…的复函」用二号方正小标宋体居中，正文三号仿宋体首行缩进2字符行距28磅，说明发函目的和请求/答复内容，语气平和正式，结尾可写"请函复"或"特此函达"，落款右对齐。',
    builtIn: true,
  },
  // ── 日常办公 ──
  {
    id: "fp-email",
    name: "工作邮件",
    category: "日常办公",
    description: "正式工作往来邮件",
    instruction: "工作邮件 | 正文四号宋体分段，行距1.5倍，称谓顶格，结尾致谢",
    systemPrompt:
      '这是一封正式工作邮件，请按邮件格式排版：主题明确简短，称谓顶格（如"尊敬的XXX："），正文四号宋体分段，语言简洁专业，结尾礼貌致谢，落款含姓名/日期/联系方式，行距1.5倍。',
    builtIn: true,
  },
  {
    id: "fp-leave",
    name: "请假申请",
    category: "日常办公",
    description: "员工请假申请书",
    instruction: "请假申请 | 标题三号黑体居中，正文四号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份请假申请，请按申请书格式排版：标题「请假申请书」用三号黑体居中，称谓顶格，正文四号仿宋体首行缩进2字符行距28磅，说明请假事由、请假时间、起止日期，请求批准，落款含申请人姓名和日期右对齐。",
    builtIn: true,
  },
  {
    id: "fp-handover",
    name: "工作交接文档",
    category: "日常办公",
    description: "岗位工作交接说明",
    instruction: "工作交接 | 标题三号黑体居中，正文四号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份工作交接文档，请按交接文档格式排版：标题三号黑体居中，分章节说明岗位职责、在手工作清单、重要事项说明、交接注意事项，正文四号仿宋体首行缩进2字符行距28磅，表格与正文结合，末页留交接双方签字栏。",
    builtIn: true,
  },
  {
    id: "fp-invitation",
    name: "邀请函",
    category: "日常办公",
    description: "正式活动邀请函",
    instruction: "邀请函 | 标题二号黑体居中，正文四号宋体首行缩进，行距1.5倍",
    systemPrompt:
      "这是一份邀请函，请按邀请函格式排版：标题「邀请函」用二号黑体居中，称谓顶格，正文四号宋体首行缩进2字符行距1.5倍，说明活动名称、时间、地点、流程，语气热情诚恳，结尾期待莅临，落款含主办单位和日期右对齐。",
    builtIn: true,
  },
  // ── 会议管理 ──
  {
    id: "fp-meeting-notice",
    name: "会议通知",
    category: "会议管理",
    description: "召开会议的正式通知",
    instruction:
      "会议通知 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份会议通知，请按通知格式排版：标题「关于召开…会议的通知」用二号方正小标宋体居中，正文三号仿宋体首行缩进2字符行距28磅，依次列明会议时间、地点、参会人员、会议议程、注意事项，语言简洁，附件说明准备材料，落款右对齐。",
    builtIn: true,
  },
  {
    id: "fp-minutes",
    name: "会议纪要",
    category: "会议管理",
    description: "会议内容正式记录与决议",
    instruction: "纪要格式，二号方正小标宋体标题，议题编号，决议加粗",
    systemPrompt:
      "这是一份会议纪要，请按纪要格式排版：标题「…会议纪要」二号方正小标宋体居中，会议基本信息（时间/地点/主持人/出席人）用三号仿宋列表排列，正文三号仿宋体首行缩进2字符行距28磅，议题用一、二、三编号加三号黑体标注，决议事项加粗，末页留主持人签字栏。",
    builtIn: true,
  },
  {
    id: "fp-agenda",
    name: "会议议程",
    category: "会议管理",
    description: "会议议程安排表",
    instruction: "会议议程 | 标题三号黑体居中，正文四号仿宋，表格形式布局",
    systemPrompt:
      "这是一份会议议程，请按议程格式排版：标题「…会议议程」用三号黑体居中，采用表格形式列明序号、时间段、议题内容、主讲/主持人，正文四号仿宋体，表格线条规范清晰，便于与会者一目了然。",
    builtIn: true,
  },
  // ── 工作汇报 ──
  {
    id: "fp-summary",
    name: "工作总结",
    category: "工作汇报",
    description: "阶段性工作总结报告",
    instruction: "工作总结 | 标题三号黑体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份工作总结，请按报告格式排版：标题「…工作总结」用三号黑体居中，分节汇报主要工作成绩（用一、二、三编号）、存在的问题与不足、下阶段工作计划，一级标题三号黑体，正文三号仿宋首行缩进2字符行距28磅。",
    builtIn: true,
  },
  {
    id: "fp-plan",
    name: "工作计划",
    category: "工作汇报",
    description: "阶段性工作计划安排",
    instruction: "工作计划 | 标题三号黑体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份工作计划，请按计划书格式排版：标题「…工作计划」用三号黑体居中，分节列明指导思想、工作目标、重点任务（含责任人/完成时限）、保障措施，一级标题三号黑体，正文三号仿宋体首行缩进2字符行距28磅，条目清晰，可配合表格使用。",
    builtIn: true,
  },
  {
    id: "fp-debrief",
    name: "述职报告",
    category: "工作汇报",
    description: "个人述职报告",
    instruction: "述职报告 | 标题三号黑体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份述职报告，请按述职报告格式排版：标题「述职报告」用三号黑体居中，开篇简介岗位职责，正文三号仿宋体首行缩进2字符行距28磅，分节汇报：主要工作业绩、履职情况、存在问题、努力方向，语言真实客观，落款含姓名和日期右对齐。",
    builtIn: true,
  },
  {
    id: "fp-briefing",
    name: "汇报材料",
    category: "工作汇报",
    description: "专项工作情况汇报",
    instruction: "汇报材料 | 标题三号黑体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份汇报材料，请按汇报格式排版：标题用三号黑体居中简洁，结构分为基本情况、主要做法与成效、存在问题、下步打算四部分，一级标题三号黑体加粗，正文三号仿宋体首行缩进2字符行距28磅，数据用表格展示，语言简洁精炼。",
    builtIn: true,
  },
  // ── 项目管理 ──
  {
    id: "fp-taskbook",
    name: "项目任务书",
    category: "项目管理",
    description: "项目任务分解与说明",
    instruction: "任务书 | 标题三号黑体居中，正文四号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份项目任务书，请按任务书格式排版：标题「…项目任务书」用三号黑体居中，包含项目概况、任务目标、工作内容、进度计划（甘特图表格）、成果要求、责任分工，章节编号清晰（一、(一)、1.），正文四号仿宋体首行缩进2字符行距28磅，表格规范。",
    builtIn: true,
  },
  {
    id: "fp-scheme",
    name: "建设方案",
    category: "项目管理",
    description: "项目建设方案文档",
    instruction: "建设方案 | 标题三号黑体居中，正文四号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份建设方案，请按方案文档格式排版：标题「…建设方案」用三号黑体居中，分章节：建设背景与必要性、建设目标、建设内容与技术路线、实施计划、预算估算、保障措施，层级编号规范（一、(一)、1.），正文四号仿宋体首行缩进2字符行距28磅。",
    builtIn: true,
  },
  {
    id: "fp-proposal",
    name: "立项报告",
    category: "项目管理",
    description: "项目立项申请报告",
    instruction:
      "立项报告 | 标题二号方正小标宋体居中，正文三号仿宋首行缩进，行距28磅",
    systemPrompt:
      "这是一份立项报告，请按立项报告格式排版：标题「关于…项目立项的报告」用二号方正小标宋体居中，正文三号仿宋体首行缩进2字符行距28磅，包含立项背景、项目目标、实施内容、预期成果、资金需求、风险分析，论证充分，结尾请求批准立项。",
    builtIn: true,
  },
  {
    id: "fp-feasibility",
    name: "可行性研究报告",
    category: "项目管理",
    description: "项目可行性分析报告",
    instruction: "可行性报告 | 正文四号仿宋首行缩进，行距28磅，层级编号规范",
    systemPrompt:
      "这是一份可行性研究报告，请按可行性报告格式排版：封面含项目名称/单位/日期，目录，正文包含概述、市场/需求分析、技术方案、实施方案、投资估算与效益分析、结论建议，章节层级清晰（一、(一)、1.），正文四号仿宋体首行缩进2字符行距28磅。",
    builtIn: true,
  },
  // ── 排版格式 ──
  {
    id: "fp-academic",
    name: "学术论文格式",
    category: "排版格式",
    description: "学术期刊投稿或学位论文",
    instruction: "学术论文排版，标题三号黑体，正文五号宋体，1.5倍行距",
    systemPrompt:
      "请按学术论文标准排版：标题三号黑体居中，作者信息小四号宋体居中，摘要/关键词五号楷体带标签加粗，正文五号宋体首行缩进2字符行距1.5倍，一级标题四号黑体、二级标题小四号黑体，参考文献小五号宋体悬挂缩进。",
    builtIn: true,
  },
  {
    id: "fp-legal",
    name: "法律文书",
    category: "排版格式",
    description: "法院判决书、律师函等",
    instruction: "法律文书排版，标题二号宋体加粗，正文四号仿宋，行距28磅",
    systemPrompt:
      "请按法律文书格式排版：标题二号宋体加粗居中，案号小四号宋体居中，当事人信息四号仿宋体，正文四号仿宋体首行缩进2字符行距28磅，法条引用加粗标注，结论性段落加粗，落款右对齐四号仿宋。",
    builtIn: true,
  },
  {
    id: "fp-notify",
    name: "通知/通报格式",
    category: "排版格式",
    description: "内部通知、通报类文件",
    instruction: "通知/通报排版，标题二号方正小标宋体居中，正文三号仿宋",
    systemPrompt:
      '请按通知格式排版：标题用二号方正小标宋体居中（含"关于…的通知"），主送单位三号仿宋顶格后加冒号，正文三号仿宋首行缩进2字符行距28磅，事项编号用（一）（二）三号楷体加粗，附件列表在正文后空一行标注，落款右对齐。',
    builtIn: true,
  },
  {
    id: "fp-project-proposal",
    name: "项目建议书",
    category: "排版格式",
    description: "项目建议书标准排版格式",
    instruction:
      "项目建议书排版 | A4纸，标题黑体三号居中，正文仿宋四号首行缩进2字符，行距25磅固定值",
    systemPrompt:
      "请严格按照项目建议书格式排版：A4纸，页边距上下2.5cm、左右2.6cm，页眉1.5cm，页脚2.0cm。标题用黑体三号居中，一级标题用楷体三号（编号：一、二、三），二级标题用仿宋_GB2312四号加粗（编号：（一）（二）（三）），三级标题用仿宋_GB2312四号加粗（编号：1、2、3），四级标题编号：1.1、1.2，五级：1.1.1、1.1.2，六级（1）（2），七级①②③。正文用仿宋_GB2312小四号，首行缩进2字符，行距25磅固定值。目录页码格式—I—/—II—，正文页码格式— 1 —/— 2 —，页码字体Times New Roman。",
    builtIn: true,
  },
  {
    id: "fp-lab-fund",
    name: "重点实验室基金指南",
    category: "排版格式",
    description: "重点实验室基金课题申报指南格式",
    instruction:
      "基金指南排版 | 标题方正小标宋简体二号居中单倍行距，正文仿宋四号首行缩进2字符，行距26磅固定值",
    systemPrompt:
      "请严格按照重点实验室基金指南格式排版：标题用方正小标宋简体二号居中、单倍行距。一级标题用黑体四号、首行缩进2字符、行距26磅固定值。正文用仿宋_GB2312四号、首行缩进2字符、行距26磅固定值。文档结构应包含以下章节：基金指南名称、申报人信息、需求背景、研究目标、研究内容、主要指标、成果形式、创新点、项目类型。各章节标题统一用黑体四号加粗。",
    builtIn: true,
  },
];

const FORMAT_PRESETS_STORAGE_KEY = "govai-format-presets-custom";
/* ── 常用指令模板（按阶段分组） ── */
interface InstructionTemplate {
  id: string;
  stage: "draft" | "review" | "format" | "all";
  label: string;
  content: string;
  builtIn: boolean;
}

const BUILTIN_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
  // ── 起草阶段 ──
  {
    id: "d1",
    stage: "draft",
    label: "通知类公文",
    content:
      "请起草一份关于加强安全生产管理工作的通知，要求各部门落实安全责任制，定期开展隐患排查。",
    builtIn: true,
  },
  {
    id: "d2",
    stage: "draft",
    label: "请示类公文",
    content:
      "请起草一份关于申请购置办公设备的请示，说明现有设备老化影响工作效率，需要更新升级。",
    builtIn: true,
  },
  {
    id: "d3",
    stage: "draft",
    label: "会议纪要",
    content:
      "请根据以下要点起草会议纪要：会议讨论了年度工作计划，审议了预算方案，部署了下阶段重点任务。",
    builtIn: true,
  },
  {
    id: "d4",
    stage: "draft",
    label: "工作报告",
    content:
      "请起草一份季度工作总结报告，包含主要工作成绩、存在问题和下一步计划。",
    builtIn: true,
  },
  {
    id: "d5",
    stage: "draft",
    label: "批复类公文",
    content: "请起草一份关于同意开展试点工作的批复，明确试点范围、时限和要求。",
    builtIn: true,
  },
  // ── 审查优化阶段 ──
  {
    id: "r1",
    stage: "review",
    label: "全面审查",
    content:
      "请全面检查本文的错别字、标点符号、语法错误，检查引用的政策法规是否过时，数据前后是否一致，并检查用语是否规范，提出修改建议。",
    builtIn: true,
  },
  {
    id: "r2",
    stage: "review",
    label: "重点检查错别字",
    content: "请重点检查文中的错别字和同音字混用问题，逐段标注并给出修改建议。",
    builtIn: true,
  },
  {
    id: "r3",
    stage: "review",
    label: "政策合规审查",
    content:
      "请检查本文引用的政策法规是否准确、条款编号是否正确，以及表述是否与最新政策一致。",
    builtIn: true,
  },
  {
    id: "r4",
    stage: "review",
    label: "敏感词与措辞审查",
    content:
      "请检查文中是否有不当措辞、敏感表述或不符合公文行文规范的口语化表达，并给出优化建议。",
    builtIn: true,
  },
  {
    id: "r5",
    stage: "review",
    label: "逻辑与结构审查",
    content:
      "请审查本文的逻辑结构是否清晰，段落衔接是否合理，论证是否充分，提出结构优化建议。",
    builtIn: true,
  },
  // ── 格式化阶段 ──
  {
    id: "f1",
    stage: "format",
    label: "公文标准排版",
    content:
      "请按 GB/T 9704 公文标准排版：标题二号方正小标宋体居中，正文三号仿宋体，一级标题三号黑体，首行缩进2字符，行距28磅。",
    builtIn: true,
  },
  {
    id: "f2",
    stage: "format",
    label: "红头文件排版",
    content:
      "请按红头文件格式排版，标题红色加粗居中，发文字号置于红线下方居中，正文三号仿宋体。",
    builtIn: true,
  },
  {
    id: "f3",
    stage: "format",
    label: "会议纪要排版",
    content:
      "请按会议纪要格式排版：标题居中用黑体，出席人员信息列表排列，议题编号用一、二、三标注。",
    builtIn: true,
  },
  {
    id: "f4",
    stage: "format",
    label: "简洁版面排版",
    content:
      "请使用简洁版面排版：正文四号宋体，标题三号黑体居中，段间距适中，首行缩进2字符。",
    builtIn: true,
  },
  {
    id: "f5",
    stage: "format",
    label: "学术论文排版",
    content:
      "请按学术论文格式排版：标题三号黑体居中，摘要五号楷体，正文五号宋体，参考文献小五号宋体。",
    builtIn: true,
  },
  {
    id: "f6",
    stage: "format",
    label: "项目建议书排版",
    content:
      "请按项目建议书格式排版：A4幅面，上下页边距2.5cm，左右2.6cm，页眉1.5cm，页脚2.0cm。行间距固定值25磅，首行缩进2字符。一级标题黑体三号，二级标题楷体三号，三四级标题仿宋_GB2312四号加粗，正文仿宋_GB2312小四号。编号次序：二→（二）→2→2.1→2.1.1→（1）→①。页码：目录—I—、—II—，正文— 1 —、— 2 —，字体Times New Roman。图表编号：章节-序号（如图3-3、表2-2）。",
    builtIn: true,
  },
  {
    id: "f7",
    stage: "format",
    label: "重点实验室基金指南",
    content:
      "请按重点实验室基金指南格式排版：标题方正小标宋简体二号居中单倍行距，一级标题黑体四号首行缩进2字符行间距固定值26磅，正文仿宋_GB2312四号首行缩进2字符行间距固定值26磅。内容结构包括：基金指南名称、申报人信息、需求背景、研究目标、研究内容、主要指标、成果形式、创新点、项目类型（一般基金课题/拓展提高课题）。",
    builtIn: true,
  },
];

const INSTRUCTION_TEMPLATES_STORAGE_KEY = "govai-instruction-templates-custom";

function loadCustomTemplates(): InstructionTemplate[] {
  try {
    const raw = localStorage.getItem(INSTRUCTION_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: InstructionTemplate[]) {
  localStorage.setItem(
    INSTRUCTION_TEMPLATES_STORAGE_KEY,
    JSON.stringify(templates),
  );
}

function loadCustomPresetsFromStorage(): SmartDocFormatPreset[] {
  try {
    const raw = localStorage.getItem(FORMAT_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCustomPresetsToStorage(presets: SmartDocFormatPreset[]) {
  localStorage.setItem(FORMAT_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

/* 从文档状态推断已完成的流水线阶段 */
const inferCompletedStages = (status: string): Set<number> => {
  const completed = new Set<number>();
  const statusOrder = ["draft", "reviewed", "formatted", "archived"];
  const idx = statusOrder.indexOf(status);
  // archived means all done
  if (status === "archived") {
    for (let i = 0; i < 3; i++) completed.add(i);
    return completed;
  }
  // 兼容旧状态
  if (status === "checked" || status === "optimized") {
    completed.add(0);
    completed.add(1);
    return completed;
  }
  for (let i = 0; i < Math.min(idx + 1, 3); i++) completed.add(i);
  return completed;
};

/* 推断下一个待处理阶段 */
const inferNextStage = (status: string): number => {
  switch (status) {
    case "draft":
      return 1; // next = review
    case "reviewed":
    case "checked":
    case "optimized":
      return 2; // next = format
    case "formatted":
    case "archived":
      return 2; // stay at format or done
    default:
      return 0; // start from draft
  }
};

const statusCls = (s: string) => {
  switch (s) {
    case "archived":
      return "bg-green-100 text-green-700";
    case "draft":
    case "unfilled":
      return "bg-yellow-100 text-yellow-700";
    case "filled":
      return "bg-purple-100 text-purple-700";
    case "formatted":
      return "bg-emerald-100 text-emerald-700";
    case "checked":
      return "bg-cyan-100 text-cyan-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
};

/* ── Markdown → HTML 渲染 ── */
/* plain=false (默认): GB/T 9704-2012 公文标准样式（大字号、黑体、楷体等）
 * plain=true:  普通文档阅读样式（适中字号、系统默认字体）
 *   → 用于起草、审核、优化等"只关注内容"的阶段 */
function markdownToHtml(md: string, plain = false): string {
  if (!md) return "";
  let html = md;

  if (plain) {
    // ── 普通模式：适中字号，默认字体 ──
    html = html.replace(
      /^(#{1})\s+(.+)$/gm,
      '<h1 style="font-size:18px;text-align:center;font-weight:600;color:#1a1a1a;line-height:1.6;margin:12px 0 8px">$2</h1>',
    );
    html = html.replace(
      /^(#{2})\s+(.+)$/gm,
      '<h2 style="font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.6;margin:10px 0 6px;text-indent:2em">$2</h2>',
    );
    html = html.replace(
      /^(#{3,6})\s+(.+)$/gm,
      '<h3 style="font-size:15px;font-weight:600;color:#1a1a1a;line-height:1.6;margin:8px 0 4px;text-indent:2em">$2</h3>',
    );
  } else {
    // ── GB/T 公文标准模式 ──
    html = html.replace(
      /^(#{1})\s+(.+)$/gm,
      "<h1 style=\"font-size:22pt;font-family:'方正小标宋简体',FangSong,STFangsong,serif;text-align:center;font-weight:normal;color:#1a1a1a;line-height:28pt;margin:16px 0 12px\">$2</h1>",
    );
    html = html.replace(
      /^(#{2})\s+(.+)$/gm,
      "<h2 style=\"font-size:16pt;font-family:SimHei,'黑体',sans-serif;font-weight:normal;color:#1a1a1a;line-height:28pt;margin:14px 0 8px;text-indent:2em\">$2</h2>",
    );
    html = html.replace(
      /^(#{3})\s+(.+)$/gm,
      "<h3 style=\"font-size:16pt;font-family:KaiTi,'楷体_GB2312','楷体',serif;font-weight:normal;color:#1a1a1a;line-height:28pt;margin:12px 0 6px;text-indent:2em\">$2</h3>",
    );
    html = html.replace(
      /^(#{4})\s+(.+)$/gm,
      "<h4 style=\"font-size:16pt;font-family:FangSong,'仿宋_GB2312',STFangsong,serif;font-weight:bold;color:#1a1a1a;line-height:28pt;margin:10px 0 4px;text-indent:2em\">$2</h4>",
    );
    html = html.replace(
      /^(#{5,6})\s+(.+)$/gm,
      "<h5 style=\"font-size:16pt;font-family:FangSong,'仿宋_GB2312',STFangsong,serif;font-weight:normal;color:#1a1a1a;line-height:28pt;margin:8px 0 4px;text-indent:2em\">$2</h5>",
    );
  }

  // 加粗 + 斜体 (***text***)
  html = html.replace(
    /\*\*\*([^\n*]+?)\*\*\*/g,
    '<strong style="font-weight:bold"><em style="font-style:italic">$1</em></strong>',
  );
  // 加粗 (**text**)
  html = html.replace(
    /\*\*([^\n*]+?)\*\*/g,
    '<strong style="font-weight:bold;color:#1a1a1a">$1</strong>',
  );
  // 斜体 (*text*) — 排除已处理的 <strong> 标签内的 *
  html = html.replace(
    /(?<!\*)\*([^\n*]+?)\*(?!\*)/g,
    '<em style="font-style:italic;color:#333">$1</em>',
  );

  // 删除线 — 不跨行
  html = html.replace(
    /~~([^\n~]+?)~~/g,
    '<del style="text-decoration:line-through;color:#999">$1</del>',
  );

  // 行内代码 — 不跨行、不贪婪
  html = html.replace(
    /`([^\n`]+?)`/g,
    '<code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;font-size:0.9em;color:#d63384;font-family:Consolas,monospace">$1</code>',
  );

  // 表格
  const tblFont = plain
    ? "font-size:14px;font-family:inherit"
    : "font-size:12pt;font-family:FangSong,'仿宋_GB2312',STFangsong,serif;line-height:22pt";
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split("|").filter((c) => c.trim() !== "");
    if (cells.every((c) => /^[\s:-]+$/.test(c))) return "<!--sep-->";
    return cells
      .map(
        (c) =>
          `<td style="border:1px solid #999;padding:6px 10px;${tblFont}">${c.trim()}</td>`,
      )
      .join("");
  });
  // Wrap table rows
  html = html.replace(/(<td[^>]*>.*?<\/td>\s*)+/g, (m) => `<tr>${m}</tr>`);
  html = html.replace(/<!--sep-->\s*/g, "");
  // Wrap consecutive tr in table
  html = html.replace(
    /(<tr>[\s\S]*?<\/tr>\s*)+/g,
    (m) =>
      `<table style="border-collapse:collapse;width:100%;margin:12px 0;${plain ? "font-size:14px" : "font-size:12pt"}">${m}</table>`,
  );

  // 无序列表
  const liFont = plain
    ? "font-size:14px;line-height:1.8;margin-left:2em;list-style-type:disc"
    : "font-size:12pt;line-height:1.8;margin-left:2em;list-style-type:disc;font-family:FangSong,STFangsong,serif";
  html = html.replace(/^[\-\*]\s+(.+)$/gm, `<li style="${liFont}">$1</li>`);

  // 有序列表
  const oliFont = plain
    ? "font-size:14px;line-height:1.8;margin-left:2em;list-style-type:decimal"
    : "font-size:12pt;line-height:1.8;margin-left:2em;list-style-type:decimal;font-family:FangSong,STFangsong,serif";
  html = html.replace(/^\d+\.\s+(.+)$/gm, `<li style="${oliFont}">$1</li>`);

  // 引用块
  html = html.replace(
    /^>\s+(.+)$/gm,
    `<blockquote style="border-left:4px solid #3b82f6;padding:8px 16px;margin:8px 0;background:#eff6ff;color:#1e40af;${plain ? "font-size:14px" : "font-size:12pt"}">$1</blockquote>`,
  );

  // 水平线
  html = html.replace(
    /^[-*_]{3,}$/gm,
    '<hr style="border:none;border-top:1px solid #d1d5db;margin:16px 0"/>',
  );

  // 段落
  if (plain) {
    html = html.replace(
      /^(?!<[hbltuod]|<\/|<code|<strong|<em|<del|<!--)([\S].*)/gm,
      '<p style="font-size:14px;line-height:1.8;text-indent:2em;color:#1a1a1a;margin:4px 0;text-align:justify">$1</p>',
    );
    // plain 模式不对"一、"等做特殊字体处理
  } else {
    html = html.replace(
      /^(?!<[hbltuod]|<\/|<code|<strong|<em|<del|<!--)([\S].*)/gm,
      "<p style=\"font-size:16pt;font-family:FangSong,'仿宋_GB2312',STFangsong,serif;line-height:28pt;text-indent:2em;color:#1a1a1a;margin:4px 0;text-align:justify\">$1</p>",
    );
    // 公文特殊段落检测：以"一、"开头 → 黑体
    html = html.replace(
      /<p([^>]*)>([一二三四五六七八九十]+、[^<]*)<\/p>/g,
      "<p style=\"font-size:16pt;font-family:SimHei,'黑体',sans-serif;line-height:28pt;text-indent:2em;color:#1a1a1a;margin:8px 0;font-weight:normal\">$2</p>",
    );
    // 以"（一）"开头 → 楷体
    html = html.replace(
      /<p([^>]*)>(（[一二三四五六七八九十]+）[^<]*)<\/p>/g,
      "<p style=\"font-size:16pt;font-family:KaiTi,'楷体_GB2312','楷体',serif;line-height:28pt;text-indent:2em;color:#1a1a1a;margin:6px 0;font-weight:normal\">$2</p>",
    );
    // 以"1."或"1、"开头 → 仿宋加粗
    html = html.replace(
      /<p([^>]*)>(\d+[.、][^<]*)<\/p>/g,
      "<p style=\"font-size:16pt;font-family:FangSong,'仿宋_GB2312',STFangsong,serif;line-height:28pt;text-indent:2em;color:#1a1a1a;margin:4px 0;font-weight:bold\">$2</p>",
    );
  }

  return html;
}

/* ── 富文本渲染器组件 ── */
/* plain=true: 普通阅读样式（起草/审核/优化阶段）
 * plain=false: GB/T 9704-2012 公文标准排版（格式化阶段 / 预览） */
type SmartDocViewToast = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

type HookToastLike = {
  (message: string, options?: { duration?: number }): void;
  success: (message: string, options?: { duration?: number }) => void;
  error: (message: string, options?: { duration?: number }) => void;
  info: (message: string, options?: { duration?: number }) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type DebouncedEditableElement = HTMLElement & {
  _debounceTimer?: ReturnType<typeof setTimeout>;
};

const getErrorMessage = (error: unknown, fallback = "未知错误"): string => {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return fallback;
};

const RichContentRenderer = memo(
  ({
    content,
    className = "",
    plain = false,
  }: {
    content: string;
    className?: string;
    plain?: boolean;
  }) => {
    // ── 安全网：如果 content 是 JSON，提取文本而非原样渲染 ──
    const safeContent = useMemo(() => {
      const trimmed = content.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        // 尝试标准 JSON.parse
        try {
          const parsed = JSON.parse(trimmed);
          if (isRecord(parsed)) {
            const lines: string[] = [];
            if (Array.isArray(parsed.request_more)) {
              lines.push("**AI 需要更多信息来完成任务：**");
              parsed.request_more.forEach((item) => {
                if (typeof item === "string") lines.push(`- ${item}`);
              });
            }
            if (Array.isArray(parsed.paragraphs)) {
              parsed.paragraphs.forEach((p) => {
                if (typeof p === "string" && p.trim()) lines.push(p);
                else if (isRecord(p) && typeof p.text === "string")
                  lines.push(p.text);
              });
            }
            if (typeof parsed.message === "string") {
              lines.push(parsed.message);
            }
            if (lines.length > 0) return lines.join("\n\n");
            return "AI 返回了空结果，请尝试提供更详细的指令。";
          }
        } catch {
          // JSON.parse 失败 → 使用正则 fallback 提取 "text": "..." 值
          const textMatches = trimmed.matchAll(
            /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
          );
          const extractedLines: string[] = [];
          for (const m of textMatches) {
            const val = m[1]
              .replace(/\\n/g, "\n")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");
            if (val.trim()) extractedLines.push(val.trim());
          }
          if (extractedLines.length > 0) return extractedLines.join("\n");
        }
      }
      return content;
    }, [content]);

    const html = useMemo(
      () => markdownToHtml(safeContent, plain),
      [safeContent, plain],
    );
    const sanitizedHtml = useMemo(() => sanitizeHtml(html), [html]);
    return (
      <div
        className={`rich-doc-content ${className}`}
        style={
          plain
            ? {
                fontSize: "14px",
                lineHeight: "1.8",
                color: "#1a1a1a",
                textAlign: "justify" as const,
              }
            : {
                fontFamily: "FangSong, '仿宋_GB2312', STFangsong, serif",
                fontSize: "16pt",
                lineHeight: "28pt",
                color: "#1a1a1a",
                textAlign: "justify" as const,
              }
        }
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  },
);

const paragraphsToText = (
  paragraphs?: Array<Pick<StructuredParagraph, "text" | "_change">> | null,
): string => {
  if (!paragraphs || !Array.isArray(paragraphs)) return "";
  return paragraphs
    .filter(
      (p) =>
        p &&
        p._change !== "deleted" &&
        (p.text ?? "").toString().trim().length > 0,
    )
    .map((p) => (p.text ?? "").toString().trim())
    .join("\n\n");
};

const parseFormattedParagraphs = (
  raw?: string | null,
): StructuredParagraph[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const paragraphList = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.paragraphs)
        ? parsed.paragraphs
        : [];
    return paragraphList
      .map((item) => {
        if (typeof item === "string") {
          const text = item.trim();
          return text ? { text, style_type: "body" } : null;
        }
        if (!isRecord(item) || typeof item.text !== "string") return null;
        const text = item.text.trim();
        if (!text) return null;
        return {
          ...(item as Partial<StructuredParagraph>),
          text,
          style_type:
            typeof item.style_type === "string" ? item.style_type : "body",
        } as StructuredParagraph;
      })
      .filter(Boolean) as StructuredParagraph[];
  } catch {
    return [];
  }
};

const withParagraphContent = <T extends { content?: string | null }>(
  doc: T,
  paragraphs: StructuredParagraph[],
): T => {
  if ((doc.content || "").trim()) return doc;
  const derivedContent = paragraphsToText(paragraphs);
  return derivedContent ? ({ ...doc, content: derivedContent } as T) : doc;
};

// eslint-disable-next-line no-console
console.debug("[SmartDocView] build: 2.1.0-gen-guard");

export const SmartDocView = ({
  toast,
  currentUser,
}: {
  toast: SmartDocViewToast;
  currentUser: AppUser;
}) => {
  // [v2.1] 代际保护
  const canManageMaterial = currentUser?.permissions?.includes(
    "res:material:manage",
  );
  const canPublishDoc = currentUser?.permissions?.includes("app:doc:public");
  const { confirm, ConfirmDialog } = useConfirm();
  const [view, setView] = useState<"list" | "create">("list");

  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docScope, setDocScope] = useState<"mine" | "public">("mine");
  const [currentDoc, setCurrentDoc] = useState<DocDetail | null>(null);
  // 只读模式：非所有者查看公开公文时为只读
  const isReadOnly = !!(
    currentDoc && currentDoc.creator_id !== currentUser?.id
  );
  const editableContentHtml = useMemo(
    () =>
      sanitizeHtml(
        currentDoc?.content ||
          '<span class="text-gray-400">点击此处开始编辑公文内容…</span>',
      ),
    [currentDoc?.content],
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [processType, setProcessType] = useState("draft");
  const [isProcessing, setIsProcessing] = useState(false);

  // Filters (English values)
  const [filters, setFilters] = useState({
    keyword: "",
    startDate: "",
    endDate: "",
    type: "",
    security: "",
    status: "",
  });
  const [selectedDocIds, setSelectedDocIds] = useState(new Set<string>());
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Modals
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeTarget, setOptimizeTarget] = useState<DocListItem | null>(
    null,
  );
  const [kbCollections, setKbCollections] = useState<KBCollection[]>([]);
  const [selectedOptimizeKb, setSelectedOptimizeKb] = useState("");
  const [selectedDraftKbIds, setSelectedDraftKbIds] = useState<string[]>([]);
  const [expandedKbCollections, setExpandedKbCollections] = useState<
    Set<string>
  >(new Set());
  const [kbCollectionFiles, setKbCollectionFiles] = useState<
    Record<string, KBFile[]>
  >({});
  const [selectedKbFileIds, setSelectedKbFileIds] = useState<string[]>([]);
  const [loadingKbFiles, setLoadingKbFiles] = useState<Set<string>>(new Set());
  const [newDocType, setNewDocType] = useState("official");
  // 起草阶段：标题层级选择（0=纯正文无标题, 1=最多一级, ..., 4=四级, -1=不限制/默认）
  const [draftHeadingLevel, setDraftHeadingLevel] = useState(-1);

  // Editor State
  const [step, setStep] = useState(1);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(
    new Set(),
  );
  const [rightPanel, setRightPanel] = useState<string | null>(null);
  const [materialTab, setMaterialTab] = useState<"material" | "templates">(
    "templates",
  );
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matSearch, setMatSearch] = useState("");
  const [matCategory, setMatCategory] = useState("全部");
  const [reviewResult, setReviewResult] = useState<ReviewResultState | null>(
    null,
  );
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [newMat, setNewMat] = useState({
    title: "",
    category: "通用",
    content: "",
  });

  // 常用指令模板管理
  const [instructionTemplates, setInstructionTemplates] = useState<
    InstructionTemplate[]
  >(() => [...BUILTIN_INSTRUCTION_TEMPLATES, ...loadCustomTemplates()]);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    label: "",
    content: "",
    stage: "all" as InstructionTemplate["stage"],
  });

  // (编辑/预览已合并，不再需要切换状态)

  // 对话式 AI 处理
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiStreamingText, setAiStreamingText] = useState("");
  const [aiStructuredParagraphs, setAiStructuredParagraphs] = useState<
    StructuredParagraph[]
  >([]);
  const [acceptedParagraphs, setAcceptedParagraphs] = useState<
    StructuredParagraph[]
  >([]);
  // #20: 段落生命周期阶段，使状态流转显式化
  //   idle       → 无段落数据
  //   streaming  → AI 正在流式输出段落
  //   preview    → AI 输出完成，用户预览中（可接受/拒绝变更）
  //   accepted   → 用户已接受，段落在 acceptedParagraphs 中
  //   editing    → 用户正在编辑 accepted 段落
  //   saved      → 已保存到后端
  type ParagraphPhase =
    | "idle"
    | "streaming"
    | "preview"
    | "accepted"
    | "editing"
    | "saved";
  const [paragraphPhase, setParagraphPhase] = useState<ParagraphPhase>("idle");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiLockConflict, setAiLockConflict] = useState(false);
  const [formatStats, setFormatStats] = useState<FormatStats | null>(null);
  // #18: 大纲两步流程
  const [outlineText, setOutlineText] = useState("");
  const [showOutlinePanel, setShowOutlinePanel] = useState(false);
  const aiOutputRef = useRef<HTMLDivElement>(null);
  const needsMoreInfoRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  /** 代际 ID：每次切换文档 +1，旧的 SSE 回调检测到不匹配即静默丢弃（流在后台跑完不浪费 Dify 调用） */
  const _aiGenRef = useRef(0);

  // ── RAF 节流：流式文本累积在 ref 中，通过 requestAnimationFrame 批量 flush 到 state ──
  const _streamBufRef = useRef("");
  const _streamRafRef = useRef(0);
  /** 追加流式文本（高频调用，不直接 setState） */
  const appendStreamingText = useCallback((text: string) => {
    _streamBufRef.current += text;
    if (!_streamRafRef.current) {
      _streamRafRef.current = requestAnimationFrame(() => {
        _streamRafRef.current = 0;
        const buf = _streamBufRef.current;
        setAiStreamingText(buf);
      });
    }
  }, []);
  /** 重置流式文本 */
  const resetStreamingText = useCallback((text = "") => {
    _streamBufRef.current = text;
    if (_streamRafRef.current) {
      cancelAnimationFrame(_streamRafRef.current);
      _streamRafRef.current = 0;
    }
    setAiStreamingText(text);
  }, []);
  const normalizeStreamingText = useCallback(() => {
    setAiStreamingText((prev) => normalizeAiStreamingResult(prev));
  }, []);

  // 同理对 reasoning 文本也做 RAF 节流
  const _reasonBufRef = useRef("");
  const _reasonRafRef = useRef(0);
  const flushReasoningText = useCallback(
    (text: string, flush = false, isDelta = false) => {
      if (isDelta) {
        _reasonBufRef.current += text; // 增量追加
      } else {
        _reasonBufRef.current = text; // 全量替换
      }
      if (flush) {
        if (_reasonRafRef.current) {
          cancelAnimationFrame(_reasonRafRef.current);
          _reasonRafRef.current = 0;
        }
        setAiReasoningText(_reasonBufRef.current);
        return;
      }
      if (!_reasonRafRef.current) {
        _reasonRafRef.current = requestAnimationFrame(() => {
          _reasonRafRef.current = 0;
          setAiReasoningText(_reasonBufRef.current);
        });
      }
    },
    [],
  );

  // 段落 RAF 批量合并：收集 pending 段落，每帧最多一次 setState
  const _pendingParasRef = useRef<AiProcessChunk["paragraph"][]>([]);
  const _paraRafRef = useRef(0);
  const flushPendingParas = useCallback((immediate = false) => {
    if (immediate) {
      if (_paraRafRef.current) {
        cancelAnimationFrame(_paraRafRef.current);
        _paraRafRef.current = 0;
      }
      const batch = _pendingParasRef.current;
      _pendingParasRef.current = [];
      if (batch.length > 0) {
        setAiStructuredParagraphs((prev) => [...prev, ...batch]);
      }
      return;
    }
    if (!_paraRafRef.current) {
      _paraRafRef.current = requestAnimationFrame(() => {
        _paraRafRef.current = 0;
        const batch = _pendingParasRef.current;
        _pendingParasRef.current = [];
        if (batch.length > 0) {
          setAiStructuredParagraphs((prev) => [...prev, ...batch]);
        }
      });
    }
  }, []);
  const clearQueuedStructuredParagraphs = useCallback(() => {
    _pendingParasRef.current = [];
    if (_paraRafRef.current) {
      cancelAnimationFrame(_paraRafRef.current);
      _paraRafRef.current = 0;
    }
    setAiStructuredParagraphs([]);
  }, []);
  const queueStructuredParagraph = useCallback(
    (paragraph: StructuredParagraph) => {
      _pendingParasRef.current.push(paragraph);
      flushPendingParas();
    },
    [flushPendingParas],
  );

  const [processingLog, setProcessingLog] = useState<
    { type: "status" | "error" | "info"; message: string; ts: number }[]
  >([]);
  // #20: 统一段落数据源 — 根据 phase 自动决定优先级
  const displayParagraphs = useMemo(() => {
    if (aiStructuredParagraphs.length > 0) return aiStructuredParagraphs;
    if (acceptedParagraphs.length > 0) return acceptedParagraphs;
    return [];
  }, [aiStructuredParagraphs, acceptedParagraphs]);
  /** #12 processingLog 上限，FIFO 淘汰旧记录防止内存泄漏 */
  const MAX_PROCESSING_LOG = 100;
  const appendProcessingLog = useCallback(
    (entry: {
      type: "status" | "error" | "info";
      message: string;
      ts: number;
    }) => {
      setProcessingLog((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_PROCESSING_LOG
          ? next.slice(-MAX_PROCESSING_LOG)
          : next;
      });
    },
    [],
  );
  // 知识库参考文档列表（起草阶段，AI 实际引用了哪些 KB 文档）
  const [kbReferences, setKbReferences] = useState<KbReferenceItem[]>([]);

  // 排版分块大小（字符数）— 使用后端固定常量，前端不再暴露
  // AI 推理/思考过程（排版、审查等阶段共用）
  const [aiReasoningText, setAiReasoningText] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showReasoningPanel, setShowReasoningPanel] = useState(true);
  // 排版进度 {current, total, percent}
  const [formatProgress, setFormatProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  // 排版建议
  const [formatSuggestions, setFormatSuggestions] = useState<
    FormatSuggestionItem[]
  >([]);
  const [formatSuggestResult, setFormatSuggestResult] =
    useState<FormatSuggestResult | null>(null);
  const [isFormatSuggesting, setIsFormatSuggesting] = useState(false);
  const [showFormatSuggestPanel, setShowFormatSuggestPanel] = useState(false);
  const [formatSuggestParas, setFormatSuggestParas] = useState<
    StructuredParagraph[]
  >([]);

  // 格式化预设管理
  const [formatPresets, setFormatPresets] = useState<SmartDocFormatPreset[]>(
    () => [...BUILTIN_FORMAT_PRESETS, ...loadCustomPresetsFromStorage()],
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const selectedPreset = useMemo(
    () => formatPresets.find((p) => p.id === selectedPresetId) || null,
    [formatPresets, selectedPresetId],
  );
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [editingPreset, setEditingPreset] =
    useState<SmartDocFormatPreset | null>(null);
  const [presetForm, setPresetForm] = useState<SmartDocPresetForm>(
    createDefaultSmartDocPresetForm,
  );
  const [presetCategoryFilter, setPresetCategoryFilter] = useState("全部");

  // ── 撤销 / 重做 — 统一编辑历史栈（支持结构化段落 + 纯文本）──
  type EditSnapshot =
    | { kind: "content"; content: string }
    | { kind: "ai"; paragraphs: StructuredParagraph[] }
    | { kind: "accepted"; paragraphs: StructuredParagraph[] };
  const editHistoryRef = useRef<EditSnapshot[]>([]);
  const editIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 版本历史面板
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionList, setVersionList] = useState<DocVersion[]>([]);
  const [restoreConfirmVersion, setRestoreConfirmVersion] =
    useState<DocVersion | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewVersionContent, setPreviewVersionContent] = useState<
    string | null
  >(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // 自动保存
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try {
      return localStorage.getItem("govai_auto_save") === "1";
    } catch {
      return false;
    }
  });
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 推入一条快照到统一编辑历史栈 */
  const pushSnapshot = useCallback((snapshot: EditSnapshot) => {
    const h = editHistoryRef.current;
    const idx = editIndexRef.current;
    // 截断「未来」分支
    if (idx < h.length - 1) {
      editHistoryRef.current = h.slice(0, idx + 1);
    }
    // 去重：同类型且数据不变则跳过
    const last = editHistoryRef.current[editHistoryRef.current.length - 1];
    if (last && last.kind === snapshot.kind) {
      if (snapshot.kind === "content") {
        if (last.content === snapshot.content) return;
      } else if (last.paragraphs === snapshot.paragraphs) {
        return;
      }
    }
    editHistoryRef.current.push(snapshot);
    if (editHistoryRef.current.length > 60) editHistoryRef.current.shift();
    editIndexRef.current = editHistoryRef.current.length - 1;
    setCanUndo(editIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  /** 向后兼容：推入纯文本内容快照 */
  const pushContentHistory = useCallback(
    (content: string) => pushSnapshot({ kind: "content", content }),
    [pushSnapshot],
  );
  const pushAiSnapshot = useCallback(
    (paragraphs: StructuredParagraph[]) =>
      pushSnapshot({ kind: "ai", paragraphs }),
    [pushSnapshot],
  );

  /* ── 变更追踪：接受 / 拒绝单条变更 ── */

  /** 接受单条变更（idx = validParagraphs 索引，对齐到 aiStructuredParagraphs） */
  /** 段落变更后同步纯文本 content（用于保存/自动保存） */
  const syncParagraphsToContent = useCallback(
    (paras: StructuredParagraph[]) => {
      const text = paragraphsToText(paras);
      if ((currentDoc?.content ?? "") === text) return;
      setCurrentDoc((prev) => (prev ? { ...prev, content: text } : prev));
      paragraphVersionRef.current += 1;
      setParagraphVersion(paragraphVersionRef.current);
    },
    [currentDoc?.content],
  );

  const loadDocs = useCallback(
    async (overrideScope?: string) => {
      try {
        const f: Parameters<typeof apiListDocuments>[3] = {};
        if (filters.keyword) f.keyword = filters.keyword;
        if (filters.type) f.doc_type = filters.type;
        if (filters.status) f.status = filters.status;
        if (filters.security) f.security = filters.security;
        if (filters.startDate) f.start_date = filters.startDate;
        if (filters.endDate) f.end_date = filters.endDate;
        const scope = overrideScope || docScope;
        const data = await apiListDocuments(
          "doc",
          1,
          100,
          Object.keys(f).length > 0 ? f : undefined,
          scope,
        );
        setDocs(data.items);
        setDocsTotal(data.total);
      } catch (err: unknown) {
        toast.error("加载文档失败: " + getErrorMessage(err));
      }
    },
    [docScope, filters],
  );

  const handleAcceptChange = useCallback(
    (idx: number) => {
      setAiStructuredParagraphs((prev) => {
        // 收集有效（非空）段落的索引映射
        const validToOrig: number[] = [];
        prev.forEach((p, i) => {
          if ((p.text ?? "").toString().trim().length > 0) validToOrig.push(i);
        });
        const origIdx = validToOrig[idx];
        if (origIdx == null) return prev;
        const para = prev[origIdx];
        if (!para._change) return prev;

        let next: StructuredParagraph[];
        if (para._change === "deleted") {
          // 接受删除 → 从数组中移除
          next = prev.filter((_, i) => i !== origIdx);
        } else {
          // added / modified → 清除变更标记，保留内容
          next = prev.map((p, i) =>
            i === origIdx
              ? {
                  ...p,
                  _change: undefined,
                  _original_text: undefined,
                  _change_reason: undefined,
                }
              : p,
          );
        }
        // 异步同步 content（不能在 setState 回调里直接调另一个 setState）
        setTimeout(() => syncParagraphsToContent(next), 0);
        return next;
      });
    },
    [syncParagraphsToContent],
  );

  /** 拒绝单条变更 */
  const handleRejectChange = useCallback(
    (idx: number) => {
      setAiStructuredParagraphs((prev) => {
        const validToOrig: number[] = [];
        prev.forEach((p, i) => {
          if ((p.text ?? "").toString().trim().length > 0) validToOrig.push(i);
        });
        const origIdx = validToOrig[idx];
        if (origIdx == null) return prev;
        const para = prev[origIdx];
        if (!para._change) return prev;

        let next: StructuredParagraph[];
        if (para._change === "added") {
          // 拒绝新增 → 移除
          next = prev.filter((_, i) => i !== origIdx);
        } else if (para._change === "deleted") {
          // 拒绝删除 → 保留段落，清除标记
          next = prev.map((p, i) =>
            i === origIdx
              ? {
                  ...p,
                  _change: undefined,
                  _original_text: undefined,
                  _change_reason: undefined,
                }
              : p,
          );
        } else if (para._change === "modified") {
          // 拒绝修改 → 恢复原文
          next = prev.map((p, i) =>
            i === origIdx
              ? {
                  ...p,
                  text: p._original_text || p.text,
                  _change: undefined,
                  _original_text: undefined,
                  _change_reason: undefined,
                }
              : p,
          );
        } else {
          return prev;
        }
        setTimeout(() => syncParagraphsToContent(next), 0);
        return next;
      });
    },
    [syncParagraphsToContent],
  );

  /** 全部接受 */
  const handleAcceptAll = useCallback(() => {
    setAiStructuredParagraphs((prev) => {
      const next = prev
        .filter((p) => p._change !== "deleted")
        .map((p) =>
          p._change
            ? {
                ...p,
                _change: undefined,
                _original_text: undefined,
                _change_reason: undefined,
              }
            : p,
        );
      // React 18+ 自动批量更新：同步设置 acceptedParagraphs 并清空 aiStructuredParagraphs，避免竞态闪烁
      syncParagraphsToContent(next);
      pushSnapshot({ kind: "accepted", paragraphs: next });
      setAcceptedParagraphs(next);
      setParagraphPhase("accepted");
      return []; // 清空 AI 段落，数据已迁移到 acceptedParagraphs
    });
  }, [syncParagraphsToContent, pushSnapshot]);

  /** 全部拒绝 */
  const handleRejectAll = useCallback(() => {
    setAiStructuredParagraphs((prev) => {
      const next = prev
        .filter((p) => p._change !== "added")
        .map((p) => {
          if (p._change === "modified" && p._original_text) {
            return {
              ...p,
              text: p._original_text,
              _change: undefined,
              _original_text: undefined,
              _change_reason: undefined,
            };
          }
          if (p._change === "deleted") {
            return {
              ...p,
              _change: undefined,
              _original_text: undefined,
              _change_reason: undefined,
            };
          }
          return p;
        });
      syncParagraphsToContent(next);
      pushSnapshot({ kind: "accepted", paragraphs: next });
      setAcceptedParagraphs(next);
      return []; // 清空 AI 段落，数据已迁移到 acceptedParagraphs
    });
  }, [syncParagraphsToContent, pushSnapshot]);

  const handleApplyAiResult = useCallback(async () => {
    if (!currentDoc) return;
    const paras = aiStructuredParagraphs
      .filter((paragraph) => paragraph._change !== "deleted")
      .map(({ _change, _original_text, _change_reason, ...rest }) => rest);

    setAcceptedParagraphs(paras);
    editHistoryRef.current = [{ kind: "accepted" as const, paragraphs: paras }];
    editIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);

    const merged = paras.map((paragraph) => paragraph.text).join("\n\n");
    pushContentHistory(merged);
    setCurrentDoc({
      ...currentDoc,
      content: merged,
    });

    try {
      await apiUpdateDocument(currentDoc.id, {
        content: merged,
        formatted_paragraphs: JSON.stringify(paras),
      });
      toast.success("已采用排版结果并保存");
    } catch {
      toast.success("已采用结果（自动保存失败，请手动保存）");
    }

    loadDocs();
  }, [aiStructuredParagraphs, currentDoc, loadDocs, pushContentHistory]);

  /** 应用一条快照到对应 state（同时清除竞争状态，确保渲染优先级链正确） */
  const applySnapshot = useCallback((s: EditSnapshot) => {
    // 清空 pending RAF 缓冲区，防止旧 RAF 回调追加过期数据到恢复后的状态
    _pendingParasRef.current = [];
    if (_paraRafRef.current) {
      cancelAnimationFrame(_paraRafRef.current);
      _paraRafRef.current = 0;
    }
    if (s.kind === "ai") {
      setAiStructuredParagraphs(s.paragraphs);
      setAcceptedParagraphs([]);
    } else if (s.kind === "accepted") {
      setAcceptedParagraphs(s.paragraphs);
      setAiStructuredParagraphs([]);
    } else {
      setCurrentDoc((prev) =>
        prev
          ? {
              ...prev,
              content: s.content,
              formatted_paragraphs: undefined,
            }
          : prev,
      );
      setAiStructuredParagraphs([]);
      setAcceptedParagraphs([]);
    }
  }, []);

  /** 撤销 */
  const handleUndo = useCallback(() => {
    if (editIndexRef.current <= 0) return;
    editIndexRef.current -= 1;
    applySnapshot(editHistoryRef.current[editIndexRef.current]);
    setCanUndo(editIndexRef.current > 0);
    setCanRedo(true);
  }, [applySnapshot]);

  /** 重做 */
  const handleRedo = useCallback(() => {
    if (editIndexRef.current >= editHistoryRef.current.length - 1) return;
    editIndexRef.current += 1;
    applySnapshot(editHistoryRef.current[editIndexRef.current]);
    setCanUndo(true);
    setCanRedo(editIndexRef.current < editHistoryRef.current.length - 1);
  }, [applySnapshot]);

  /** 加载版本历史 */
  const loadVersionHistory = useCallback(async () => {
    if (!currentDoc) return;
    setIsLoadingVersions(true);
    try {
      const versions = await apiListDocVersions(currentDoc.id);
      setVersionList(versions);
    } catch {
      toast.error("加载版本历史失败");
    } finally {
      setIsLoadingVersions(false);
    }
  }, [currentDoc?.id]);

  /** 预览指定版本内容 */
  const handlePreviewVersion = useCallback(
    async (versionId: string) => {
      if (!currentDoc) return;
      if (previewVersionId === versionId) {
        // 收起预览
        setPreviewVersionId(null);
        setPreviewVersionContent(null);
        return;
      }
      setPreviewVersionId(versionId);
      setIsLoadingPreview(true);
      try {
        const detail = await apiGetDocVersion(currentDoc.id, versionId);
        setPreviewVersionContent(detail.content);
      } catch {
        toast.error("加载版本内容失败");
        setPreviewVersionId(null);
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [currentDoc?.id, previewVersionId],
  );

  /** 弹出恢复确认弹窗 */
  const handleRestoreVersion = useCallback(
    (versionId: string) => {
      const v = versionList.find((ver) => ver.id === versionId);
      if (v) setRestoreConfirmVersion(v);
    },
    [versionList],
  );

  /** 真正执行恢复 */
  const doRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!currentDoc) return;
      const docId = currentDoc.id;
      setRestoreConfirmVersion(null);
      try {
        const result = await apiRestoreDocVersion(docId, versionId);
        // 解析恢复的结构化排版段落（如有）
        const restoredParas = parseFormattedParagraphs(
          result.formatted_paragraphs,
        );
        const restoredContent =
          (result.content || "").trim() || paragraphsToText(restoredParas);
        // 恢复结构化段落状态
        setAiStructuredParagraphs(restoredParas);
        setAcceptedParagraphs(restoredParas.length > 0 ? restoredParas : []);
        // 更新文档内容及排版数据
        setCurrentDoc((prev) =>
          prev
            ? {
                ...prev,
                content: restoredContent,
                formatted_paragraphs: result.formatted_paragraphs || undefined,
              }
            : prev,
        );
        // 重置撤销/重做历史为恢复后的内容
        editHistoryRef.current = [
          { kind: "content" as const, content: restoredContent },
        ];
        editIndexRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        // 清除版本预览状态
        setPreviewVersionId(null);
        setPreviewVersionContent(null);
        toast.success(`已恢复到版本 v${result.version_number}`);
        // 刷新版本历史列表和文档列表
        await loadVersionHistory();
        loadDocs();
      } catch (err: unknown) {
        toast.error("版本恢复失败: " + getErrorMessage(err));
      }
    },
    [currentDoc?.id, loadDocs, loadVersionHistory],
  );

  // 获取当前需要保存的结构化段落（优先 acceptedParagraphs，其次 aiStructuredParagraphs 中无变更标记的）
  const getFormattedParagraphsJson = useCallback(() => {
    if (acceptedParagraphs.length > 0)
      return JSON.stringify(acceptedParagraphs);
    // AI 段落中如果全部已处理（无 _change 标记），也可以保存
    const cleanAi = aiStructuredParagraphs.filter(
      (p) => (p.text ?? "").toString().trim().length > 0 && !p._change,
    );
    if (cleanAi.length > 0 && !aiStructuredParagraphs.some((p) => p._change))
      return JSON.stringify(cleanAi);
    return undefined;
  }, [acceptedParagraphs, aiStructuredParagraphs]);

  const getEffectiveCurrentContent = useCallback(() => {
    if (!currentDoc) return "";
    if ((currentDoc.content || "").trim()) return currentDoc.content;
    return paragraphsToText(
      acceptedParagraphs.length > 0
        ? acceptedParagraphs
        : aiStructuredParagraphs,
    );
  }, [currentDoc, acceptedParagraphs, aiStructuredParagraphs]);

  // 静默保存（自动保存用，不弹 toast）
  const silentSaveDoc = useCallback(async () => {
    if (!currentDoc) return;
    try {
      const body: Record<string, string | undefined> = {
        content: getEffectiveCurrentContent(),
        title: currentDoc.title,
      };
      const fp = getFormattedParagraphsJson();
      if (fp) body.formatted_paragraphs = fp;
      await apiUpdateDocument(currentDoc.id, body);
      setLastSavedAt(new Date());
    } catch {
      // 静默失败，不打扰用户
    }
  }, [
    currentDoc?.id,
    currentDoc?.content,
    currentDoc?.title,
    getEffectiveCurrentContent,
    getFormattedParagraphsJson,
  ]);

  // 段落变更序列号（用于触发自动保存）
  const paragraphVersionRef = useRef(0);
  const [paragraphVersion, setParagraphVersion] = useState(0);

  // 自动保存 effect：内容或段落变化后 3 秒无操作触发保存
  useEffect(() => {
    if (!autoSaveEnabled || !currentDoc) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      silentSaveDoc();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveEnabled, currentDoc?.content, paragraphVersion, silentSaveDoc]);

  // 持久化 autoSave 设置
  useEffect(() => {
    try {
      localStorage.setItem("govai_auto_save", autoSaveEnabled ? "1" : "0");
    } catch {}
  }, [autoSaveEnabled]);

  // #17 从服务端加载自定义排版预设（覆盖 localStorage 缓存）
  useEffect(() => {
    let cancelled = false;
    apiListFormatPresets()
      .then((list) => {
        if (cancelled) return;
        const serverPresets: SmartDocFormatPreset[] = list.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          instruction: p.instruction,
          systemPrompt: p.system_prompt,
          builtIn: false,
        }));
        setFormatPresets([...BUILTIN_FORMAT_PRESETS, ...serverPresets]);
        // 同步到 localStorage 作为离线缓存
        saveCustomPresetsToStorage(serverPresets);
      })
      .catch(() => {
        // API 失败时保留 localStorage 缓存
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 定时刷新 lastSavedAt 显示
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  // Ctrl+Z / Ctrl+Y 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        silentSaveDoc().then(() => toast.success("文档已保存"));
        return;
      }
      // 焦点在 contentEditable / textarea 内时让浏览器自行处理 undo
      const t = e.target as HTMLElement;
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        t.isContentEditable
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, silentSaveDoc]);

  /* ── 数据加载 ── */
  const loadMaterials = async () => {
    try {
      const data = await apiListMaterials();
      setMaterials(data);
    } catch (err: unknown) {
      toast.error("加载素材失败: " + getErrorMessage(err));
    }
  };
  const loadKbCollections = async () => {
    try {
      const data = await apiListCollections();
      setKbCollections(data);
    } catch {
      /* 非关键 */
    }
  };

  const toggleKbCollectionExpand = async (collectionId: string) => {
    setExpandedKbCollections((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
        // 首次展开时加载文件列表
        if (!kbCollectionFiles[collectionId]) {
          loadKbCollectionFiles(collectionId);
        }
      }
      return next;
    });
  };

  const loadKbCollectionFiles = async (collectionId: string) => {
    setLoadingKbFiles((prev) => new Set(prev).add(collectionId));
    try {
      const { items } = await apiListFiles(collectionId, 1, 100, {
        status: "indexed",
      });
      setKbCollectionFiles((prev) => ({ ...prev, [collectionId]: items }));
    } catch {
      setKbCollectionFiles((prev) => ({ ...prev, [collectionId]: [] }));
    } finally {
      setLoadingKbFiles((prev) => {
        const next = new Set(prev);
        next.delete(collectionId);
        return next;
      });
    }
  };

  const toggleKbFileSelection = (fileId: string, collectionId: string) => {
    setSelectedKbFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId],
    );
    // 确保父集合也被选中
    if (!selectedDraftKbIds.includes(collectionId)) {
      setSelectedDraftKbIds((prev) => [...prev, collectionId]);
    }
  };

  const currentPipelineStage = PIPELINE_STAGES[pipelineStage];
  const hookToast = useMemo<HookToastLike>(() => {
    const notify = ((message: string) => {
      toast.info(message);
    }) as HookToastLike;
    notify.success = (message) => toast.success(message);
    notify.error = (message) => toast.error(message);
    notify.info = (message) => toast.info(message);
    return notify;
  }, [toast]);
  const { handleAiProcess, handleConfirmOutline, handleFormatSuggest } =
    useSmartDocAiFlow({
      toast: hookToast,
      currentDoc,
      pipelineStageIndex: pipelineStage,
      currentStageId: currentPipelineStage.id,
      currentStageLabel: currentPipelineStage.label,
      aiInstruction,
      setAiInstruction,
      selectedPreset,
      draftHeadingLevel,
      aiStructuredParagraphs,
      acceptedParagraphs,
      selectedDraftKbIds,
      selectedKbFileIds,
      outlineText,
      setOutlineText,
      setShowOutlinePanel,
      setCurrentDoc,
      setDocs,
      setAcceptedParagraphs,
      setAiStructuredParagraphs,
      setParagraphPhase,
      setIsAiProcessing,
      setIsAiThinking,
      setAiLockConflict,
      setProcessingLog,
      appendProcessingLog,
      maxProcessingLog: MAX_PROCESSING_LOG,
      setKbReferences,
      setFormatProgress,
      setFormatStats,
      setReviewResult,
      setCompletedStages,
      setFormatSuggestions,
      setFormatSuggestResult,
      setFormatSuggestParas,
      setShowFormatSuggestPanel,
      setIsFormatSuggesting,
      flushReasoningText,
      appendStreamingText,
      resetStreamingText,
      normalizeStreamingText,
      clearQueuedStructuredParagraphs,
      queueStructuredParagraph,
      flushPendingParas,
      aiOutputRef,
      aiAbortRef,
      aiGenerationRef: _aiGenRef,
      needsMoreInfoRef,
      pushContentHistory,
      pushAiSnapshot,
      paragraphsToText,
      loadDocs,
    });

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);
  useEffect(() => {
    loadMaterials();
    loadKbCollections();
  }, []);

  /* ── 文档操作 ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error(
        `文件大小 (${(file.size / 1024 / 1024).toFixed(1)}MB) 超过限制，最大允许 ${MAX_FILE_SIZE_MB}MB`,
      );
      e.target.value = "";
      return;
    }
    setUploadedFile(file);
  };

  const ACCEPTED_EXTENSIONS = [
    ".docx",
    ".doc",
    ".pdf",
    ".txt",
    ".md",
    ".csv",
    ".xlsx",
    ".pptx",
    ".html",
    ".htm",
  ];
  const MAX_FILE_SIZE_MB = 50;
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return toast.error(
        `不支持的文件格式 (${ext})，请上传 ${ACCEPTED_EXTENSIONS.join(" ")} 格式`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return toast.error(
        `文件大小 (${(file.size / 1024 / 1024).toFixed(1)}MB) 超过限制，最大允许 ${MAX_FILE_SIZE_MB}MB`,
      );
    }
    setUploadedFile(file);
  };

  const handleProcess = async (
    customDoc: DocListItem | null = null,
    customType: string | null = null,
  ) => {
    const typeToUse = customType || processType;

    // For pipeline mode: if we already have a currentDoc, use it directly
    if (!customDoc && !currentDoc && !uploadedFile)
      return toast.error("请先上传文档或选择现有文档");
    setIsProcessing(true);
    setActiveDropdownId(null);
    try {
      let docId = customDoc?.id || currentDoc?.id;
      // 如果是新上传 — 先导入（支持无文件创建空文档）
      if (!docId) {
        const imp = await apiImportDocument(
          uploadedFile || null,
          "doc",
          "official",
          "internal",
        );
        docId = imp.id;
      }
      if (!docId) throw new Error("无法获取文档 ID");
      // 调用 AI 处理
      const result = await apiProcessDocument(docId, typeToUse);
      // 获取更新后的文档
      const updatedDoc = await apiGetDocument(docId);
      const savedParagraphs = parseFormattedParagraphs(
        updatedDoc.formatted_paragraphs,
      );
      setCurrentDoc(withParagraphContent(updatedDoc, savedParagraphs));
      // 同步后端 formatted_paragraphs，防止旧排版数据残留
      if (savedParagraphs.length > 0) {
        setAcceptedParagraphs(savedParagraphs);
      } else {
        setAcceptedParagraphs([]);
      }

      // Update pipeline state
      const stageIdx = PIPELINE_STAGES.findIndex((s) => s.id === typeToUse);
      if (stageIdx >= 0) {
        setCompletedStages((prev) => {
          const next = new Set(prev);
          next.add(stageIdx);
          return next;
        });
      }

      if (result.review_result) {
        setReviewResult(result.review_result);
      } else {
        setReviewResult(null);
      }

      if (result.format_stats) {
        setFormatStats(result.format_stats);
      }

      // Stay in pipeline view but show editor
      setStep(3);
      if (view === "list") setView("create");
      loadDocs();
      toast.success(
        `${typeToUse === "draft" ? "起草" : typeToUse === "review" ? "审查优化" : "格式化"}完成`,
      );
    } catch (err: unknown) {
      toast.error("处理失败: " + getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmOptimize = useCallback(() => {
    setShowOptimizeModal(false);
    if (optimizeTarget) handleProcess(optimizeTarget, "optimize");
  }, [handleProcess, optimizeTarget]);

  const handleImportCurrentFile = useCallback(async () => {
    setIsProcessing(true);
    try {
      const imp = await apiImportDocument(
        uploadedFile || null,
        "doc",
        "official",
        "internal",
      );
      const detail = await apiGetDocument(imp.id);
      setCurrentDoc(detail);
      // 清除上一份文档残留的排版数据，防止自动保存污染新文档
      setAcceptedParagraphs([]);
      setAiStructuredParagraphs([]);
      editHistoryRef.current = [
        {
          kind: "content" as const,
          content: detail.content || "",
        },
      ];
      editIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      setCompletedStages(inferCompletedStages(detail.status));
      setPipelineStage(inferNextStage(detail.status));
      setProcessType(PIPELINE_STAGES[inferNextStage(detail.status)].id);
      setStep(3);
      loadDocs();
      toast.success("文档导入成功");
    } catch (err: unknown) {
      toast.error("导入失败: " + getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  }, [loadDocs, toast, uploadedFile]);

  const saveDoc = async () => {
    if (!currentDoc) return;
    try {
      const body: Record<string, string | undefined> = {
        content: getEffectiveCurrentContent(),
        title: currentDoc.title,
      };
      const fp = getFormattedParagraphsJson();
      if (fp) body.formatted_paragraphs = fp;
      await apiUpdateDocument(currentDoc.id, body);
      setLastSavedAt(new Date());
      toast.success("文档已保存");
      loadDocs();
    } catch (err: unknown) {
      toast.error("保存失败: " + getErrorMessage(err));
    }
  };

  const handleBackToList = useCallback(() => {
    setView("list");
    loadDocs();
  }, [loadDocs]);

  const handleTitleInput = useCallback((title: string) => {
    setCurrentDoc((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  const handleTitleCommit = useCallback(
    (title: string, originalTitle: string) => {
      if (!currentDoc || !title || title === originalTitle) return;
      apiUpdateDocument(currentDoc.id, { title });
      setDocs((prev) =>
        prev.map((doc) => (doc.id === currentDoc.id ? { ...doc, title } : doc)),
      );
    },
    [currentDoc?.id],
  );

  const handleToggleAutoSave = useCallback(() => {
    setAutoSaveEnabled((prev) => !prev);
  }, []);

  const handleToggleMaterialPanel = useCallback(() => {
    setRightPanel((prev) => (prev === "material" ? null : "material"));
  }, []);

  const handleOpenVersionHistory = useCallback(() => {
    setShowVersionHistory(true);
    loadVersionHistory();
  }, [loadVersionHistory]);

  const handleCloseVersionHistory = useCallback(() => {
    setShowVersionHistory(false);
    setPreviewVersionId(null);
    setPreviewVersionContent(null);
  }, []);

  const handleArchive = async (d: Pick<DocListItem, "id" | "title">) => {
    if (
      !(await confirm({
        message: `确定归档《${d.title}》吗？`,
        variant: "warning",
        confirmText: "归档",
      }))
    )
      return;
    try {
      // 如果是当前文档，先保存最新内容再归档
      const effectiveContent = getEffectiveCurrentContent();
      if (currentDoc && currentDoc.id === d.id && effectiveContent) {
        const body: Record<string, string> = { content: effectiveContent };
        const fp = getFormattedParagraphsJson();
        if (fp) body.formatted_paragraphs = fp;
        await apiUpdateDocument(currentDoc.id, body);
      }
      await apiArchiveDocument(d.id);
      // 归档完成后返回列表
      setCurrentDoc(null);
      setStep(1);
      setView("list");
      loadDocs();
      toast.success("文档已归档");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        message: "确定删除此文档记录？此操作不可撤销。",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteDocument(id);
      setSelectedDocIds(new Set());
      loadDocs();
      toast.success("已删除");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    if (
      !(await confirm({
        message: `确定删除选中的 ${ids.length} 篇公文？此操作不可撤销。`,
        variant: "danger",
        confirmText: `删除 ${ids.length} 篇`,
      }))
    )
      return;
    try {
      const res = await apiBatchDeleteDocuments(ids);
      setSelectedDocIds(new Set());
      loadDocs();
      toast.success(res?.message || `已删除 ${ids.length} 篇公文`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const openDoc = async (d: DocListItem) => {
    // 立即取消旧文档的自动保存定时器，防止脏数据写入新文档
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    // ⚡ 递增代际 ID —— 旧文档的 SSE 回调会在下次触发时发现代际不匹配，静默变成 no-op
    // 流不中止，后台继续跑完（不浪费 Dify 调用），但结果不会投射到新文档
    _aiGenRef.current++;
    // 清除所有流式/处理状态
    setIsAiProcessing(false);
    resetStreamingText();
    flushReasoningText("", true);
    setIsAiThinking(false);
    setProcessingLog([]);
    setKbReferences([]);
    setFormatProgress(null);
    setFormatSuggestions([]);
    setFormatSuggestResult(null);
    setFormatSuggestParas([]);
    setIsFormatSuggesting(false);
    setShowFormatSuggestPanel(false);
    try {
      const detail = await apiGetDocument(d.id);
      const savedParagraphs = parseFormattedParagraphs(
        detail.formatted_paragraphs,
      );
      const hydratedDetail = withParagraphContent(detail, savedParagraphs);
      setCurrentDoc(hydratedDetail);
      // 初始化统一撤销历史
      editHistoryRef.current = [];
      editIndexRef.current = -1;
      setCanUndo(false);
      setCanRedo(false);
      // Initialize pipeline state from document status
      setCompletedStages(inferCompletedStages(detail.status));
      setPipelineStage(inferNextStage(detail.status));
      setFormatStats(null);
      setOutlineText("");
      setShowOutlinePanel(false);
      setReviewResult(null);
      setAiStructuredParagraphs([]);
      setParagraphPhase("idle");
      // 从后端恢复已保存的结构化排版数据
      if (savedParagraphs.length > 0) {
        setAcceptedParagraphs(savedParagraphs);
        setParagraphPhase("saved");
        // 初始快照：已采纳的结构化段落
        editHistoryRef.current = [
          { kind: "accepted" as const, paragraphs: savedParagraphs },
        ];
        editIndexRef.current = 0;
      } else {
        setAcceptedParagraphs([]);
        editHistoryRef.current = [
          { kind: "content" as const, content: hydratedDetail.content || "" },
        ];
        editIndexRef.current = 0;
      }
      setRightPanel(null);
      setStep(3); // Go to editor/pipeline view
      setView("create");
    } catch (err: unknown) {
      toast.error("加载文档失败: " + getErrorMessage(err));
    }
  };

  /* ── 导出 ── */
  const handleExport = async () => {
    const targetIds =
      selectedDocIds.size > 0
        ? Array.from(selectedDocIds)
        : docs.map((d) => d.id);
    if (targetIds.length === 0) return toast.error("没有可导出的数据");
    try {
      const blob = await apiExportDocuments(targetIds, "zip");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `公文_导出_${new Date().toISOString().slice(0, 10)}.zip`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success(`成功导出 ${targetIds.length} 份文档`);
    } catch (err: unknown) {
      toast.error("导出失败: " + getErrorMessage(err));
    }
  };

  /* ── 下载源文件 ── */
  const handleDownloadSource = async () => {
    if (!currentDoc) return;
    try {
      const blob = await apiDownloadDocumentSource(currentDoc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentDoc.title}.${currentDoc.source_format || "docx"}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("文件下载成功");
    } catch (err: unknown) {
      toast.error("下载失败: " + getErrorMessage(err));
    }
  };

  /* ── 下载排版后内容（DOCX + PDF 双格式） ── */
  const handleDownloadFormatted = async () => {
    if (!currentDoc) return;
    let paragraphs = displayParagraphs.length > 0 ? displayParagraphs : null;

    if (!paragraphs || paragraphs.length === 0) {
      const content = currentDoc.content || "";
      if (!content.trim()) return toast.error("文档内容为空，请先处理文档");
      paragraphs = content
        .split(/\n+/)
        .filter((l: string) => l.trim())
        .map((line: string) => ({ text: line.trim(), style_type: "正文" }));
    }

    const title = currentDoc.title || "排版文档";
    // 根据文档类型选择预设（与 StructuredDocRenderer 一致）
    const preset = currentDoc.doc_type || "official";
    const downloadBlob = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    try {
      toast.success("正在生成 Word 文档…");
      const blob = await apiExportFormattedDocx(
        currentDoc.id,
        paragraphs,
        title,
        preset,
      );
      downloadBlob(blob, `${title}.docx`);
      toast.success("文档已下载");
    } catch (err: unknown) {
      toast.error("导出失败: " + getErrorMessage(err));
    }
  };

  /* ── 下载排版后内容（PDF 格式） ── */
  const handleDownloadPdf = async () => {
    if (!currentDoc) return;
    let paragraphs = displayParagraphs.length > 0 ? displayParagraphs : null;

    if (!paragraphs || paragraphs.length === 0) {
      const content = currentDoc.content || "";
      if (!content.trim()) return toast.error("文档内容为空，请先处理文档");
      paragraphs = content
        .split(/\n+/)
        .filter((l: string) => l.trim())
        .map((line: string) => ({ text: line.trim(), style_type: "正文" }));
    }

    const title = currentDoc.title || "排版文档";
    const preset = currentDoc.doc_type || "official";
    const downloadBlob = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    try {
      toast.success("正在生成 PDF 文档…");
      const blob = await apiExportFormattedPdf(
        currentDoc.id,
        paragraphs,
        title,
        preset,
      );
      downloadBlob(blob, `${title}.pdf`);
      toast.success("PDF 已下载");
    } catch (err: unknown) {
      toast.error("PDF 导出失败: " + getErrorMessage(err));
    }
  };

  /* ── 预览（获取 Markdown 并打开弹窗） ── */
  // #21: 导出预览对话框
  const [showExportPreview, setShowExportPreview] = useState(false);
  const handleApplyAllFormatSuggestions = useCallback((instruction: string) => {
    setAiInstruction(instruction);
  }, []);
  const handleAppendFormatSuggestion = useCallback((instruction: string) => {
    setAiInstruction((prev) =>
      prev ? `${prev}；${instruction}` : instruction,
    );
  }, []);
  const handleApplyFormatSuggestParas = useCallback(
    (paragraphs: StructuredParagraph[]) => {
      setAiStructuredParagraphs(paragraphs);
    },
    [],
  );

  /* ── 格式化预设 CRUD ── */
  /* ── 从结构化表单生成隐藏的 systemPrompt ── */
  /** Convert form lineSpacing ("28磅" / "1.5倍") to backend line_height */
  const convertLineSpacing = (ls: string): string => {
    const ptMatch = ls.match(/^(\d+)磅$/);
    if (ptMatch) return `${ptMatch[1]}pt`;
    const mulMatch = ls.match(/^([\d.]+)倍$/);
    if (mulMatch) return mulMatch[1];
    return "2";
  };

  /** Convert form alignment to backend alignment */
  const convertAlign = (a: string): string => {
    const map: Record<string, string> = {
      居中: "center",
      左对齐: "left",
      右对齐: "right",
      两端对齐: "justify",
    };
    return map[a] || "left";
  };

  /** Build structured format_params for the rule engine from presetForm */
  const buildFormatParams = (form: SmartDocPresetForm): FormatParams => {
    const lh = convertLineSpacing(form.lineSpacing);
    const params: FormatParams = {
      title: {
        font_size: form.titleSize,
        font_family: form.titleFont,
        bold: form.titleBold,
        italic: form.titleItalic,
        alignment: convertAlign(form.titleAlign),
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
      body: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: form.bodyBold,
        italic: form.bodyItalic,
        alignment: "justify",
        indent: form.bodyIndent ? "2em" : "0",
        line_height: lh,
        color: "#000000",
      },
      ...(form.headingEnabled
        ? {
            heading1: {
              font_size: form.headingSize,
              font_family: form.headingFont,
              bold: form.headingBold,
              italic: form.headingItalic,
              alignment: "left",
              indent: "2em",
              line_height: lh,
              color: "#000000",
            },
          }
        : {}),
      closing: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: false,
        italic: false,
        alignment: "right",
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
      signature: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: false,
        italic: false,
        alignment: "right",
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
      date: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: false,
        italic: false,
        alignment: "right",
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
      recipient: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: false,
        italic: false,
        alignment: "left",
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
      attachment: {
        font_size: form.bodySize,
        font_family: form.bodyFont,
        bold: false,
        italic: false,
        alignment: "left",
        indent: "0",
        line_height: lh,
        color: "#000000",
      },
    };
    if (form.heading2Enabled) {
      params.heading2 = {
        font_size: form.heading2Size,
        font_family: form.heading2Font,
        bold: form.heading2Bold,
        italic: form.heading2Italic,
        alignment: "left",
        indent: "2em",
        line_height: lh,
        color: "#000000",
      };
    }
    if (form.heading3Enabled) {
      params.heading3 = {
        font_size: form.heading3Size,
        font_family: form.heading3Font,
        bold: form.heading3Bold,
        italic: form.heading3Italic,
        alignment: "left",
        indent: "2em",
        line_height: lh,
        color: "#000000",
      };
    }
    if (form.heading4Enabled) {
      params.heading4 = {
        font_size: form.heading4Size,
        font_family: form.heading4Font,
        bold: form.heading4Bold,
        italic: form.heading4Italic,
        alignment: "left",
        indent: "2em",
        line_height: lh,
        color: "#000000",
      };
    }
    if (form.heading5Enabled) {
      params.heading5 = {
        font_size: form.heading5Size,
        font_family: form.heading5Font,
        bold: form.heading5Bold,
        italic: form.heading5Italic,
        alignment: "left",
        indent: "2em",
        line_height: lh,
        color: "#000000",
      };
    }
    return params;
  };

  const buildSystemPrompt = (form: SmartDocPresetForm) => {
    const fmtStyle = (bold: boolean, italic: boolean) => {
      const parts: string[] = [];
      if (bold) parts.push("加粗");
      if (italic) parts.push("斜体");
      return parts.length ? "、" + parts.join("") : "";
    };
    const rules: string[] = [];
    rules.push(
      `1. 文档标题：字体${form.titleFont}、字号${form.titleSize}${fmtStyle(form.titleBold, form.titleItalic)}、对齐方式${form.titleAlign}`,
    );
    rules.push(
      `2. 正文段落：字体${form.bodyFont}、字号${form.bodySize}${fmtStyle(form.bodyBold, form.bodyItalic)}${form.bodyIndent ? "、首行缩进2字符" : ""}、行距${form.lineSpacing}`,
    );
    let ruleIdx = 3;
    const hasAnyHeading =
      form.headingEnabled ||
      form.heading2Enabled ||
      form.heading3Enabled ||
      form.heading4Enabled ||
      form.heading5Enabled;
    if (form.headingEnabled) {
      rules.push(
        `${ruleIdx}. 一级标题（一、二、三、…）：字体${form.headingFont}、字号${form.headingSize}${fmtStyle(form.headingBold, form.headingItalic)}`,
      );
      ruleIdx++;
    }
    if (form.heading2Enabled) {
      rules.push(
        `${ruleIdx}. 二级标题（（一）（二）（三）…）：字体${form.heading2Font}、字号${form.heading2Size}${fmtStyle(form.heading2Bold, form.heading2Italic)}`,
      );
      ruleIdx++;
    }
    if (form.heading3Enabled) {
      rules.push(
        `${ruleIdx}. 三级标题（1. 2. 3. …）：字体${form.heading3Font}、字号${form.heading3Size}${fmtStyle(form.heading3Bold, form.heading3Italic)}`,
      );
      ruleIdx++;
    }
    if (form.heading4Enabled) {
      rules.push(
        `${ruleIdx}. 四级标题（(1) (2) (3) …）：字体${form.heading4Font}、字号${form.heading4Size}${fmtStyle(form.heading4Bold, form.heading4Italic)}`,
      );
      ruleIdx++;
    }
    if (form.heading5Enabled) {
      rules.push(
        `${ruleIdx}. 五级标题（① ② ③ …）：字体${form.heading5Font}、字号${form.heading5Size}${fmtStyle(form.heading5Bold, form.heading5Italic)}`,
      );
      ruleIdx++;
    }
    rules.push(`${ruleIdx}. 落款/署名：右对齐，字体与正文一致`);
    ruleIdx++;
    rules.push(`${ruleIdx}. 日期：右对齐，字体与正文一致`);

    // Build structured format_params JSON and embed at end for backend rule engine
    const fp = buildFormatParams(form);

    const noHeadingNote = !hasAnyHeading
      ? `- ⚠️ 本预设不包含任何标题层级，所有非标题/署名/日期段落一律设为 body（正文），不要识别或添加任何 heading 类型\n`
      : "";

    return (
      `【排版指令 — 必须严格遵守，禁止自行调整】\n` +
      `你是一个专业的公文排版引擎。请严格按照以下排版规范对文档的每个段落设置 style_type 和字体样式，不得遗漏、不得自行修改任何格式参数。\n\n` +
      `排版规范：\n${rules.join("\n")}\n\n` +
      `注意事项：\n` +
      `- 每个段落的字体、字号、加粗、斜体必须严格匹配上述规范，不得擅自使用其他字体或字号\n` +
      `- 不要修改文档的文字内容，只调整格式\n` +
      (hasAnyHeading
        ? `- 正确识别各级标题的编号格式并分配对应的 style_type\n`
        : "") +
      noHeadingNote +
      `- 落款和日期必须右对齐\n\n` +
      `<!--GOVAI_FORMAT_PARAMS:${JSON.stringify(fp)}-->`
    );
  };

  const handleAddPreset = async () => {
    if (!presetForm.name.trim()) return toast.error("预设名称不能为空");
    const sysPrompt = buildSystemPrompt(presetForm);
    const instrSummary = `${presetForm.titleSize}${presetForm.titleFont}${presetForm.titleAlign}，正文${presetForm.bodySize}${presetForm.bodyFont}，行距${presetForm.lineSpacing}`;
    const name = presetForm.name.trim();
    const category = presetForm.category || "公文写作";
    const description = presetForm.description.trim();
    const instruction = presetForm.instruction.trim() || instrSummary;
    try {
      const created = await apiCreateFormatPreset({
        name,
        category,
        description,
        instruction,
        system_prompt: sysPrompt,
      });
      const newPreset: SmartDocFormatPreset = {
        id: created.id,
        name: created.name,
        category: created.category,
        description: created.description,
        instruction: created.instruction,
        systemPrompt: created.system_prompt,
        builtIn: false,
      };
      const updated = [...formatPresets, newPreset];
      setFormatPresets(updated);
      saveCustomPresetsToStorage(updated.filter((p) => !p.builtIn));
      setPresetForm(createDefaultSmartDocPresetForm());
      setEditingPreset(null);
      toast.success("预设已添加");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "添加预设失败"));
    }
  };

  const handleUpdatePreset = async () => {
    if (!editingPreset) return;
    if (!presetForm.name.trim()) return toast.error("预设名称不能为空");
    const sysPrompt = buildSystemPrompt(presetForm);
    const instrSummary = `${presetForm.titleSize}${presetForm.titleFont}${presetForm.titleAlign}，正文${presetForm.bodySize}${presetForm.bodyFont}，行距${presetForm.lineSpacing}`;
    const name = presetForm.name.trim();
    const category = presetForm.category || "公文写作";
    const description = presetForm.description.trim();
    const instruction = presetForm.instruction.trim() || instrSummary;
    try {
      if (editingPreset.builtIn) {
        // 内置预设：在服务端创建新预设，替换本地内置项
        const created = await apiCreateFormatPreset({
          name,
          category,
          description,
          instruction,
          system_prompt: sysPrompt,
        });
        const newPreset: SmartDocFormatPreset = {
          id: created.id,
          name: created.name,
          category: created.category,
          description: created.description,
          instruction: created.instruction,
          systemPrompt: created.system_prompt,
          builtIn: false,
        };
        const updated = formatPresets.map((p) =>
          p.id === editingPreset.id ? newPreset : p,
        );
        setFormatPresets(updated);
        saveCustomPresetsToStorage(updated.filter((p) => !p.builtIn));
        if (selectedPresetId === editingPreset.id)
          setSelectedPresetId(newPreset.id);
      } else {
        await apiUpdateFormatPreset(editingPreset.id, {
          name,
          category,
          description,
          instruction,
          system_prompt: sysPrompt,
        });
        const updated = formatPresets.map((p) =>
          p.id === editingPreset.id
            ? {
                ...p,
                name,
                category,
                description,
                instruction,
                systemPrompt: sysPrompt,
              }
            : p,
        );
        setFormatPresets(updated);
        saveCustomPresetsToStorage(updated.filter((p) => !p.builtIn));
      }
      setEditingPreset(null);
      setPresetForm(createDefaultSmartDocPresetForm());
      toast.success("预设已更新");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "更新预设失败"));
    }
  };

  const handleDeletePreset = async (id: string) => {
    const target = formatPresets.find((p) => p.id === id);
    if (!target || target.builtIn) return;
    if (
      !(await confirm({
        message: `确定删除预设「${target.name}」？`,
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteFormatPreset(id);
      const updated = formatPresets.filter((p) => p.id !== id);
      setFormatPresets(updated);
      saveCustomPresetsToStorage(updated.filter((p) => !p.builtIn));
      if (selectedPresetId === id) setSelectedPresetId(null);
      toast.success("预设已删除");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "删除预设失败"));
    }
  };

  const startEditPreset = (preset: SmartDocFormatPreset) => {
    setEditingPreset(preset);
    setPresetForm({
      ...createDefaultSmartDocPresetForm(),
      name: preset.name,
      category: preset.category || "公文写作",
      description: preset.description,
      instruction: preset.instruction,
    });
  };

  /** 将内置预设复制为新自定义预设模板 */
  const copyPresetToForm = (preset: SmartDocFormatPreset) => {
    setEditingPreset(null);
    setPresetForm({
      ...createDefaultSmartDocPresetForm(),
      name: preset.name + "（副本）",
      category: preset.category || "公文写作",
      description: preset.description,
      instruction: preset.systemPrompt || preset.instruction,
    });
  };

  const cancelEditPreset = () => {
    setEditingPreset(null);
    setPresetForm(createDefaultSmartDocPresetForm());
  };

  const handlePresetFormChange = useCallback(
    (patch: Partial<SmartDocPresetForm>) => {
      setPresetForm((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleClosePresetManager = useCallback(() => {
    setShowPresetManager(false);
    cancelEditPreset();
  }, [cancelEditPreset]);

  const handleCloseOptimizeModal = useCallback(() => {
    setShowOptimizeModal(false);
  }, []);

  const handleSelectPipelineStage = useCallback(
    (index: number, stageId: string) => {
      setPipelineStage(index);
      setProcessType(stageId);
    },
    [],
  );

  /* ── 素材操作 ── */
  const insertText = useCallback(
    (text: string) => {
      if (currentDoc) {
        setCurrentDoc({
          ...currentDoc,
          content: currentDoc.content + "\n" + text,
        });
        toast.success("已插入光标处");
      }
    },
    [currentDoc, toast],
  );
  const handleSaveMaterial = useCallback(async () => {
    if (!newMat.title || !newMat.content) return toast.error("标题和内容必填");
    try {
      await apiCreateMaterial(newMat);
      await loadMaterials();
      setIsAddingMat(false);
      setNewMat({ title: "", category: "通用", content: "" });
      toast.success("素材已添加");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  }, [loadMaterials, newMat, toast]);
  const handleDeleteMaterial = useCallback(
    async (id: string) => {
      if (
        !(await confirm({
          message: "确定删除此素材？",
          variant: "danger",
          confirmText: "删除",
        }))
      )
        return;
      try {
        await apiDeleteMaterial(id);
        await loadMaterials();
        toast.success("已删除");
      } catch (err: unknown) {
        toast.error(getErrorMessage(err));
      }
    },
    [confirm, loadMaterials, toast],
  );

  const handleUseInstructionTemplate = useCallback(
    (template: SmartDocInstructionTemplate) => {
      setAiInstruction(template.content);
      toast.success(`已填入「${template.label}」`);
    },
    [toast],
  );

  const handleDeleteInstructionTemplate = useCallback(
    (templateId: string) => {
      const updated = instructionTemplates.filter(
        (item) => item.id !== templateId,
      );
      setInstructionTemplates(updated);
      saveCustomTemplates(updated.filter((item) => !item.builtIn));
      toast.success("已删除");
    },
    [instructionTemplates, toast],
  );

  const handleSaveInstructionTemplate = useCallback(() => {
    if (!newTemplate.label.trim() || !newTemplate.content.trim()) {
      toast.error("名称和内容不能为空");
      return;
    }
    const template: SmartDocInstructionTemplate = {
      id: `custom-tpl-${Date.now()}`,
      label: newTemplate.label.trim(),
      content: newTemplate.content.trim(),
      stage: newTemplate.stage,
      builtIn: false,
    };
    const updated = [...instructionTemplates, template];
    setInstructionTemplates(updated);
    saveCustomTemplates(updated.filter((item) => !item.builtIn));
    setNewTemplate({
      label: "",
      content: "",
      stage: "all",
    });
    setIsAddingTemplate(false);
    toast.success("模板已添加");
  }, [instructionTemplates, newTemplate, toast]);

  const handleTemplateDraftChange = useCallback(
    (patch: Partial<SmartDocNewTemplateDraft>) => {
      setNewTemplate((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleMaterialDraftChange = useCallback(
    (patch: Partial<SmartDocNewMaterialDraft>) => {
      setNewMat((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleJumpToPanelStage = useCallback(
    (stageId: "draft" | "review" | "format") => {
      const idx = PIPELINE_STAGES.findIndex((stage) => stage.id === stageId);
      if (idx >= 0) setPipelineStage(idx);
    },
    [],
  );

  /* ── 选择 ── */
  const toggleSelectAll = () => {
    if (selectedDocIds.size === docs.length) setSelectedDocIds(new Set());
    else setSelectedDocIds(new Set(docs.map((d) => d.id)));
  };
  const toggleSelectOne = (id: string) => {
    const s = new Set(selectedDocIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedDocIds(s);
  };

  const startCreate = () => {
    // 立即取消旧文档的自动保存定时器，防止脏数据写入
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setUploadedFile(null);
    setCurrentDoc(null);
    setProcessType("draft");
    setReviewResult(null);
    setFormatStats(null);
    setOutlineText("");
    setShowOutlinePanel(false);
    setPipelineStage(0);
    setCompletedStages(new Set());
    setRightPanel(null);
    // 清除上一份文档残留的排版数据，防止自动保存污染新文档
    setAcceptedParagraphs([]);
    setAiStructuredParagraphs([]);
    editHistoryRef.current = [];
    editIndexRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
    setStep(1);
    setView("create");
  };

  /* ── 列表视图 ── */
  if (view === "list")
    return (
      <div
        className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
        onClick={() => setActiveDropdownId(null)}
      >
        <div className="p-4 border-b bg-gray-50 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDocScope("mine")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  docScope === "mine"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Archive size={16} className="inline mr-1.5 -mt-0.5" />{" "}
                我的公文箱
              </button>
              <button
                onClick={() => setDocScope("public")}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  docScope === "public"
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Eye size={16} className="inline mr-1.5 -mt-0.5" /> 公开公文箱
              </button>
            </div>
            <div className="flex gap-2 items-center">
              {docScope === "mine" && selectedDocIds.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 bg-red-600 text-white rounded text-sm flex items-center hover:bg-red-700"
                >
                  <Trash2 size={16} className="mr-2" /> 删除选中 (
                  {selectedDocIds.size})
                </button>
              )}
              {docScope === "mine" && (
                <>
                  <div className="flex items-center gap-1">
                    <select
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-l text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="official">公文标准</option>
                      <option value="school_notice_redhead">高校红头</option>
                      <option value="academic">学术论文</option>
                      <option value="legal">法律文书</option>
                      <option value="proposal">项目建议书</option>
                      <option value="lab_fund">实验室基金</option>
                    </select>
                    <button
                      onClick={async () => {
                        try {
                          const imp = await apiImportDocument(
                            null,
                            "doc",
                            newDocType,
                            "internal",
                          );
                          const detail = await apiGetDocument(imp.id);
                          setCurrentDoc(detail);
                          setAcceptedParagraphs([]);
                          setAiStructuredParagraphs([]);
                          editHistoryRef.current = [
                            {
                              kind: "content" as const,
                              content: detail.content || "",
                            },
                          ];
                          editIndexRef.current = 0;
                          setCanUndo(false);
                          setCanRedo(false);
                          setCompletedStages(
                            inferCompletedStages(detail.status),
                          );
                          setPipelineStage(inferNextStage(detail.status));
                          setProcessType(
                            PIPELINE_STAGES[inferNextStage(detail.status)].id,
                          );
                          setStep(3);
                          setView("create");
                          loadDocs();
                          toast.success("已创建空白公文");
                        } catch (err: unknown) {
                          toast.error("创建失败: " + getErrorMessage(err));
                        }
                      }}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-r text-sm flex items-center hover:bg-green-700"
                    >
                      <FilePlus size={16} className="mr-2" /> 新建公文
                    </button>
                  </div>
                  <button
                    onClick={startCreate}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm flex items-center hover:bg-blue-700"
                  >
                    <Upload size={16} className="mr-2" /> 导入文档
                  </button>
                </>
              )}
              <button
                onClick={handleExport}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50"
              >
                <Download size={16} className="mr-2" /> 导出ZIP
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="relative col-span-1 lg:col-span-1">
              <Search
                size={14}
                className="absolute left-2.5 top-2.5 text-gray-400"
              />
              <input
                className="w-full pl-8 pr-2 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="标题关键词..."
                value={filters.keyword}
                onChange={(e) =>
                  setFilters({ ...filters, keyword: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-1 col-span-1 lg:col-span-2">
              <input
                type="date"
                className="w-full p-1.5 border rounded text-xs outline-none"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                className="w-full p-1.5 border rounded text-xs outline-none"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.security}
              onChange={(e) =>
                setFilters({ ...filters, security: e.target.value })
              }
            >
              {SECURITY_OPTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              {DOC_STATUS_OPTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value ? t.label : "状态：全部"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-white text-gray-500 border-b sticky top-0 z-10">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={
                      docs.length > 0 && selectedDocIds.size === docs.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  标题
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  类型
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  可见性
                </th>
                {docScope === "public" && (
                  <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                    创建者
                  </th>
                )}
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  状态
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  更新时间
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider w-24">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className={`hover:bg-blue-50/30 group transition-colors ${selectedDocIds.has(d.id) ? "bg-blue-50/50" : ""}`}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedDocIds.has(d.id)}
                      onChange={() => toggleSelectOne(d.id)}
                    />
                  </td>
                  <td className="p-4 font-medium text-gray-800">
                    <div className="flex items-center">
                      <FileText
                        size={16}
                        className="mr-2 text-gray-400 group-hover:text-blue-500 transition-colors"
                      />
                      <span
                        className="cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => openDoc(d)}
                      >
                        {d.title}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">
                      {DOC_TYPE_MAP[d.doc_type] || d.doc_type}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        d.visibility === "public"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {VISIBILITY_MAP[d.visibility] || d.visibility}
                    </span>
                  </td>
                  {docScope === "public" && (
                    <td className="p-4 text-gray-500 text-xs">
                      {d.creator_name || "未知"}
                    </td>
                  )}
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusCls(d.status)}`}
                    >
                      {DOC_STATUS_MAP[d.status] || d.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 text-xs">
                    {new Date(d.updated_at).toLocaleString()}
                  </td>
                  <td className="p-4 relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(
                          activeDropdownId === d.id ? null : d.id,
                        );
                      }}
                      className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {activeDropdownId === d.id && (
                      <div className="absolute right-4 top-10 w-36 bg-white border rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          onClick={() => openDoc(d)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          <Eye size={14} className="mr-2" />{" "}
                          {docScope === "public" ? "查看" : "编辑"}
                        </button>
                        {docScope === "mine" && (
                          <>
                            <button
                              onClick={() => {
                                openDoc(d);
                                setTimeout(() => {
                                  setPipelineStage(0);
                                  setProcessType("draft");
                                }, 100);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 flex items-center"
                            >
                              <PenTool size={14} className="mr-2" /> 起草
                            </button>
                            <button
                              onClick={() => {
                                openDoc(d);
                                setTimeout(() => {
                                  setPipelineStage(1);
                                  setProcessType("review");
                                }, 100);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-gray-100 flex items-center"
                            >
                              <ShieldAlert size={14} className="mr-2" /> 审查
                            </button>
                            <button
                              onClick={() => {
                                openDoc(d);
                                setTimeout(() => {
                                  setPipelineStage(2);
                                  setProcessType("format");
                                }, 100);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-purple-600 hover:bg-gray-100 flex items-center"
                            >
                              <Settings2 size={14} className="mr-2" /> 格式化
                            </button>
                            {(canPublishDoc ||
                              currentUser?.permissions?.includes(
                                "sys:user:manage",
                              )) && (
                              <button
                                onClick={async () => {
                                  setActiveDropdownId(null);
                                  const newVis =
                                    d.visibility === "public"
                                      ? "private"
                                      : "public";
                                  try {
                                    await apiToggleDocVisibility(d.id, newVis);
                                    toast.success(
                                      newVis === "public"
                                        ? "已设为公开"
                                        : "已设为私密",
                                    );
                                    loadDocs();
                                  } catch (err: unknown) {
                                    toast.error(getErrorMessage(err));
                                  }
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-teal-600 hover:bg-gray-100 flex items-center"
                              >
                                <Eye size={14} className="mr-2" />{" "}
                                {d.visibility === "public"
                                  ? "设为私密"
                                  : "设为公开"}
                              </button>
                            )}
                            <button
                              onClick={() => handleArchive(d)}
                              className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-gray-100 flex items-center"
                            >
                              <Archive size={14} className="mr-2" /> 归档
                            </button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button
                              onClick={() => handleDelete(d.id)}
                              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 flex items-center"
                            >
                              <Trash2 size={14} className="mr-2" /> 删除
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {docs.length === 0 && (
            <EmptyState
              icon={FileText}
              title={docScope === "public" ? "暂无公开公文" : "暂无公文"}
              desc={
                docScope === "public"
                  ? "目前没有已公开的公文"
                  : "请点击「新建空白公文」或「导入文档」开始处理"
              }
              action={null}
            />
          )}
        </div>

        <SmartDocOptimizeModal
          open={showOptimizeModal}
          targetTitle={optimizeTarget?.title}
          kbCollections={kbCollections}
          selectedKbId={selectedOptimizeKb}
          onKbChange={setSelectedOptimizeKb}
          onClose={handleCloseOptimizeModal}
          onConfirm={handleConfirmOptimize}
        />
        {ConfirmDialog}
      </div>
    );

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      <SmartDocHeader
        currentDoc={currentDoc}
        isReadOnly={isReadOnly}
        statusClassName={currentDoc ? statusCls(currentDoc.status) : ""}
        rightPanel={rightPanel}
        showVersionHistory={showVersionHistory}
        canUndo={canUndo}
        canRedo={canRedo}
        autoSaveEnabled={autoSaveEnabled}
        lastSavedAt={lastSavedAt}
        displayParagraphCount={displayParagraphs.length}
        onBack={handleBackToList}
        onTitleInput={handleTitleInput}
        onTitleCommit={handleTitleCommit}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={saveDoc}
        onToggleAutoSave={handleToggleAutoSave}
        onToggleMaterialPanel={handleToggleMaterialPanel}
        onOpenVersionHistory={handleOpenVersionHistory}
        onDownloadFormatted={handleDownloadFormatted}
        onDownloadPdf={handleDownloadPdf}
        onOpenExportPreview={() => setShowExportPreview(true)}
      />

      {/* ── 流水线步骤条（仅在编辑器视图且非只读时显示） ── */}
      {step === 3 && currentDoc && !isReadOnly && (
        <SmartDocPipelineStepper
          stages={PIPELINE_STAGES}
          activeStageIndex={pipelineStage}
          completedStages={completedStages}
          onSelectStage={handleSelectPipelineStage}
        />
      )}

      {/* ── 主内容区 ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto bg-slate-100 p-6 flex justify-center items-start">
          {/* === Step 1: 导入文档 === */}
          {step === 1 && (
            <SmartDocImportPanel
              uploadedFile={uploadedFile}
              isDragOver={isDragOver}
              isProcessing={isProcessing}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFileUpload={handleFileUpload}
              onImport={handleImportCurrentFile}
            />
          )}

          {/* === Step 3: 流水线编辑器 === */}
          {step === 3 && currentDoc && (
            <div className="w-full max-w-4xl flex flex-col gap-4 animate-in fade-in duration-300">
              {/* 当前阶段操作面板（含对话式 AI 输入）— 仅所有者可见 */}

              {!isReadOnly && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const stage = PIPELINE_STAGES[pipelineStage];
                        const Icon = stage?.icon || FileText;
                        return (
                          <>
                            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                              <Icon size={20} />
                            </div>
                            <div>
                              <div className="font-bold text-gray-800 text-sm">
                                {stage?.label || "处理"} — {stage?.desc || ""}
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {completedStages.has(pipelineStage)
                                  ? "✓ 此步骤已完成，可重新执行或继续下一步"
                                  : "在下方输入处理要求，AI 将流式输出结果"}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadSource}
                        disabled={!currentDoc.has_source_file}
                        className="px-2.5 py-1.5 text-sm text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          currentDoc.has_source_file
                            ? "下载源文件"
                            : "暂无源文件"
                        }
                      >
                        <Download size={14} /> 下载
                      </button>
                      <button
                        onClick={() => handleArchive(currentDoc)}
                        className="px-2.5 py-1.5 text-sm text-green-700 border border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-1"
                        title="归档"
                      >
                        <Archive size={14} /> 归档
                      </button>
                      <div className="h-6 w-px bg-gray-200 mx-1" />
                      {pipelineStage > 0 && (
                        <button
                          onClick={() => {
                            setPipelineStage(pipelineStage - 1);
                            setProcessType(
                              PIPELINE_STAGES[pipelineStage - 1].id,
                            );
                            resetStreamingText();
                            setAiStructuredParagraphs([]);
                          }}
                          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                        >
                          <ArrowLeft size={14} /> 上一步
                        </button>
                      )}
                      {pipelineStage < 2 && (
                        <button
                          onClick={() => {
                            setPipelineStage(pipelineStage + 1);
                            setProcessType(
                              PIPELINE_STAGES[pipelineStage + 1].id,
                            );
                            resetStreamingText();
                            setAiStructuredParagraphs([]);
                          }}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1"
                        >
                          下一步 <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* AI 对话输入区 */}
                  <div className="p-4 space-y-3">
                    {/* 起草阶段：知识库引用选择器 */}
                    {pipelineStage === 0 && kbCollections.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs text-gray-500 font-medium">
                          引用知识库（可选，点击展开可选择具体文章）
                        </span>
                        <div className="space-y-1.5">
                          {kbCollections
                            .filter((c) => c.dify_dataset_id)
                            .map((c) => {
                              const isSelected = selectedDraftKbIds.includes(
                                c.id,
                              );
                              const isExpanded = expandedKbCollections.has(
                                c.id,
                              );
                              const files = kbCollectionFiles[c.id] || [];
                              const isLoadingFiles = loadingKbFiles.has(c.id);
                              const selectedFileCount = files.filter((f) =>
                                selectedKbFileIds.includes(f.id),
                              ).length;
                              return (
                                <div
                                  key={c.id}
                                  className="border rounded-lg overflow-hidden"
                                >
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() =>
                                        toggleKbCollectionExpand(c.id)
                                      }
                                      disabled={isAiProcessing}
                                      className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                      title="展开查看文件"
                                    >
                                      <ChevronDown
                                        size={12}
                                        className={`transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                                      />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedDraftKbIds((prev) =>
                                            prev.filter((id) => id !== c.id),
                                          );
                                          // 取消选中集合时也清除该集合下的文件选择
                                          const fileIds = files.map(
                                            (f) => f.id,
                                          );
                                          setSelectedKbFileIds((prev) =>
                                            prev.filter(
                                              (id) => !fileIds.includes(id),
                                            ),
                                          );
                                        } else {
                                          setSelectedDraftKbIds((prev) => [
                                            ...prev,
                                            c.id,
                                          ]);
                                        }
                                      }}
                                      disabled={isAiProcessing}
                                      className={`flex-1 px-2 py-1.5 text-xs flex items-center gap-1.5 transition-all ${
                                        isSelected
                                          ? "text-emerald-700 font-medium"
                                          : "text-gray-600 hover:text-emerald-600"
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                      title={c.description || c.name}
                                    >
                                      <BookOpen size={12} />
                                      {c.name}
                                      {c.file_count > 0 && (
                                        <span className="text-[10px] text-gray-400">
                                          ({c.file_count}篇)
                                        </span>
                                      )}
                                      {selectedFileCount > 0 && (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 rounded-full">
                                          已选{selectedFileCount}篇
                                        </span>
                                      )}
                                      {isSelected && !selectedFileCount && (
                                        <Check
                                          size={12}
                                          className="text-emerald-600"
                                        />
                                      )}
                                    </button>
                                  </div>
                                  {isExpanded && (
                                    <div className="border-t bg-gray-50 px-2 py-1.5 max-h-40 overflow-y-auto">
                                      {isLoadingFiles ? (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-400 py-1">
                                          <Loader2
                                            size={12}
                                            className="animate-spin"
                                          />{" "}
                                          加载文件列表...
                                        </div>
                                      ) : files.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-1">
                                          暂无已索引文件
                                        </div>
                                      ) : (
                                        <div className="space-y-0.5">
                                          {files.map((f) => {
                                            const isFileSelected =
                                              selectedKbFileIds.includes(f.id);
                                            return (
                                              <label
                                                key={f.id}
                                                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-all ${
                                                  isFileSelected
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "hover:bg-white text-gray-600"
                                                }`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={isFileSelected}
                                                  onChange={() =>
                                                    toggleKbFileSelection(
                                                      f.id,
                                                      c.id,
                                                    )
                                                  }
                                                  disabled={isAiProcessing}
                                                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <FileText
                                                  size={11}
                                                  className="shrink-0"
                                                />
                                                <span
                                                  className="truncate flex-1"
                                                  title={f.name}
                                                >
                                                  {f.name}
                                                </span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                        {(selectedDraftKbIds.length > 0 ||
                          selectedKbFileIds.length > 0) && (
                          <div className="text-[11px] text-gray-400 bg-emerald-50 rounded-lg px-3 py-1.5 border border-dashed border-emerald-200">
                            {selectedKbFileIds.length > 0
                              ? `已选 ${selectedKbFileIds.length} 篇指定文章，AI 起草时将直接参考其完整内容`
                              : `已选 ${selectedDraftKbIds.length} 个知识库，AI 起草时将检索相关内容作为参考`}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 起草阶段：标题层级选择 */}
                    {pipelineStage === 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                          标题层级
                        </span>
                        <select
                          value={draftHeadingLevel}
                          onChange={(e) =>
                            setDraftHeadingLevel(Number(e.target.value))
                          }
                          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          <option value={-1}>默认（AI 自动判断）</option>
                          <option value={0}>
                            纯正文（无标题，适用于请示件等）
                          </option>
                          <option value={1}>最多一级标题（一、二、三）</option>
                          <option value={2}>
                            最多二级标题（一、（一）（二））
                          </option>
                          <option value={3}>
                            最多三级标题（一、（一）、1.）
                          </option>
                          <option value={4}>
                            最多四级标题（一、（一）、1.、(1)）
                          </option>
                        </select>
                      </div>
                    )}

                    {/* 格式化阶段：排版格式选择器 */}
                    {pipelineStage === 2 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 font-medium">
                            排版格式
                          </span>
                          <button
                            onClick={() => setShowPresetManager(true)}
                            className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 transition"
                          >
                            <Settings2 size={12} /> 管理预设
                          </button>
                        </div>
                        {/* 分类筛选标签 */}
                        <div className="flex gap-1.5 flex-wrap">
                          {SMART_DOC_FORMAT_PRESET_CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => {
                                setPresetCategoryFilter(cat);
                                // #14 切换分类时，若已选预设不在新分类下则重置
                                if (cat !== "全部" && selectedPresetId) {
                                  const cur = formatPresets.find(
                                    (p) => p.id === selectedPresetId,
                                  );
                                  if (cur && cur.category !== cat)
                                    setSelectedPresetId(null);
                                }
                              }}
                              className={`px-2.5 py-1 text-[11px] rounded-md border transition ${
                                presetCategoryFilter === cat
                                  ? "bg-gray-800 text-white border-gray-800"
                                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                        {/* 下拉选择器 */}
                        <select
                          value={selectedPresetId || ""}
                          onChange={(e) =>
                            setSelectedPresetId(e.target.value || null)
                          }
                          disabled={isAiProcessing}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:bg-gray-50 cursor-pointer"
                        >
                          <option value="">
                            — 不使用预设，手动输入排版要求 —
                          </option>
                          {SMART_DOC_FORMAT_PRESET_CATEGORIES.filter(
                            (c) => c !== "全部",
                          ).map((cat) => {
                            const catPresets = formatPresets.filter((p) =>
                              presetCategoryFilter === "全部" ||
                              presetCategoryFilter === cat
                                ? p.category === cat
                                : false,
                            );
                            if (!catPresets.length) return null;
                            return (
                              <optgroup key={cat} label={cat}>
                                {catPresets.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} — {p.description}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {/* 已选预设简要说明（不展示隐藏的 systemPrompt） */}
                        {selectedPreset && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-700">
                                {selectedPreset.name}
                              </span>
                              <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                                {selectedPreset.category}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500 leading-relaxed">
                              {selectedPreset.instruction}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 格式化阶段：进度条 + 排版建议 */}
                    {pipelineStage === 2 && (
                      <div className="space-y-2">
                        {/* 排版进度条 */}
                        {formatProgress && isAiProcessing && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-blue-600 font-medium">
                                排版进度：第 {formatProgress.current}/
                                {formatProgress.total} 部分
                              </span>
                              <span className="text-gray-500 font-mono">
                                {formatProgress.percent}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${formatProgress.percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {/* #19: 规则引擎 + LLM 混合排版统计 */}
                        {formatStats && !isAiProcessing && (
                          <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 space-y-1">
                            <div className="flex items-center gap-2 font-medium">
                              <span>📊 排版方式统计</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 border border-green-200 rounded text-green-700">
                                ⚡ 规则引擎 {formatStats.rule_count} 段
                              </span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 border border-purple-200 rounded text-purple-700">
                                🤖 LLM {formatStats.llm_count} 段
                              </span>
                              {formatStats.low_confidence > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 border border-amber-200 rounded text-amber-700">
                                  ⚠ 低置信度 {formatStats.low_confidence} 段
                                </span>
                              )}
                            </div>
                            {formatStats.low_confidence > 0 && (
                              <button
                                onClick={() => {
                                  setAiInstruction(
                                    "请重新检查低置信度段落的排版样式",
                                  );
                                  handleAiProcess();
                                }}
                                disabled={isAiProcessing}
                                className="mt-1 px-2 py-1 text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-800 rounded border border-amber-300 transition-colors"
                              >
                                🔄 AI 复检低置信度段落
                              </button>
                            )}
                          </div>
                        )}
                        {/* 排版建议按钮 */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleFormatSuggest}
                            disabled={
                              isAiProcessing ||
                              isFormatSuggesting ||
                              !currentDoc?.content?.trim()
                            }
                            className="px-3 py-1.5 rounded-lg text-xs border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                          >
                            {isFormatSuggesting ? (
                              <Loader2 className="animate-spin" size={13} />
                            ) : (
                              <Lightbulb size={13} />
                            )}
                            {isFormatSuggesting ? "分析中…" : "排版建议"}
                          </button>
                          {formatSuggestResult && (
                            <button
                              onClick={() =>
                                setShowFormatSuggestPanel(
                                  !showFormatSuggestPanel,
                                )
                              }
                              className="px-2 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-1"
                            >
                              <Eye size={12} />
                              {showFormatSuggestPanel ? "隐藏" : "查看"}建议 (
                              {formatSuggestions.length})
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <MessageSquare
                          size={16}
                          className="absolute left-3 top-3 text-gray-400"
                        />
                        <textarea
                          value={aiInstruction}
                          onChange={(e) => setAiInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleAiProcess();
                            }
                          }}
                          placeholder={
                            pipelineStage === 0
                              ? "描述您的公文起草需求，例如：请起草一份关于数字化转型的通知..."
                              : pipelineStage === 1
                                ? "描述审查重点，例如：请重点检查错别字、标点符号和政策法规合规性..."
                                : selectedPreset
                                  ? `已选「${selectedPreset.name}」，可在此补充额外排版要求（可留空直接发送）...`
                                  : "选择排版格式预设，或直接描述排版需求，如：「这是一份通知，请按公文标准排版」..."
                          }
                          disabled={isAiProcessing}
                          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                          rows={2}
                        />
                      </div>
                      <button
                        onClick={handleAiProcess}
                        disabled={isAiProcessing}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm self-end"
                      >
                        {isAiProcessing ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Send size={16} />
                        )}
                        {isAiProcessing ? "处理中" : "发送"}
                      </button>
                      {isAiProcessing && (
                        <button
                          onClick={() => {
                            if (aiAbortRef.current) {
                              aiAbortRef.current.abort();
                              aiAbortRef.current = null;
                            }
                          }}
                          className="px-3 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-1.5 shadow-sm self-end transition-colors"
                          title="停止 AI 处理"
                        >
                          <StopCircle size={16} />
                          停止
                        </button>
                      )}
                      {aiLockConflict && !isAiProcessing && currentDoc && (
                        <button
                          onClick={async () => {
                            try {
                              await apiReleaseAiLock(currentDoc!.id);
                              setAiLockConflict(false);
                              toast.success("AI 处理锁已释放，可以重新操作");
                            } catch (error: unknown) {
                              toast.error(
                                "解锁失败: " + getErrorMessage(error),
                              );
                            }
                          }}
                          className="px-3 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center gap-1.5 shadow-sm self-end transition-colors"
                          title="强制解除 AI 处理锁"
                        >
                          <AlertTriangle size={16} />
                          解锁
                        </button>
                      )}
                    </div>

                    <SmartDocAssistPanels
                      showOutlinePanel={showOutlinePanel}
                      outlineText={outlineText}
                      showFormatSuggestPanel={showFormatSuggestPanel}
                      formatSuggestions={formatSuggestions}
                      isFormatSuggesting={isFormatSuggesting}
                      formatSuggestResult={formatSuggestResult}
                      formatSuggestParas={formatSuggestParas}
                      toast={toast}
                      onOutlineChange={setOutlineText}
                      onConfirmOutline={handleConfirmOutline}
                      onRegenerateOutline={() => {
                        setOutlineText("");
                        setShowOutlinePanel(false);
                        handleAiProcess();
                      }}
                      onSkipOutline={() => {
                        setShowOutlinePanel(false);
                        setOutlineText("");
                      }}
                      onCloseFormatSuggest={() =>
                        setShowFormatSuggestPanel(false)
                      }
                      onReplaceAiInstruction={handleApplyAllFormatSuggestions}
                      onAppendAiInstruction={handleAppendFormatSuggestion}
                      onApplyFormatSuggestParas={handleApplyFormatSuggestParas}
                    />

                    <SmartDocAiStatusPanel
                      aiReasoningText={aiReasoningText}
                      isAiThinking={isAiThinking}
                      showReasoningPanel={showReasoningPanel}
                      processingLog={processingLog}
                      aiStructuredParagraphs={aiStructuredParagraphs}
                      isAiProcessing={isAiProcessing}
                      kbReferences={kbReferences}
                      aiOutputRef={aiOutputRef}
                      onToggleReasoningPanel={() =>
                        setShowReasoningPanel((prev) => !prev)
                      }
                    />

                    {/* 快捷操作：跳过 */}
                    <div className="flex items-center gap-2 pt-1">
                      {!completedStages.has(pipelineStage) &&
                        pipelineStage < 2 && (
                          <button
                            onClick={() => {
                              setPipelineStage(pipelineStage + 1);
                              setProcessType(
                                PIPELINE_STAGES[pipelineStage + 1].id,
                              );
                              resetStreamingText();
                              setAiStructuredParagraphs([]);
                              setProcessingLog([]);
                              setKbReferences([]);
                            }}
                            className="px-4 py-2 text-gray-400 border rounded-lg text-xs hover:bg-gray-50 flex items-center gap-1"
                          >
                            <SkipForward size={14} /> 跳过此步
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {/* 编辑器 */}
              <div className="bg-white rounded-xl shadow-sm border flex-1 min-h-[400px] flex flex-col">
                <SmartDocEditorHeader
                  aiStructuredParagraphs={aiStructuredParagraphs}
                  acceptedParagraphs={acceptedParagraphs}
                  displayParagraphs={displayParagraphs}
                  isAiProcessing={isAiProcessing}
                  currentDocContentLength={(currentDoc.content || "").length}
                  onAcceptAll={handleAcceptAll}
                  onRejectAll={handleRejectAll}
                  onApplyAiResult={handleApplyAiResult}
                />
                <SmartDocEditorViewport
                  aiStructuredParagraphs={aiStructuredParagraphs}
                  acceptedParagraphs={acceptedParagraphs}
                  currentDocType={currentDoc.doc_type}
                  isAiProcessing={isAiProcessing}
                  isReadOnly={isReadOnly}
                  pipelineStage={pipelineStage}
                  aiStreamingText={aiStreamingText}
                  editableContentHtml={editableContentHtml}
                  plainContent={currentDoc.content || ""}
                  renderRichContent={(content, plain) => (
                    <RichContentRenderer content={content} plain={plain} />
                  )}
                  onAiParagraphsChange={(updated) => {
                    setAiStructuredParagraphs(updated);
                    pushSnapshot({ kind: "ai", paragraphs: updated });
                    syncParagraphsToContent(updated);
                  }}
                  onAcceptedParagraphsChange={(updated) => {
                    setAcceptedParagraphs(updated);
                    setParagraphPhase("editing");
                    pushSnapshot({
                      kind: "accepted",
                      paragraphs: updated,
                    });
                    syncParagraphsToContent(updated);
                  }}
                  onAcceptChange={handleAcceptChange}
                  onRejectChange={handleRejectChange}
                  onPlainFocus={() => {
                    // focus tracking handled by SmartDocEditorViewport internally
                  }}
                  onPlainInput={(e) => {
                    const el = e.currentTarget as DebouncedEditableElement;
                    if (el._debounceTimer) {
                      clearTimeout(el._debounceTimer);
                    }
                    el._debounceTimer = setTimeout(() => {
                      const newText = el.textContent || "";
                      setCurrentDoc((prev) =>
                        prev ? { ...prev, content: newText } : prev,
                      );
                    }, 300);
                  }}
                  onPlainBlur={(e) => {
                    const newText = e.currentTarget.textContent || "";
                    if (newText !== currentDoc.content) {
                      setCurrentDoc({ ...currentDoc, content: newText });
                      pushContentHistory(newText);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧面板（素材库）── */}
        {rightPanel === "material" && currentDoc && (
          <SmartDocSidePanel
            canManageMaterial={canManageMaterial}
            materialTab={materialTab}
            currentStageId={currentPipelineStage.id}
            currentStageLabel={currentPipelineStage.label}
            instructionTemplates={instructionTemplates}
            isAddingTemplate={isAddingTemplate}
            newTemplate={newTemplate}
            materials={materials}
            matSearch={matSearch}
            matCategory={matCategory}
            isAddingMat={isAddingMat}
            newMat={newMat}
            onClose={() => setRightPanel(null)}
            onMaterialTabChange={setMaterialTab}
            onJumpToStage={handleJumpToPanelStage}
            onUseTemplate={handleUseInstructionTemplate}
            onDeleteTemplate={handleDeleteInstructionTemplate}
            onStartAddingTemplate={() => setIsAddingTemplate(true)}
            onCancelAddingTemplate={() => setIsAddingTemplate(false)}
            onNewTemplateChange={handleTemplateDraftChange}
            onSaveTemplate={handleSaveInstructionTemplate}
            onMatSearchChange={setMatSearch}
            onMatCategoryChange={setMatCategory}
            onStartAddingMaterial={() => setIsAddingMat(true)}
            onUseMaterial={insertText}
            onDeleteMaterial={handleDeleteMaterial}
            onNewMaterialChange={handleMaterialDraftChange}
            onSaveMaterial={handleSaveMaterial}
            onCancelAddingMaterial={() => setIsAddingMat(false)}
          />
        )}
      </div>

      {/* 格式预设管理弹窗 */}
      <SmartDocPresetManager
        open={showPresetManager}
        formatPresets={formatPresets}
        editingPreset={editingPreset}
        presetForm={presetForm}
        onClose={handleClosePresetManager}
        onPresetFormChange={handlePresetFormChange}
        onAddPreset={handleAddPreset}
        onUpdatePreset={handleUpdatePreset}
        onCancelEdit={cancelEditPreset}
        onEditPreset={startEditPreset}
        onCopyPreset={copyPresetToForm}
        onDeletePreset={handleDeletePreset}
      />

      <SmartDocDialogs
        toast={toast}
        currentDoc={currentDoc}
        displayParagraphs={displayParagraphs}
        showVersionHistory={showVersionHistory}
        versionList={versionList}
        isLoadingVersions={isLoadingVersions}
        previewVersionId={previewVersionId}
        previewVersionContent={previewVersionContent}
        isLoadingPreview={isLoadingPreview}
        restoreConfirmVersion={restoreConfirmVersion}
        showExportPreview={showExportPreview}
        onCloseVersionHistory={handleCloseVersionHistory}
        onPreviewVersion={handlePreviewVersion}
        onRequestRestoreVersion={handleRestoreVersion}
        onCancelRestoreVersion={() => setRestoreConfirmVersion(null)}
        onConfirmRestoreVersion={doRestoreVersion}
        onCloseExportPreview={() => setShowExportPreview(false)}
        onDownloadFormatted={handleDownloadFormatted}
        onDownloadPdf={handleDownloadPdf}
      />
      {ConfirmDialog}
    </div>
  );
};
