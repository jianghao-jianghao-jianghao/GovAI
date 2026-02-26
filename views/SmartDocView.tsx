import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  FileText,
  Sparkles,
  ChevronRight,
  Save,
  BookOpen,
  FileCheck,
  CloudUpload,
  Upload,
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
  apiAiProcess,
  apiListMaterials,
  apiCreateMaterial,
  apiDeleteMaterial,
  apiListCollections,
  apiListDocVersions,
  apiGetDocVersion,
  apiRestoreDocVersion,
  apiExportFormattedDocx,
  apiExportFormattedPdf,
  DOC_STATUS_MAP,
  DOC_TYPE_MAP,
  SECURITY_MAP,
  URGENCY_MAP,
  type DocListItem,
  type DocDetail,
  type Material,
  type KBCollection,
  type AiProcessChunk,
  type DocVersion,
} from "../api";
import { EmptyState, Modal } from "../components/ui";
import {
  StructuredDocRenderer,
  type StructuredParagraph,
} from "../components/StructuredDocRenderer";

/* ── 常量 ── */
const DOC_TYPES = [
  { value: "", label: "格式类型：全部" },
  { value: "official", label: "公文标准" },
  { value: "academic", label: "学术论文" },
  { value: "legal", label: "法律文书" },
  { value: "custom", label: "自定义" },
];
const SECURITY_OPTS = [
  { value: "", label: "密级：全部" },
  { value: "public", label: "公开" },
  { value: "internal", label: "内部" },
  { value: "secret", label: "秘密" },
  { value: "confidential", label: "机密" },
];
const DOC_STATUS_OPTS = [
  { value: "", label: "状态：全部" },
  { value: "draft", label: "草稿" },
  { value: "reviewed", label: "已审查" },
  { value: "formatted", label: "已格式化" },
  { value: "archived", label: "已归档" },
];

/* ── 流水线阶段定义 ── */
const PIPELINE_STAGES = [
  {
    id: "draft",
    label: "起草",
    icon: PenTool,
    desc: "AI辅助起草公文内容",
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

/* ── 格式化预设管理 ── */
interface FormatPreset {
  id: string;
  name: string;
  description: string;
  instruction: string;
  builtIn: boolean;
}

const BUILTIN_FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "gbt-official",
    name: "GB/T 9704 公文标准",
    description: "党政机关公文格式国家标准，适用于各级行政机关正式发文",
    instruction:
      "请严格按照 GB/T 9704-2012《党政机关公文格式》排版：标题用二号方正小标宋体居中，主送机关三号仿宋顶格，正文三号仿宋体、首行缩进2字符、行距28磅，一级标题三号黑体、二级标题三号楷体，成文日期右对齐用阿拉伯数字，页边距上3.7cm下3.5cm左2.8cm右2.6cm。",
    builtIn: true,
  },
  {
    id: "red-header",
    name: "红头文件",
    description: "带有红色机关标志的正式文件格式",
    instruction:
      "请按红头文件格式排版：发文机关标志用红色二号方正小标宋体居中排列、上边缘至版心上边缘35mm，红色分隔线宽度与版心等宽，标题二号方正小标宋体居中红色，份号六位阿拉伯数字顶格，密级三号黑体顶格，正文三号仿宋体。",
    builtIn: true,
  },
  {
    id: "meeting-minutes",
    name: "会议纪要",
    description: "内部会议记录与决议的标准格式",
    instruction:
      '请按会议纪要格式排版：标题由"XXXX会议纪要"组成用二号方正小标宋体居中，会议时间/地点/出席人员等用三号仿宋列出，正文三号仿宋体首行缩进2字符，议题编号用一、二、三标注三号黑体，决议事项加粗标注。',
    builtIn: true,
  },
  {
    id: "academic-paper",
    name: "学术论文格式",
    description: "适用于学术期刊投稿或学位论文的排版格式",
    instruction:
      "请按学术论文标准排版：标题三号黑体居中，作者信息小四号宋体居中，摘要/关键词五号楷体带标签加粗，正文五号宋体首行缩进2字符行距1.5倍，一级标题四号黑体、二级标题小四号黑体，参考文献小五号宋体悬挂缩进。",
    builtIn: true,
  },
  {
    id: "legal-document",
    name: "法律文书",
    description: "法院判决书、律师函等法律文件的标准格式",
    instruction:
      "请按法律文书格式排版：标题二号宋体加粗居中，案号小四号宋体居中，当事人信息四号仿宋体，正文四号仿宋体首行缩进2字符行距28磅，法条引用加粗标注，结论性段落加粗，落款右对齐四号仿宋。",
    builtIn: true,
  },
  {
    id: "notification",
    name: "通知/通报",
    description: "单位内部通知、通报类文件的格式",
    instruction:
      '请按通知格式排版：标题用二号方正小标宋体居中（含"关于…的通知"），主送单位三号仿宋顶格后加冒号，正文三号仿宋首行缩进2字符，事项编号用（一）（二）三号楷体加粗，附件列表在正文后空一行标注，落款右对齐。',
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

function loadCustomPresets(): FormatPreset[] {
  try {
    const raw = localStorage.getItem(FORMAT_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCustomPresets(presets: FormatPreset[]) {
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

  // 加粗 / 斜体
  html = html.replace(
    /\*\*\*(.+?)\*\*\*/g,
    '<strong style="font-weight:bold"><em style="font-style:italic">$1</em></strong>',
  );
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="font-weight:bold;color:#1a1a1a">$1</strong>',
  );
  html = html.replace(
    /\*(.+?)\*/g,
    '<em style="font-style:italic;color:#333">$1</em>',
  );

  // 删除线
  html = html.replace(
    /~~(.+?)~~/g,
    '<del style="text-decoration:line-through;color:#999">$1</del>',
  );

  // 行内代码
  html = html.replace(
    /`([^`]+)`/g,
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
const RichContentRenderer = ({
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
        if (typeof parsed === "object" && parsed !== null) {
          const lines: string[] = [];
          if (parsed.request_more && Array.isArray(parsed.request_more)) {
            lines.push("**AI 需要更多信息来完成任务：**");
            parsed.request_more.forEach((item: any) => {
              if (typeof item === "string") lines.push(`- ${item}`);
            });
          }
          if (parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
            parsed.paragraphs.forEach((p: any) => {
              if (typeof p === "string" && p.trim()) lines.push(p);
              else if (p && p.text) lines.push(p.text);
            });
          }
          if (parsed.message && typeof parsed.message === "string") {
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const SmartDocView = ({
  toast,
  currentUser,
}: {
  toast: any;
  currentUser: any;
}) => {
  const [view, setView] = useState<"list" | "create">("list");

  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [currentDoc, setCurrentDoc] = useState<DocDetail | null>(null);
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

  // Editor State
  const [step, setStep] = useState(1);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(
    new Set(),
  );
  const [formatStats, setFormatStats] = useState<any>(null);
  const [rightPanel, setRightPanel] = useState<string | null>(null);
  const [materialTab, setMaterialTab] = useState<"material" | "templates">(
    "templates",
  );
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matSearch, setMatSearch] = useState("");
  const [matCategory, setMatCategory] = useState("全部");
  const [reviewResult, setReviewResult] = useState<any>(null);
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
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const aiOutputRef = useRef<HTMLDivElement>(null);
  const needsMoreInfoRef = useRef(false);
  const [processingLog, setProcessingLog] = useState<
    { type: "status" | "error" | "info"; message: string; ts: number }[]
  >([]);

  // 格式化预设管理
  const [formatPresets, setFormatPresets] = useState<FormatPreset[]>(() => [
    ...BUILTIN_FORMAT_PRESETS,
    ...loadCustomPresets(),
  ]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [editingPreset, setEditingPreset] = useState<FormatPreset | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    description: "",
    instruction: "",
  });

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
      if (
        snapshot.kind === "content" &&
        (last as any).content === snapshot.content
      )
        return;
      if (
        snapshot.kind !== "content" &&
        (last as any).paragraphs === (snapshot as any).paragraphs
      )
        return;
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

  /* ── 变更追踪：接受 / 拒绝单条变更 ── */

  /** 接受单条变更（idx = validParagraphs 索引，对齐到 aiStructuredParagraphs） */
  const handleAcceptChange = useCallback((idx: number) => {
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

      if (para._change === "deleted") {
        // 接受删除 → 从数组中移除
        return prev.filter((_, i) => i !== origIdx);
      }
      // added / modified → 清除变更标记，保留内容
      return prev.map((p, i) =>
        i === origIdx
          ? {
              ...p,
              _change: undefined,
              _original_text: undefined,
              _change_reason: undefined,
            }
          : p,
      );
    });
  }, []);

  /** 拒绝单条变更 */
  const handleRejectChange = useCallback((idx: number) => {
    setAiStructuredParagraphs((prev) => {
      const validToOrig: number[] = [];
      prev.forEach((p, i) => {
        if ((p.text ?? "").toString().trim().length > 0) validToOrig.push(i);
      });
      const origIdx = validToOrig[idx];
      if (origIdx == null) return prev;
      const para = prev[origIdx];
      if (!para._change) return prev;

      if (para._change === "added") {
        // 拒绝新增 → 移除
        return prev.filter((_, i) => i !== origIdx);
      }
      if (para._change === "deleted") {
        // 拒绝删除 → 保留段落，清除标记
        return prev.map((p, i) =>
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
      if (para._change === "modified") {
        // 拒绝修改 → 恢复原文
        return prev.map((p, i) =>
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
      }
      return prev;
    });
  }, []);

  /** 全部接受 */
  const handleAcceptAll = useCallback(() => {
    setAiStructuredParagraphs((prev) =>
      prev
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
        ),
    );
  }, []);

  /** 全部拒绝 */
  const handleRejectAll = useCallback(() => {
    setAiStructuredParagraphs((prev) =>
      prev
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
        }),
    );
  }, []);

  /** 应用一条快照到对应 state */
  const applySnapshot = useCallback((s: EditSnapshot) => {
    if (s.kind === "ai") setAiStructuredParagraphs(s.paragraphs);
    else if (s.kind === "accepted") setAcceptedParagraphs(s.paragraphs);
    else
      setCurrentDoc((prev) => (prev ? { ...prev, content: s.content } : prev));
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

  /** 恢复到指定版本 */
  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!currentDoc) return;
      if (!confirm("确定要恢复到此版本吗？当前内容将被保存为新的版本快照。"))
        return;
      try {
        const result = await apiRestoreDocVersion(currentDoc.id, versionId);
        pushContentHistory(result.content);
        setCurrentDoc((prev) =>
          prev ? { ...prev, content: result.content } : prev,
        );
        setAiStructuredParagraphs([]);
        toast.success(`已恢复到版本 v${result.version_number}`);
        await loadVersionHistory();
        loadDocs();
      } catch (err: any) {
        toast.error("版本恢复失败: " + err.message);
      }
    },
    [currentDoc?.id, pushContentHistory, loadVersionHistory],
  );

  // 静默保存（自动保存用，不弹 toast）
  const silentSaveDoc = useCallback(async () => {
    if (!currentDoc) return;
    try {
      await apiUpdateDocument(currentDoc.id, {
        content: currentDoc.content,
        title: currentDoc.title,
      });
      setLastSavedAt(new Date());
    } catch {
      // 静默失败，不打扰用户
    }
  }, [currentDoc?.id, currentDoc?.content, currentDoc?.title]);

  // 自动保存 effect：内容变化后 3 秒无操作触发保存
  useEffect(() => {
    if (!autoSaveEnabled || !currentDoc?.content) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      silentSaveDoc();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveEnabled, currentDoc?.content, silentSaveDoc]);

  // 持久化 autoSave 设置
  useEffect(() => {
    try {
      localStorage.setItem("govai_auto_save", autoSaveEnabled ? "1" : "0");
    } catch {}
  }, [autoSaveEnabled]);

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
  const loadDocs = async () => {
    try {
      const f: any = {};
      if (filters.keyword) f.keyword = filters.keyword;
      if (filters.type) f.doc_type = filters.type;
      if (filters.status) f.status = filters.status;
      if (filters.security) f.security = filters.security;
      if (filters.startDate) f.start_date = filters.startDate;
      if (filters.endDate) f.end_date = filters.endDate;
      const data = await apiListDocuments(
        "doc",
        1,
        100,
        Object.keys(f).length > 0 ? f : undefined,
      );
      setDocs(data.items);
      setDocsTotal(data.total);
    } catch (err: any) {
      toast.error("加载文档失败: " + err.message);
    }
  };
  const loadMaterials = async () => {
    try {
      const data = await apiListMaterials();
      setMaterials(data);
    } catch (err: any) {
      toast.error("加载素材失败: " + err.message);
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

  useEffect(() => {
    loadDocs();
  }, [filters]);
  useEffect(() => {
    loadMaterials();
    loadKbCollections();
  }, []);

  /* ── 文档操作 ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setUploadedFile(e.target.files[0]);
  };

  const ACCEPTED_EXTENSIONS = [".docx", ".doc", ".pdf", ".txt", ".md"];
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
        `不支持的文件格式 (${ext})，请上传 .docx .doc .pdf .txt .md`,
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
      setCurrentDoc(updatedDoc);

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
    } catch (err: any) {
      toast.error("处理失败: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveDoc = async () => {
    if (!currentDoc) return;
    try {
      await apiUpdateDocument(currentDoc.id, {
        content: currentDoc.content,
        title: currentDoc.title,
      });
      setLastSavedAt(new Date());
      toast.success("文档已保存");
      loadDocs();
    } catch (err: any) {
      toast.error("保存失败: " + err.message);
    }
  };

  const handleArchive = async (d: DocListItem) => {
    if (!confirm(`确定归档《${d.title}》吗？`)) return;
    try {
      // 如果是当前文档，先保存最新内容再归档
      if (currentDoc && currentDoc.id === d.id && currentDoc.content) {
        await apiUpdateDocument(currentDoc.id, { content: currentDoc.content });
      }
      await apiArchiveDocument(d.id);
      loadDocs();
      toast.success("文档已归档");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除此记录？")) return;
    try {
      await apiDeleteDocument(id);
      loadDocs();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openDoc = async (d: DocListItem) => {
    try {
      const detail = await apiGetDocument(d.id);
      setCurrentDoc(detail);
      // 初始化统一撤销历史
      editHistoryRef.current = [];
      editIndexRef.current = -1;
      setCanUndo(false);
      setCanRedo(false);
      // Initialize pipeline state from document status
      setCompletedStages(inferCompletedStages(detail.status));
      setPipelineStage(inferNextStage(detail.status));
      setFormatStats(null);
      setReviewResult(null);
      setAiStructuredParagraphs([]);
      // 从后端恢复已保存的结构化排版数据
      if ((detail as any).formatted_paragraphs) {
        try {
          const saved = JSON.parse((detail as any).formatted_paragraphs);
          if (Array.isArray(saved) && saved.length > 0) {
            setAcceptedParagraphs(saved);
            // 初始快照：已采纳的结构化段落
            editHistoryRef.current = [
              { kind: "accepted" as const, paragraphs: saved },
            ];
            editIndexRef.current = 0;
          } else {
            setAcceptedParagraphs([]);
            editHistoryRef.current = [
              { kind: "content" as const, content: detail.content || "" },
            ];
            editIndexRef.current = 0;
          }
        } catch {
          setAcceptedParagraphs([]);
          editHistoryRef.current = [
            { kind: "content" as const, content: detail.content || "" },
          ];
          editIndexRef.current = 0;
        }
      } else {
        setAcceptedParagraphs([]);
        editHistoryRef.current = [
          { kind: "content" as const, content: detail.content || "" },
        ];
        editIndexRef.current = 0;
      }
      setRightPanel(null);
      setStep(3); // Go to editor/pipeline view
      setView("create");
    } catch (err: any) {
      toast.error("加载文档失败: " + err.message);
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
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`成功导出 ${targetIds.length} 份文档`);
    } catch (err: any) {
      toast.error("导出失败: " + err.message);
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
      a.click();
      URL.revokeObjectURL(url);
      toast.success("文件下载成功");
    } catch (err: any) {
      toast.error("下载失败: " + err.message);
    }
  };

  /* ── 下载排版后内容（DOCX + PDF 双格式） ── */
  const handleDownloadFormatted = async () => {
    if (!currentDoc) return;
    let paragraphs =
      aiStructuredParagraphs.length > 0
        ? aiStructuredParagraphs
        : acceptedParagraphs.length > 0
          ? acceptedParagraphs
          : null;

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
      a.click();
      URL.revokeObjectURL(url);
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
    } catch (err: any) {
      toast.error("导出失败: " + (err.message || "未知错误"));
    }
  };

  /* ── 下载排版后内容（PDF 格式） ── */
  const handleDownloadPdf = async () => {
    if (!currentDoc) return;
    let paragraphs =
      aiStructuredParagraphs.length > 0
        ? aiStructuredParagraphs
        : acceptedParagraphs.length > 0
          ? acceptedParagraphs
          : null;

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
      a.click();
      URL.revokeObjectURL(url);
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
    } catch (err: any) {
      toast.error("PDF 导出失败: " + (err.message || "未知错误"));
    }
  };

  /* ── 下载菜单状态 ── */
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(e.target as Node)
      ) {
        setShowDownloadMenu(false);
      }
    };
    if (showDownloadMenu)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDownloadMenu]);

  /* ── 预览（获取 Markdown 并打开弹窗） ── */
  /* ── 格式化预设 CRUD ── */
  const selectedPreset = useMemo(
    () => formatPresets.find((p) => p.id === selectedPresetId) || null,
    [formatPresets, selectedPresetId],
  );

  const handleAddPreset = () => {
    if (!presetForm.name.trim() || !presetForm.instruction.trim()) {
      return toast.error("预设名称和排版指令不能为空");
    }
    const newPreset: FormatPreset = {
      id: `custom-${Date.now()}`,
      name: presetForm.name.trim(),
      description: presetForm.description.trim(),
      instruction: presetForm.instruction.trim(),
      builtIn: false,
    };
    const updated = [...formatPresets, newPreset];
    setFormatPresets(updated);
    saveCustomPresets(updated.filter((p) => !p.builtIn));
    setPresetForm({ name: "", description: "", instruction: "" });
    setEditingPreset(null);
    toast.success("预设已添加");
  };

  const handleUpdatePreset = () => {
    if (!editingPreset || editingPreset.builtIn) return;
    if (!presetForm.name.trim() || !presetForm.instruction.trim()) {
      return toast.error("预设名称和排版指令不能为空");
    }
    const updated = formatPresets.map((p) =>
      p.id === editingPreset.id
        ? {
            ...p,
            name: presetForm.name.trim(),
            description: presetForm.description.trim(),
            instruction: presetForm.instruction.trim(),
          }
        : p,
    );
    setFormatPresets(updated);
    saveCustomPresets(updated.filter((p) => !p.builtIn));
    setEditingPreset(null);
    setPresetForm({ name: "", description: "", instruction: "" });
    toast.success("预设已更新");
  };

  const handleDeletePreset = (id: string) => {
    const target = formatPresets.find((p) => p.id === id);
    if (!target || target.builtIn) return;
    if (!confirm(`确定删除预设「${target.name}」？`)) return;
    const updated = formatPresets.filter((p) => p.id !== id);
    setFormatPresets(updated);
    saveCustomPresets(updated.filter((p) => !p.builtIn));
    if (selectedPresetId === id) setSelectedPresetId(null);
    toast.success("预设已删除");
  };

  const startEditPreset = (preset: FormatPreset) => {
    setEditingPreset(preset);
    setPresetForm({
      name: preset.name,
      description: preset.description,
      instruction: preset.instruction,
    });
  };

  const cancelEditPreset = () => {
    setEditingPreset(null);
    setPresetForm({ name: "", description: "", instruction: "" });
  };

  /* ── 对话式 AI 处理 ── */
  const handleAiProcess = async () => {
    if (!currentDoc) return toast.error("请先导入文档");
    const stageId = PIPELINE_STAGES[pipelineStage].id;
    // 格式化阶段：预设和用户指令至少有其一即可（两个都没有也行，后端用默认公文标准）
    // 非格式化阶段（除起草外）：必须输入指令
    if (stageId !== "format" && stageId !== "draft" && !aiInstruction.trim()) {
      return toast.error("请输入处理指令");
    }

    // 格式化阶段：合并预设指令 + 用户指令
    let finalInstruction = aiInstruction;
    if (stageId === "format") {
      const parts: string[] = [];
      if (selectedPreset) {
        parts.push(
          `【预设格式 - ${selectedPreset.name}】\n${selectedPreset.instruction}`,
        );
      }
      if (aiInstruction.trim()) {
        parts.push(
          selectedPreset
            ? `【用户补充要求】\n${aiInstruction.trim()}`
            : aiInstruction.trim(),
        );
      }
      finalInstruction = parts.join("\n\n");
    }

    // 增量修改：所有阶段——如果已有排版结果，传给后端让 AI 基于结构化数据工作
    const existingParas =
      aiStructuredParagraphs.length > 0
        ? aiStructuredParagraphs
        : acceptedParagraphs.length > 0
          ? acceptedParagraphs
          : undefined;

    setIsAiProcessing(true);
    setAiStreamingText("");
    setAiStructuredParagraphs([]);
    needsMoreInfoRef.current = false;
    setProcessingLog([]);

    apiAiProcess(
      currentDoc.id,
      stageId,
      finalInstruction,
      // onChunk
      (chunk: AiProcessChunk) => {
        if (chunk.type === "text") {
          setAiStreamingText((prev) => prev + (chunk.text || ""));
        } else if (chunk.type === "structured_paragraph" && chunk.paragraph) {
          // 收到结构化段落时，清除流式文本（可能是 AI 返回的 JSON 原文）
          setAiStreamingText("");
          setAiStructuredParagraphs((prev) => [...prev, chunk.paragraph!]);
        } else if (chunk.type === "replace_streaming_text") {
          // 后端缓冲 JSON 后解析完毕，用纯文本替换（此时 aiStreamingText 可能为空或有旧数据）
          setAiStreamingText((chunk as any).text || "");
          setProcessingLog((prev) => [
            ...prev,
            {
              type: "status",
              message: "内容解析完成，正在渲染…",
              ts: Date.now(),
            },
          ]);
        } else if (chunk.type === "draft_result" && chunk.paragraphs) {
          // ── 增量 diff 模式：AI 只输出了变更，后端已合并好完整段落列表 ──
          setAiStreamingText("");
          setAiStructuredParagraphs(chunk.paragraphs as any);
          const changeCount = (chunk as any).change_count || 0;
          const summary = (chunk as any).summary || "";
          const msg = summary
            ? `AI 完成 ${changeCount} 处变更：${summary}`
            : `AI 完成 ${changeCount} 处变更`;
          setProcessingLog((prev) => [
            ...prev,
            { type: "info", message: msg, ts: Date.now() },
          ]);
          toast.success(msg, { duration: 5000 });
        } else if (chunk.type === "needs_more_info") {
          // AI 需要更多信息 → toast + 处理日志
          needsMoreInfoRef.current = true;
          setAiStreamingText("");
          const suggestions = ((chunk as any).suggestions as string[]) || [];
          const msg =
            suggestions.length > 0
              ? "AI 需要更多信息：\n" +
                suggestions.map((s: string) => `• ${s}`).join("\n")
              : "AI 需要更多信息，请提供更详细的指令";
          toast(msg, { duration: 8000 });
          setProcessingLog((prev) => [
            ...prev,
            { type: "info", message: msg, ts: Date.now() },
          ]);
        } else if (chunk.type === "review_suggestion" && chunk.suggestion) {
          // 单条建议实时推送——逐条追加到右侧面板
          setReviewResult((prev: any) => {
            const existing = prev || { suggestions: [], summary: "" };
            return {
              ...existing,
              suggestions: [...existing.suggestions, chunk.suggestion],
            };
          });
          // ── Copilot-style: 将审查建议映射到段落级变更标记 ──
          const sug = chunk.suggestion!;
          if (
            sug.original &&
            sug.suggestion &&
            sug.original !== sug.suggestion
          ) {
            setAiStructuredParagraphs((prev) => {
              // 如果 AI 尚未输出结构化段落，基于现有段落初始化
              let paras = prev.length > 0 ? [...prev] : undefined;
              if (!paras) {
                // 从 acceptedParagraphs 或纯文本初始化
                const base =
                  acceptedParagraphs.length > 0
                    ? acceptedParagraphs
                    : currentDoc?.content
                      ? currentDoc.content
                          .split(/\n+/)
                          .filter((l) => l.trim())
                          .map((line) => ({
                            text: line.trim(),
                            style_type: "body" as const,
                          }))
                      : [];
                paras = base.map((p) => ({ ...p }));
              }
              // 查找包含 original 文本的段落并标记为 modified
              let matched = false;
              for (let i = 0; i < paras.length; i++) {
                if (paras[i].text.includes(sug.original) && !paras[i]._change) {
                  paras[i] = {
                    ...paras[i],
                    _change: "modified",
                    _original_text: paras[i].text,
                    text: paras[i].text.replace(sug.original, sug.suggestion),
                    _change_reason: `[${sug.category}] ${sug.reason}`,
                  };
                  matched = true;
                  break;
                }
              }
              return matched ? paras : prev.length > 0 ? prev : paras;
            });
          }
        } else if (chunk.type === "review_suggestions") {
          // 最终汇总推送——用完整数据覆盖（含 summary）
          setReviewResult({
            suggestions: (chunk as any).suggestions || [],
            summary: (chunk as any).summary || "",
          });
        } else if (chunk.type === "status") {
          setProcessingLog((prev) => [
            ...prev,
            {
              type: "status",
              message: chunk.message || "处理中…",
              ts: Date.now(),
            },
          ]);
        } else if (chunk.type === "done") {
          // 更新文档内容（如果有完整结果，且不是审查阶段）
          if (chunk.full_content && stageId !== "review") {
            pushContentHistory(chunk.full_content);
            setCurrentDoc((prev: any) =>
              prev ? { ...prev, content: chunk.full_content } : prev,
            );
          }
        } else if (chunk.type === "error") {
          toast.error(chunk.message || "AI 处理出错");
          setProcessingLog((prev) => [
            ...prev,
            {
              type: "error",
              message: chunk.message || "AI 处理出错",
              ts: Date.now(),
            },
          ]);
        }
        // 自动滚动到底部
        if (aiOutputRef.current) {
          aiOutputRef.current.scrollTop = aiOutputRef.current.scrollHeight;
        }
      },
      // onDone
      () => {
        setIsAiProcessing(false);
        setAiInstruction("");

        // needs_more_info 场景：AI 需要更多信息，不标记阶段完成
        if (needsMoreInfoRef.current) {
          needsMoreInfoRef.current = false;
          setAiStreamingText(""); // 清空残留
          return;
        }

        // ── 安全网：如果流式文本仍含未处理的 JSON，转为友好文本 ──
        setAiStreamingText((prev) => {
          if (!prev) return prev;
          const trimmed = prev.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const parsed = JSON.parse(trimmed);
              const lines: string[] = [];
              if (parsed.request_more && Array.isArray(parsed.request_more)) {
                lines.push("AI 需要更多信息来完成任务：");
                parsed.request_more.forEach((item: any) => {
                  if (typeof item === "string") lines.push(`• ${item}`);
                });
              }
              if (parsed.paragraphs && Array.isArray(parsed.paragraphs)) {
                parsed.paragraphs.forEach((p: any) => {
                  if (typeof p === "string" && p.trim()) lines.push(p);
                  else if (p && p.text) lines.push(p.text);
                });
              }
              if (parsed.message && typeof parsed.message === "string") {
                lines.push(parsed.message);
              }
              if (lines.length > 0) return lines.join("\n");
              return "AI 返回了空结果，请尝试提供更详细的指令。";
            } catch {
              // JSON.parse 失败 → 正则 fallback 提取 "text" 值
              const matches = trimmed.matchAll(
                /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
              );
              const extracted: string[] = [];
              for (const m of matches) {
                const val = m[1]
                  .replace(/\\n/g, "\n")
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, "\\");
                if (val.trim()) extracted.push(val.trim());
              }
              if (extracted.length > 0) return extracted.join("\n");
            }
          }
          return prev;
        });
        // 标记阶段完成
        setCompletedStages((prev) => {
          const next = new Set(prev);
          next.add(pipelineStage);
          return next;
        });
        loadDocs();
        toast.success(`${PIPELINE_STAGES[pipelineStage].label}完成`);
      },
      // onError
      (errMsg: string) => {
        setIsAiProcessing(false);
        toast.error(errMsg);
      },
      existingParas, // 增量修改：传递已有排版段落
    );
  };

  /* ── 素材操作 ── */
  const insertText = (text: string) => {
    if (currentDoc) {
      setCurrentDoc({
        ...currentDoc,
        content: currentDoc.content + "\n" + text,
      });
      toast.success("已插入光标处");
    }
  };
  const handleSaveMaterial = async () => {
    if (!newMat.title || !newMat.content) return toast.error("标题和内容必填");
    try {
      await apiCreateMaterial(newMat);
      await loadMaterials();
      setIsAddingMat(false);
      setNewMat({ title: "", category: "通用", content: "" });
      toast.success("素材已添加");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const handleDeleteMaterial = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("删除此素材？")) return;
    try {
      await apiDeleteMaterial(id);
      await loadMaterials();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
    setUploadedFile(null);
    setCurrentDoc(null);
    setProcessType("draft");
    setReviewResult(null);
    setFormatStats(null);
    setPipelineStage(0);
    setCompletedStages(new Set());
    setRightPanel(null);
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
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Archive size={20} className="text-blue-600" /> 我的公文箱
            </h2>
            <div className="flex gap-2 items-center">
              <button
                onClick={startCreate}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm flex items-center hover:bg-blue-700"
              >
                <Upload size={16} className="mr-2" /> 导入文档
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50"
              >
                <Download size={16} className="mr-2" /> 导出ZIP
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  密级
                </th>
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
                  <td className="p-4 text-gray-500 text-xs">
                    {SECURITY_MAP[d.security] || d.security}
                  </td>
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
                      <div className="absolute right-4 top-10 w-32 bg-white border rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          onClick={() => openDoc(d)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          <Edit3 size={14} className="mr-2" /> 编辑
                        </button>
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
              title="暂无公文"
              desc="请点击「导入文档」上传并处理公文"
              action={null}
            />
          )}
        </div>

        {/* Optimize Modal */}
        {showOptimizeModal && (
          <Modal
            title="智能优化配置"
            onClose={() => setShowOptimizeModal(false)}
            size="sm"
            footer={
              <button
                onClick={() => {
                  setShowOptimizeModal(false);
                  if (optimizeTarget) handleProcess(optimizeTarget, "optimize");
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                确认优化
              </button>
            }
          >
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
                即将针对<b>《{optimizeTarget?.title}》</b>
                进行内容优化，请选择引用的知识库范围。
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">
                  引用知识库
                </label>
                <select
                  className="w-full border p-2 rounded text-sm bg-white outline-none focus:ring-1 focus:ring-blue-400"
                  value={selectedOptimizeKb}
                  onChange={(e) => setSelectedOptimizeKb(e.target.value)}
                >
                  <option value="">全部知识库</option>
                  {kbCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-gray-400 italic">
                * 选择"全部知识库"将联合检索系统全量合规条文。
              </p>
            </div>
          </Modal>
        )}
      </div>
    );

  /* ── 流水线视图 ── */
  const renderPipelineStepper = () => (
    <div className="flex items-center justify-center gap-1 py-3 px-4 bg-white border-b">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = completedStages.has(i);
        const active =
          (step === 1 && processType === stage.id) ||
          (step === 3 && pipelineStage === i);
        const Icon = stage.icon;
        return (
          <React.Fragment key={stage.id}>
            <button
              onClick={() => {
                setPipelineStage(i);
                setProcessType(stage.id);
                if (step === 1 && stage.id === "format") {
                  // format handled in step 1 view
                } else if (currentDoc && step !== 1) {
                  // stay on step 3 but change pipeline stage
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                  : done
                    ? "bg-green-50 text-green-700"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
              title={stage.desc}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? <Check size={14} /> : i + 1}
              </div>
              <span className="hidden sm:inline">{stage.label}</span>
            </button>
            {i < PIPELINE_STAGES.length - 1 && (
              <ChevronRight
                size={16}
                className={`${done ? "text-green-400" : "text-gray-300"} shrink-0`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      {/* ── 顶栏 ── */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-gray-50 shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setView("list");
              loadDocs();
            }}
            className="p-2 hover:bg-gray-200 rounded text-gray-500"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-sm">
              {currentDoc ? currentDoc.title : "导入公文处理"}
            </span>
            {currentDoc && (
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${statusCls(currentDoc.status)}`}
                >
                  {DOC_STATUS_MAP[currentDoc.status] || currentDoc.status}
                </span>
                <span className="text-[10px] text-gray-400">
                  {DOC_TYPE_MAP[currentDoc.doc_type] || currentDoc.doc_type}
                </span>
                <span className="text-[10px] text-gray-400">
                  {SECURITY_MAP[currentDoc.security] || currentDoc.security}
                </span>
              </div>
            )}
          </div>
        </div>
        {currentDoc && (
          <div className="flex items-center space-x-2">
            {/* 撤销/重做 */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`p-2 rounded ${canUndo ? "hover:bg-gray-200 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={18} />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={`p-2 rounded ${canRedo ? "hover:bg-gray-200 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}
              title="重做 (Ctrl+Y)"
            >
              <Redo2 size={18} />
            </button>
            <div className="h-6 w-px bg-gray-300 mx-1" />
            {/* 保存 + 自动保存切换 */}
            <button
              onClick={saveDoc}
              className="p-2 rounded hover:bg-gray-200 text-gray-600"
              title="保存 (Ctrl+S)"
            >
              <Save size={18} />
            </button>
            <button
              onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
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
                {(() => {
                  const diff = Math.floor(
                    (Date.now() - lastSavedAt.getTime()) / 1000,
                  );
                  return diff < 5
                    ? "刚刚保存"
                    : diff < 60
                      ? `${diff}秒前`
                      : `${Math.floor(diff / 60)}分钟前`;
                })()}
              </span>
            )}
            <div className="h-6 w-px bg-gray-300 mx-1" />
            <button
              onClick={() =>
                setRightPanel(rightPanel === "material" ? null : "material")
              }
              className={`p-2 rounded ${rightPanel === "material" ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
              title="素材库"
            >
              <BookOpen size={18} />
            </button>
            <button
              onClick={() => {
                setShowVersionHistory(true);
                loadVersionHistory();
              }}
              className={`p-2 rounded ${showVersionHistory ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
              title="版本历史"
            >
              <History size={18} />
            </button>
            <div className="h-6 w-px bg-gray-300 mx-1" />
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
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
                      handleDownloadFormatted();
                    }}
                    className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <FileText size={16} className="text-blue-500" />
                    <span>下载 Word (.docx)</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDownloadMenu(false);
                      handleDownloadPdf();
                    }}
                    className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <BookOpen size={16} className="text-red-500" />
                    <span>下载 PDF (.pdf)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 流水线步骤条（仅在编辑器视图显示） ── */}
      {step === 3 && currentDoc && renderPipelineStepper()}

      {/* ── 主内容区 ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto bg-slate-100 p-6 flex justify-center items-start">
          {/* === Step 1: 导入文档 === */}
          {step === 1 && (
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

                {/* 文件上传 */}
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragOver ? "border-blue-500 bg-blue-50 scale-[1.02]" : uploadedFile ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-blue-500 hover:bg-blue-50"}`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    accept=".docx,.doc,.pdf,.txt,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="doc-upload"
                  />
                  <label
                    htmlFor="doc-upload"
                    className="cursor-pointer block w-full h-full"
                  >
                    {uploadedFile ? (
                      <div className="flex flex-col items-center text-green-700">
                        <FileText size={48} className="mb-2" />
                        <span className="font-bold text-lg">
                          {uploadedFile.name}
                        </span>
                        <span className="text-xs mt-1">
                          {(uploadedFile.size / 1024).toFixed(1)} KB - 点击更换
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <Upload size={32} className="mb-2" />
                        <span className="font-medium">
                          点击上传或拖拽文档至此
                        </span>
                        <span className="text-xs mt-1 text-gray-400">
                          支持 .docx, .doc, .pdf, .txt, .md 格式
                        </span>
                      </div>
                    )}
                  </label>
                </div>

                {/* 导入按钮 */}
                <button
                  onClick={async () => {
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
                      setCompletedStages(inferCompletedStages(detail.status));
                      setPipelineStage(inferNextStage(detail.status));
                      setProcessType(
                        PIPELINE_STAGES[inferNextStage(detail.status)].id,
                      );
                      setStep(3);
                      loadDocs();
                      toast.success("文档导入成功");
                    } catch (err: any) {
                      toast.error("导入失败: " + err.message);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin mr-2" /> 正在导入...
                    </>
                  ) : (
                    <>
                      <Upload size={18} className="mr-2" />{" "}
                      {uploadedFile ? "导入文档" : "创建空白文档"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* === Step 3: 流水线编辑器 === */}
          {step === 3 && currentDoc && (
            <div className="w-full max-w-4xl flex flex-col gap-4 animate-in fade-in duration-300">
              {/* 当前阶段操作面板（含对话式 AI 输入） */}

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
                        currentDoc.has_source_file ? "下载源文件" : "暂无源文件"
                      }
                    >
                      <Download size={14} /> 下载
                    </button>
                    <button
                      onClick={() => handleArchive(currentDoc as any)}
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
                          setProcessType(PIPELINE_STAGES[pipelineStage - 1].id);
                          setAiStreamingText("");
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
                          setProcessType(PIPELINE_STAGES[pipelineStage + 1].id);
                          setAiStreamingText("");
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
                  {/* 格式化阶段：预设格式选择器 */}
                  {pipelineStage === 2 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">
                          📐 选择预设格式（可选）
                        </span>
                        <button
                          onClick={() => setShowPresetManager(true)}
                          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Settings2 size={12} /> 管理预设
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formatPresets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() =>
                              setSelectedPresetId(
                                selectedPresetId === preset.id
                                  ? null
                                  : preset.id,
                              )
                            }
                            title={
                              preset.description + "\n\n" + preset.instruction
                            }
                            disabled={isAiProcessing}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-all flex items-center gap-1.5 ${
                              selectedPresetId === preset.id
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {preset.builtIn ? (
                              <FileCheck size={12} />
                            ) : (
                              <Edit3 size={12} />
                            )}
                            {preset.name}
                            {selectedPresetId === preset.id && (
                              <Check size={12} />
                            )}
                          </button>
                        ))}
                      </div>
                      {selectedPreset && (
                        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-dashed border-gray-200">
                          <span className="font-medium text-gray-500">
                            已选预设：
                          </span>
                          {selectedPreset.name}
                          {selectedPreset.description && (
                            <span className="ml-1">
                              — {selectedPreset.description}
                            </span>
                          )}
                        </div>
                      )}
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
                                ? `已选「${selectedPreset.name}」预设，可在此补充额外排版要求（可留空直接发送）...`
                                : "描述排版需求，如：「这是一份通知，请按公文标准排版」或选择上方预设格式..."
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
                  </div>

                  {/* AI 处理状态区 — 显示处理步骤 / 报错 / 补充信息 */}
                  {(processingLog.length > 0 ||
                    aiStructuredParagraphs.length > 0 ||
                    isAiProcessing) && (
                    <div
                      ref={aiOutputRef}
                      className={`border rounded-lg overflow-auto text-sm text-gray-700 leading-relaxed ${
                        aiStructuredParagraphs.length > 0
                          ? "bg-slate-50 max-h-[70vh] shadow-inner"
                          : "bg-slate-50 max-h-48"
                      }`}
                    >
                      {/* 结构化输出顶栏 */}
                      {aiStructuredParagraphs.length > 0 && (
                        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-white/90 backdrop-blur border-b text-xs text-gray-500">
                          <span>
                            📄 结构化段落 · {aiStructuredParagraphs.length} 段
                            {aiStructuredParagraphs.some(
                              (p) => p.font_size || p.font_family,
                            ) && (
                              <span className="ml-2 text-blue-500 font-medium">
                                📐 含排版格式
                              </span>
                            )}
                            {isAiProcessing && (
                              <span className="ml-2 text-blue-600">
                                <Loader2
                                  className="animate-spin inline"
                                  size={12}
                                />{" "}
                                接收中…
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      <div className="p-3 space-y-1.5">
                        {/* 处理步骤日志 */}
                        {processingLog.map((entry, i) => (
                          <div
                            key={i}
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
                            <span className="whitespace-pre-wrap">
                              {entry.message}
                            </span>
                          </div>
                        ))}
                        {/* AI 正在处理指示器 */}
                        {isAiProcessing && (
                          <div className="flex items-center gap-2 text-blue-600 text-xs">
                            <Loader2 className="animate-spin" size={12} />
                            <span>AI 正在处理…</span>
                          </div>
                        )}
                        {/* 结构化段落提示 — 在下方预览 */}
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
                            setAiStreamingText("");
                            setAiStructuredParagraphs([]);
                            setProcessingLog([]);
                          }}
                          className="px-4 py-2 text-gray-400 border rounded-lg text-xs hover:bg-gray-50 flex items-center gap-1"
                        >
                          <SkipForward size={14} /> 跳过此步
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {/* 编辑器 */}
              <div className="bg-white rounded-xl shadow-sm border flex-1 min-h-[400px] flex flex-col">
                <div className="p-3 border-b bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-700">
                      {aiStructuredParagraphs.length > 0 ? (
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
                            : aiStructuredParagraphs.some((p) => p._change)
                              ? "变更审查（接受或拒绝每条变更）"
                              : "AI 结果预览（点击文字可直接编辑）"}
                          <span className="text-blue-500 font-normal">
                            · {aiStructuredParagraphs.length} 段
                          </span>
                          {/* 变更计数 */}
                          {!isAiProcessing &&
                            (() => {
                              const changes = aiStructuredParagraphs.filter(
                                (p) => p._change,
                              );
                              if (changes.length === 0) return null;
                              return (
                                <span className="text-amber-600 font-normal">
                                  · {changes.length} 处变更
                                </span>
                              );
                            })()}
                        </span>
                      ) : acceptedParagraphs.length > 0 ? (
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
                    {/* 变更审查：全部接受/拒绝（Copilot 风格） */}
                    {!isAiProcessing &&
                      aiStructuredParagraphs.some((p) => p._change) && (
                        <>
                          {(() => {
                            const changeCount = aiStructuredParagraphs.filter(
                              (p) => p._change,
                            ).length;
                            return (
                              <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                                {changeCount} 处变更
                              </span>
                            );
                          })()}
                          <button
                            onClick={handleAcceptAll}
                            className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-md text-[11px] font-medium hover:bg-green-600 hover:text-white hover:border-green-600 flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <Check size={12} /> 全部接受
                          </button>
                          <button
                            onClick={handleRejectAll}
                            className="px-2.5 py-1 bg-gray-50 text-gray-500 border border-gray-200 rounded-md text-[11px] font-medium hover:bg-red-500 hover:text-white hover:border-red-500 flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <X size={12} /> 全部拒绝
                          </button>
                          <div className="h-4 w-px bg-gray-300" />
                        </>
                      )}
                    {!isAiProcessing && aiStructuredParagraphs.length > 0 && (
                      <button
                        onClick={async () => {
                          if (!currentDoc) return;
                          // 清除所有变更标记，只保留已接受的内容（排除 deleted 段落）
                          const paras = aiStructuredParagraphs
                            .filter((p) => p._change !== "deleted")
                            .map(
                              ({
                                _change,
                                _original_text,
                                _change_reason,
                                ...rest
                              }) => rest,
                            );
                          // 保存结构化段落到 state & 重置撤销历史
                          setAcceptedParagraphs(paras);
                          editHistoryRef.current = [
                            { kind: "accepted" as const, paragraphs: paras },
                          ];
                          editIndexRef.current = 0;
                          setCanUndo(false);
                          setCanRedo(false);
                          const merged = paras.map((p) => p.text).join("\n\n");
                          pushContentHistory(merged);
                          setCurrentDoc({
                            ...currentDoc,
                            content: merged,
                          });
                          // 同时保存纯文本 content 和结构化 formatted_paragraphs 到后端
                          try {
                            await apiUpdateDocument(currentDoc.id, {
                              content: merged,
                              formatted_paragraphs: JSON.stringify(paras),
                            } as any);
                            toast.success("已采用排版结果并保存");
                          } catch {
                            toast.success(
                              "已采用结果（自动保存失败，请手动保存）",
                            );
                          }
                          loadDocs();
                        }}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 flex items-center gap-1 shadow-sm"
                      >
                        <Check size={12} /> 采用此结果
                      </button>
                    )}
                    <span>
                      {aiStructuredParagraphs.length > 0 ||
                      acceptedParagraphs.length > 0
                        ? `${(aiStructuredParagraphs.length > 0 ? aiStructuredParagraphs : acceptedParagraphs).reduce((s, p) => s + (p.text?.length || 0), 0)} 字`
                        : `${(currentDoc.content || "").length} 字`}
                    </span>
                  </div>
                </div>
                <div
                  className="flex-1 w-full p-8 overflow-auto min-h-[400px]"
                  style={{ background: "#fefefe" }}
                >
                  {/* AI 实时结构化预览（可直接编辑） / 已采纳的结构化排版 */}
                  {aiStructuredParagraphs.length > 0 ? (
                    <StructuredDocRenderer
                      paragraphs={aiStructuredParagraphs}
                      preset={
                        (currentDoc.doc_type as
                          | "official"
                          | "academic"
                          | "legal") || "official"
                      }
                      streaming={isAiProcessing}
                      onParagraphsChange={
                        isAiProcessing
                          ? undefined
                          : (updated) => {
                              setAiStructuredParagraphs(updated);
                              pushSnapshot({ kind: "ai", paragraphs: updated });
                            }
                      }
                      onAcceptChange={
                        isAiProcessing ? undefined : handleAcceptChange
                      }
                      onRejectChange={
                        isAiProcessing ? undefined : handleRejectChange
                      }
                    />
                  ) : acceptedParagraphs.length > 0 ? (
                    <StructuredDocRenderer
                      paragraphs={acceptedParagraphs}
                      preset={
                        (currentDoc.doc_type as
                          | "official"
                          | "academic"
                          | "legal") || "official"
                      }
                      streaming={false}
                      onParagraphsChange={(updated) => {
                        setAcceptedParagraphs(updated);
                        pushSnapshot({ kind: "accepted", paragraphs: updated });
                      }}
                    />
                  ) : aiStreamingText ? (
                    <div className="whitespace-pre-wrap">
                      <RichContentRenderer
                        content={aiStreamingText}
                        plain={pipelineStage < 2}
                      />
                      {isAiProcessing && (
                        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
                      )}
                    </div>
                  ) : isAiProcessing ? (
                    /* AI 正在缓冲内容（JSON 响应不直接转发） */
                    <div className="flex flex-col items-center justify-center min-h-[200px] text-gray-400 select-none">
                      <Loader2
                        className="animate-spin mb-3 text-blue-400"
                        size={28}
                      />
                      <p className="text-sm">AI 正在生成内容，请稍候…</p>
                      <p className="text-xs mt-1 text-gray-300">
                        生成完成后将自动显示
                      </p>
                    </div>
                  ) : (
                    /* 无结构化段落时：直接显示 contentEditable 纯文本编辑区 */
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="whitespace-pre-wrap outline-none min-h-[300px] text-gray-800 focus:ring-1 focus:ring-blue-200 rounded p-2"
                      style={{
                        fontFamily: "FangSong, STFangsong, serif",
                        fontSize: "16pt",
                        lineHeight: "28pt",
                      }}
                      dangerouslySetInnerHTML={{
                        __html:
                          currentDoc.content ||
                          '<span class="text-gray-400">点击此处开始编辑公文内容…</span>',
                      }}
                      onFocus={(e) => {
                        // 清除 placeholder
                        if (!currentDoc.content) {
                          e.currentTarget.textContent = "";
                        }
                      }}
                      onBlur={(e) => {
                        const newText = e.currentTarget.textContent || "";
                        if (newText !== currentDoc.content) {
                          setCurrentDoc({ ...currentDoc, content: newText });
                          pushContentHistory(newText);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 右侧面板（素材库）── */}
        {rightPanel === "material" && currentDoc && (
          <div className="w-80 bg-white border-l shadow-xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-3 border-b flex justify-between items-center bg-gray-50">
              <span className="font-bold text-gray-700 flex items-center">
                <BookOpen size={16} className="mr-2" /> 素材 & 指令
              </span>
              <button onClick={() => setRightPanel(null)}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* 素材库/指令模板 选项卡 */}
            <div className="flex border-b bg-white">
              <button
                onClick={() => setMaterialTab("templates")}
                className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${materialTab === "templates" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                <Sparkles size={12} className="inline mr-1" />
                常用指令
              </button>
              <button
                onClick={() => setMaterialTab("material")}
                className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition ${materialTab === "material" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                <BookOpen size={12} className="inline mr-1" />
                素材库
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* ── 常用指令模板 Tab ── */}
              {materialTab === "templates" && (
                <>
                  {/* 当前阶段提示 */}
                  <div className="text-[11px] text-gray-500 bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-blue-500" />
                    当前阶段：
                    <span className="font-medium text-blue-700">
                      {PIPELINE_STAGES[pipelineStage]?.label || "起草"}
                    </span>
                    · 点击模板即可填入输入框
                  </div>

                  {/* 阶段筛选标签 */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: "current", label: "当前阶段" },
                      { key: "draft", label: "起草" },
                      { key: "review", label: "审查" },
                      { key: "format", label: "格式化" },
                    ].map((tab) => {
                      const currentStageId =
                        PIPELINE_STAGES[pipelineStage]?.id || "draft";
                      const isActive =
                        tab.key === "current"
                          ? true // current always highlighted by default
                          : false;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => {
                            // Navigate to that pipeline stage when clicked
                            if (tab.key !== "current") {
                              const idx = PIPELINE_STAGES.findIndex(
                                (s) => s.id === tab.key,
                              );
                              if (idx >= 0) setPipelineStage(idx);
                            }
                          }}
                          className={`px-2 py-0.5 text-[11px] rounded-full border transition ${
                            tab.key === "current" || tab.key === currentStageId
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 模板列表 */}
                  <div className="space-y-2">
                    {instructionTemplates
                      .filter((t) => {
                        const stageId =
                          PIPELINE_STAGES[pipelineStage]?.id || "draft";
                        return t.stage === stageId || t.stage === "all";
                      })
                      .map((t) => (
                        <div
                          key={t.id}
                          className="p-2.5 border rounded-lg hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 transition relative"
                          onClick={() => {
                            setAiInstruction(t.content);
                            toast.success(`已填入「${t.label}」`);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                              <Send size={10} className="text-blue-500" />
                              {t.label}
                            </span>
                            <div className="flex items-center gap-1">
                              {!t.builtIn && (
                                <Trash2
                                  size={12}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = instructionTemplates.filter(
                                      (x) => x.id !== t.id,
                                    );
                                    setInstructionTemplates(updated);
                                    saveCustomTemplates(
                                      updated.filter((x) => !x.builtIn),
                                    );
                                    toast.success("已删除");
                                  }}
                                />
                              )}
                              <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-medium">
                                点击填入 →
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                            {t.content}
                          </p>
                        </div>
                      ))}
                  </div>

                  {/* 新增自定义模板 */}
                  {!isAddingTemplate ? (
                    <button
                      onClick={() => setIsAddingTemplate(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
                    >
                      <Plus size={14} /> 添加自定义指令模板
                    </button>
                  ) : (
                    <div className="bg-gray-50 p-3 rounded-lg border space-y-2">
                      <h4 className="font-medium text-gray-700 text-xs">
                        新增指令模板
                      </h4>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-xs"
                        placeholder="模板名称"
                        value={newTemplate.label}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            label: e.target.value,
                          })
                        }
                      />
                      <select
                        className="w-full border rounded px-2 py-1.5 text-xs"
                        value={newTemplate.stage}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            stage: e.target
                              .value as InstructionTemplate["stage"],
                          })
                        }
                      >
                        <option value="draft">起草阶段</option>
                        <option value="review">审查阶段</option>
                        <option value="format">格式化阶段</option>
                        <option value="all">所有阶段</option>
                      </select>
                      <textarea
                        className="w-full border rounded px-2 py-1.5 text-xs h-20 resize-none"
                        placeholder="指令内容，例如：请帮我起草一份关于…的通知"
                        value={newTemplate.content}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            content: e.target.value,
                          })
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (
                              !newTemplate.label.trim() ||
                              !newTemplate.content.trim()
                            ) {
                              return toast.error("名称和内容不能为空");
                            }
                            const tpl: InstructionTemplate = {
                              id: `custom-tpl-${Date.now()}`,
                              label: newTemplate.label.trim(),
                              content: newTemplate.content.trim(),
                              stage: newTemplate.stage,
                              builtIn: false,
                            };
                            const updated = [...instructionTemplates, tpl];
                            setInstructionTemplates(updated);
                            saveCustomTemplates(
                              updated.filter((x) => !x.builtIn),
                            );
                            setNewTemplate({
                              label: "",
                              content: "",
                              stage: "all",
                            });
                            setIsAddingTemplate(false);
                            toast.success("模板已添加");
                          }}
                          className="flex-1 bg-blue-600 text-white py-1.5 rounded text-xs"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setIsAddingTemplate(false)}
                          className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── 素材库 Tab ── */}
              {rightPanel === "material" &&
                materialTab === "material" &&
                (!isAddingMat ? (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <div className="relative flex-1 mr-2">
                        <input
                          className="w-full border rounded pl-8 pr-2 py-2 text-sm"
                          placeholder="搜索素材..."
                          value={matSearch}
                          onChange={(e) => setMatSearch(e.target.value)}
                        />
                        <Search
                          size={14}
                          className="absolute left-2.5 top-3 text-gray-400"
                        />
                      </div>
                      <button
                        onClick={() => setIsAddingMat(true)}
                        className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {["全部", "开头", "结尾", "过渡", "政策"].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMatCategory(cat)}
                          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border ${matCategory === cat ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {materials
                        .filter(
                          (m) =>
                            (matCategory === "全部" ||
                              m.category === matCategory) &&
                            m.title.includes(matSearch),
                        )
                        .map((m) => (
                          <div
                            key={m.id}
                            className="p-3 border rounded hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 relative"
                            onClick={() => insertText(m.content)}
                          >
                            <div className="font-bold text-gray-700 text-xs mb-1 flex justify-between">
                              {m.title}
                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] text-gray-400 bg-white px-1 border rounded">
                                  {m.category}
                                </span>
                                <Trash2
                                  size={12}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => handleDeleteMaterial(e, m.id)}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                              {m.content}
                            </div>
                            <div className="mt-2 text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-bold text-right">
                              点击插入 +
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 p-4 rounded border">
                    <h4 className="font-bold text-gray-700 mb-3 text-sm">
                      新增素材
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          标题
                        </label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={newMat.title}
                          onChange={(e) =>
                            setNewMat({ ...newMat, title: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          分类
                        </label>
                        <select
                          className="w-full border rounded p-2 text-sm"
                          value={newMat.category}
                          onChange={(e) =>
                            setNewMat({ ...newMat, category: e.target.value })
                          }
                        >
                          {["开头", "结尾", "过渡", "政策", "通用"].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          内容
                        </label>
                        <textarea
                          className="w-full border rounded p-2 text-sm h-24"
                          value={newMat.content}
                          onChange={(e) =>
                            setNewMat({ ...newMat, content: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSaveMaterial}
                          className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setIsAddingMat(false)}
                          className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-sm"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 格式预设管理弹窗 */}
      {showPresetManager && (
        <Modal
          title="📐 管理格式预设"
          onClose={() => {
            setShowPresetManager(false);
            cancelEditPreset();
          }}
          footer={
            <button
              onClick={() => {
                setShowPresetManager(false);
                cancelEditPreset();
              }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              完成
            </button>
          }
        >
          <div className="space-y-4 max-h-[70vh] overflow-auto">
            {/* 新增/编辑表单 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium text-blue-700">
                {editingPreset
                  ? `✏️ 编辑预设「${editingPreset.name}」`
                  : "➕ 新建自定义预设"}
              </div>
              <input
                type="text"
                value={presetForm.name}
                onChange={(e) =>
                  setPresetForm({ ...presetForm, name: e.target.value })
                }
                placeholder="预设名称，如：项目申请书格式"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text"
                value={presetForm.description}
                onChange={(e) =>
                  setPresetForm({ ...presetForm, description: e.target.value })
                }
                placeholder="简要描述（可选），如：适用于科技项目申请"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <textarea
                value={presetForm.instruction}
                onChange={(e) =>
                  setPresetForm({ ...presetForm, instruction: e.target.value })
                }
                placeholder="排版指令内容，如：标题二号黑体居中，正文四号宋体首行缩进2字符，行距1.5倍..."
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                rows={4}
              />
              <div className="flex gap-2">
                {editingPreset ? (
                  <>
                    <button
                      onClick={handleUpdatePreset}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
                    >
                      <Check size={14} /> 保存修改
                    </button>
                    <button
                      onClick={cancelEditPreset}
                      className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddPreset}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
                  >
                    <Plus size={14} /> 添加预设
                  </button>
                )}
              </div>
            </div>

            {/* 预设列表 */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                内置预设（{formatPresets.filter((p) => p.builtIn).length} 个）
              </div>
              {formatPresets
                .filter((p) => p.builtIn)
                .map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-start gap-3 p-3 bg-white border rounded-lg hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileCheck size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                        {preset.name}
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">
                          内置
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {preset.description}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                        {preset.instruction}
                      </div>
                    </div>
                  </div>
                ))}

              {formatPresets.filter((p) => !p.builtIn).length > 0 && (
                <>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4">
                    自定义预设（{formatPresets.filter((p) => !p.builtIn).length}{" "}
                    个）
                  </div>
                  {formatPresets
                    .filter((p) => !p.builtIn)
                    .map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-start gap-3 p-3 bg-white border rounded-lg hover:bg-gray-50 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Edit3 size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800">
                            {preset.name}
                          </div>
                          {preset.description && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {preset.description}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                            {preset.instruction}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => startEditPreset(preset)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                            title="编辑"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── 版本历史面板（Git 风格） ── */}
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
          onClose={() => {
            setShowVersionHistory(false);
            setPreviewVersionId(null);
            setPreviewVersionContent(null);
          }}
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
                {versionList.map((v, idx) => {
                  const isFirst = idx === 0;
                  const isExpanded = previewVersionId === v.id;
                  const typeMap: Record<
                    string,
                    { color: string; label: string }
                  > = {
                    format: {
                      color: "text-purple-600 bg-purple-50",
                      label: "格式化",
                    },
                    review: {
                      color: "text-amber-600 bg-amber-50",
                      label: "审查",
                    },
                    draft: { color: "text-blue-600 bg-blue-50", label: "起草" },
                    restore: {
                      color: "text-green-600 bg-green-50",
                      label: "恢复",
                    },
                    edit: { color: "text-gray-600 bg-gray-100", label: "编辑" },
                    optimize: {
                      color: "text-teal-600 bg-teal-50",
                      label: "优化",
                    },
                    check: {
                      color: "text-orange-600 bg-orange-50",
                      label: "检查",
                    },
                  };
                  const t = typeMap[v.change_type || ""] || {
                    color: "text-gray-500 bg-gray-50",
                    label: v.change_type || "保存",
                  };

                  const ts = new Date(v.created_at);
                  const diffMin = Math.floor(
                    (Date.now() - ts.getTime()) / 60000,
                  );
                  const relTime =
                    diffMin < 1
                      ? "刚刚"
                      : diffMin < 60
                        ? `${diffMin}分钟前`
                        : diffMin < 1440
                          ? `${Math.floor(diffMin / 60)}小时前`
                          : `${Math.floor(diffMin / 1440)}天前`;

                  return (
                    <div key={v.id}>
                      {/* Git log 行 */}
                      <div
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onClick={() => handlePreviewVersion(v.id)}
                      >
                        {/* 版本号（类似 commit hash） */}
                        <code
                          className={`text-xs font-mono shrink-0 ${isFirst ? "text-blue-600 font-bold" : "text-gray-400"}`}
                        >
                          v{v.version_number}
                        </code>
                        {/* 类型标签 */}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${t.color}`}
                        >
                          {t.label}
                        </span>
                        {isFirst && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium shrink-0">
                            HEAD
                          </span>
                        )}
                        {/* 摘要 */}
                        <span className="text-xs text-gray-700 truncate flex-1 min-w-0">
                          {v.change_summary || "无备注"}
                        </span>
                        {/* 时间 + 操作人 */}
                        <span
                          className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap"
                          title={ts.toLocaleString("zh-CN")}
                        >
                          {v.created_by_name ? `${v.created_by_name} · ` : ""}
                          {relTime}
                        </span>
                        {/* 恢复按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreVersion(v.id);
                          }}
                          className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition shrink-0"
                          title="恢复到此版本"
                        >
                          <Undo2 size={13} />
                        </button>
                      </div>

                      {/* 展开预览 */}
                      {isExpanded && (
                        <div className="bg-gray-50 border-t border-b border-gray-100 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                          {isLoadingPreview ? (
                            <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
                              <Loader2 className="animate-spin" size={14} />
                              <span className="text-xs">加载预览…</span>
                            </div>
                          ) : previewVersionContent !== null ? (
                            <>
                              {/* 差异摘要 */}
                              <div className="flex items-center gap-3 mb-2 text-[11px] text-gray-500">
                                <span>{previewVersionContent.length} 字</span>
                                {currentDoc?.content &&
                                  (() => {
                                    const diff =
                                      previewVersionContent.length -
                                      (currentDoc.content || "").length;
                                    return (
                                      <span
                                        className={
                                          diff > 0
                                            ? "text-green-600"
                                            : diff < 0
                                              ? "text-red-500"
                                              : "text-gray-400"
                                        }
                                      >
                                        vs 当前{" "}
                                        {diff > 0
                                          ? `+${diff}`
                                          : diff < 0
                                            ? `${diff}`
                                            : "±0"}{" "}
                                        字
                                      </span>
                                    );
                                  })()}
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
                                  onClick={() => handleRestoreVersion(v.id)}
                                  className="text-blue-600 hover:text-blue-700 text-[11px] hover:underline font-medium"
                                >
                                  恢复此版本
                                </button>
                              </div>
                              {/* 内容预览 */}
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
    </div>
  );
};
