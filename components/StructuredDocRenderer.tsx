/**
 * StructuredDocRenderer — 结构化公文渲染器（增强版）
 *
 * 将后端 AI 排版引擎输出的结构化段落 JSON 实时渲染为富文本预览。
 * 支持：字号、字体、颜色、加粗、斜体、缩进、对齐、行距等完整格式属性。
 *
 * 特性：
 * - 内置 GB/T 9704-2012 公文、学术论文、法律文书三套预设
 * - 字体降级：中文字体自动降级到 web-safe CJK 字体栈
 * - 颜色白名单：只渲染合法的 6 位 hex 颜色，不合法降级为黑色
 * - 字号映射：中文字号名 → pt → rem 自动转换
 * - 流式光标：增量接收时在末尾显示蓝色闪烁光标
 *
 * 数据来源：SSE `structured_paragraph` 类型的 AiProcessChunk
 */
import React, { useCallback, useState, useEffect, useRef } from "react";

/* ──────── 简易 stable key 生成器 ──────── */
const stableParaKey = (
  para: { text: string; style_type: string },
  idx: number,
): string => {
  // 取前 30 字符 + 样式类型 + 索引作为稳定 key
  const prefix = (para.text || "")
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "");
  return `${para.style_type}-${idx}-${prefix}`;
};

/* ──────── 类型定义 ──────── */

export interface StructuredParagraph {
  /** 段落文字内容 */
  text: string;
  /** 样式类型 */
  style_type:
    | "title"
    | "subtitle"
    | "heading1"
    | "heading2"
    | "heading3"
    | "heading4"
    | "body"
    | "recipient"
    | "signature"
    | "date"
    | "attachment"
    | "closing";
  /* ── 富格式属性（排版阶段 LLM 输出） ── */
  /** 字号，如 "二号" "三号" */
  font_size?: string;
  /** 字体，如 "方正小标宋简体" "仿宋_GB2312" */
  font_family?: string;
  /** 是否加粗 */
  bold?: boolean;
  /** 是否斜体 */
  italic?: boolean;
  /** 文字颜色，6 位十六进制，如 "#CC0000" */
  color?: string;
  /** 首行缩进，如 "2em" "0" */
  indent?: string;
  /** 对齐方式 left | center | right | justify */
  alignment?: string;
  /** 行高，如 "28pt" "2" */
  line_height?: string;
  /** 是否显示标题下方红色分隔线（默认 true，official 与 school_notice_redhead 的 title 有效） */
  red_line?: boolean;
  /** 字间距，如 "0.6em" */
  letter_spacing?: string;
  /** 版记双横线（attachment 段落上方） */
  footer_line?: boolean;
  /** 版记区底部封线（最后一个 attachment 段落下方） */
  footer_line_bottom?: boolean;

  /* ── 变更追踪字段（Copilot-style，前端 only） ── */
  /** 变更类型：added=新增, deleted=删除, modified=修改, null/undefined=无变更 */
  _change?: "added" | "deleted" | "modified" | null;
  /** 修改前的原始文本（_change=modified 时使用） */
  _original_text?: string;
  /** 变更原因/说明 */
  _change_reason?: string;
  /** 排版置信度标记（规则引擎处理时，low 表示样式推断可能不准确） */
  _confidence?: "high" | "low";
}

export interface StructuredDocRendererProps {
  /** 已接收到的结构化段落列表 */
  paragraphs: StructuredParagraph[];
  /** 文档类型预设，默认 official */
  preset?:
    | "official"
    | "academic"
    | "legal"
    | "proposal"
    | "lab_fund"
    | "school_notice_redhead";
  /** 是否正在流式接收中 */
  streaming?: boolean;
  /** 段落数据变更回调（直接编辑时触发） */
  onParagraphsChange?: (paragraphs: StructuredParagraph[]) => void;
  /** 接受单条变更（idx=validParagraphs 索引） */
  onAcceptChange?: (idx: number) => void;
  /** 拒绝单条变更（idx=validParagraphs 索引） */
  onRejectChange?: (idx: number) => void;
}

/* ════════════════════════════════════════════════════════════
 * 字体降级映射（扩展别名）
 * 后端/LLM 可能输出多种中文字体名称，全部映射到 web-safe + CJK 通用字体
 * ════════════════════════════════════════════════════════════ */
const FONT_MAP: Record<string, string> = {
  /* 小标宋 */
  方正小标宋简体:
    '"FZXiaoBiaoSong-B05", "STZhongsong", "STSong", "SimSun", "Songti SC", serif',
  方正小标宋:
    '"FZXiaoBiaoSong-B05", "STZhongsong", "STSong", "SimSun", "Songti SC", serif',
  FZXiaoBiaoSong:
    '"FZXiaoBiaoSong-B05", "STZhongsong", "STSong", "SimSun", "Songti SC", serif',
  /* 黑体 */
  黑体: '"SimHei", "STHeiti", "Heiti SC", "Microsoft YaHei", sans-serif',
  SimHei: '"SimHei", "STHeiti", "Heiti SC", "Microsoft YaHei", sans-serif',
  /* 楷体 */
  楷体_GB2312: '"KaiTi", "STKaiti", "Kaiti SC", serif',
  楷体: '"KaiTi", "STKaiti", "Kaiti SC", serif',
  KaiTi: '"KaiTi", "STKaiti", "Kaiti SC", serif',
  华文楷体: '"STKaiti", "KaiTi", "Kaiti SC", serif',
  /* 仿宋 */
  仿宋_GB2312: '"FangSong", "STFangsong", "Fangsong SC", serif',
  仿宋: '"FangSong", "STFangsong", "Fangsong SC", serif',
  FangSong: '"FangSong", "STFangsong", "Fangsong SC", serif',
  华文仿宋: '"STFangsong", "FangSong", "Fangsong SC", serif',
  /* 宋体 */
  宋体: '"SimSun", "STSong", "Songti SC", serif',
  SimSun: '"SimSun", "STSong", "Songti SC", serif',
  华文中宋: '"STZhongsong", "SimSun", "STSong", serif',
  /* 雅黑 */
  微软雅黑: '"Microsoft YaHei", "PingFang SC", sans-serif',
};

/**
 * 构建 CSS fontFamily — 先按 FONT_MAP 查表，未命中则直接引用原名并加 serif 兜底
 */
const getFontFamily = (fontCn: string, fontEn = "Times New Roman") => {
  const cn =
    FONT_MAP[fontCn] || FONT_MAP[fontCn.trim()] || `"${fontCn}", serif`;
  return `"${fontEn}", ${cn}`;
};

/* ════════════════════════════════════════════════════════════
 * 颜色白名单 + 降级处理
 * 只允许合法的 6 位 hex 颜色，防止 LLM 输出 CSS 注入
 * ════════════════════════════════════════════════════════════ */

/** 允许的颜色白名单 */
const VALID_COLORS = new Set([
  "#000000",
  "#CC0000",
  "#333333",
  "#666666",
  "#0033CC",
  "#006600",
  "#800080",
]);

/** 颜色名 → hex 映射（中英文） */
const COLOR_NAME_MAP: Record<string, string> = {
  黑色: "#000000",
  红色: "#CC0000",
  深灰: "#333333",
  灰色: "#666666",
  蓝色: "#0033CC",
  绿色: "#006600",
  紫色: "#800080",
  black: "#000000",
  red: "#CC0000",
  blue: "#0033CC",
  green: "#006600",
  purple: "#800080",
  gray: "#666666",
  grey: "#666666",
};

/**
 * 解析并验证颜色值，不合法返回 undefined（由预设兜底）
 * 支持：#RRGGBB、颜色中文名、颜色英文名
 */
const resolveColor = (raw: string | undefined | null): string | undefined => {
  if (!raw) return undefined;
  let c = raw.trim();

  // 中英文颜色名映射
  const mapped = COLOR_NAME_MAP[c.toLowerCase()] || COLOR_NAME_MAP[c];
  if (mapped) return mapped;

  // 补 # 前缀
  if (!c.startsWith("#")) c = "#" + c;
  c = c.toUpperCase();

  // 验证 #RRGGBB 格式
  if (/^#[0-9A-F]{6}$/.test(c)) {
    // 在白名单中直接通过，不在白名单中也放行（前端不做强拦截，只做告警）
    return c;
  }

  return undefined; // 不合法，降级
};

/* ════════════════════════════════════════════════════════════
 * style_type 校验 & 模糊归一化
 * ════════════════════════════════════════════════════════════ */
const VALID_STYLE_TYPES = new Set([
  "title",
  "subtitle",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "body",
  "recipient",
  "signature",
  "date",
  "attachment",
  "closing",
]);

/** 将 LLM 返回的 style_type 归一化为合法值，未知类型降级为 body */
const normalizeStyleType = (raw: string | undefined | null): string => {
  if (!raw) return "body";
  const t = raw.trim().toLowerCase();
  if (VALID_STYLE_TYPES.has(t)) return t;
  // 模糊匹配：中文 / 常见变体
  if (t.includes("title") || t === "标题") return "title";
  if (/heading\s*1|一级/.test(t)) return "heading1";
  if (/heading\s*2|二级/.test(t)) return "heading2";
  if (/heading\s*3|三级/.test(t)) return "heading3";
  if (/heading\s*4|四级/.test(t)) return "heading4";
  if (t.includes("body") || t === "正文") return "body";
  if (t.includes("signature") || t.includes("落款") || t.includes("署名"))
    return "signature";
  if (t.includes("date") || t === "日期") return "date";
  if (t.includes("recipient") || t.includes("主送")) return "recipient";
  if (t.includes("attachment") || t.includes("附件")) return "attachment";
  if (t.includes("subtitle") || t.includes("副标题") || t.includes("子标题"))
    return "subtitle";
  if (t.includes("closing") || t.includes("结束")) return "closing";
  return "body";
};

/* ════════════════════════════════════════════════════════════
 * alignment / indent 归一化
 * ════════════════════════════════════════════════════════════ */
const VALID_ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

const normalizeAlignment = (
  raw: string | undefined,
): React.CSSProperties["textAlign"] | undefined => {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase();
  if (VALID_ALIGNMENTS.has(t)) return t as React.CSSProperties["textAlign"];
  if (t === "居中") return "center";
  if (t === "居右" || t === "右对齐") return "right";
  if (t === "居左" || t === "左对齐") return "left";
  if (t === "两端对齐" || t === "两端") return "justify";
  return undefined;
};

const normalizeIndent = (
  raw: string | undefined | null,
): string | undefined => {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  if (t === "" || t === "none" || t === "无") return "0";
  if (t === "0") return "0";
  // 带单位直接透传
  if (/^[\d.]+\s*(em|px|rem|pt|cm|mm|%)$/.test(t)) return t;
  // 纯数字 → 当作 em
  if (/^[\d.]+$/.test(t)) return `${t}em`;
  return t;
};

/* ════════════════════════════════════════════════════════════
 * pt → rem 转换 (基准 16px = 1rem)
 * ════════════════════════════════════════════════════════════ */
const ptToRem = (pt: number) => `${(pt / 12).toFixed(3)}rem`;

/* ════════════════════════════════════════════════════════════
 * 中文字号 → pt 映射 (GB/T 9704)
 * ════════════════════════════════════════════════════════════ */
const CN_FONT_SIZE_PT: Record<string, number> = {
  初号: 42,
  小初: 36,
  一号: 26,
  小一: 24,
  二号: 22,
  小二: 18,
  三号: 16,
  小三: 15,
  四号: 14,
  小四: 12,
  五号: 10.5,
  小五: 9,
};

/**
 * 将 LLM 返回的 font_size 字符串转为 CSS fontSize 值。
 * 支持：中文字号名（"二号"）、带 pt 的数值（"16pt"）、纯数字（"16"）、px/rem。
 */
const resolveFontSize = (
  raw: string | undefined | null,
): string | undefined => {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  // 中文字号
  if (CN_FONT_SIZE_PT[trimmed]) return ptToRem(CN_FONT_SIZE_PT[trimmed]);
  // "16pt" / "22pt"
  const ptMatch = trimmed.match(/^([\d.]+)\s*pt$/i);
  if (ptMatch) return ptToRem(parseFloat(ptMatch[1]));
  // 带 px/rem 单位直接透传
  if (/^[\d.]+\s*(px|rem|em)$/i.test(trimmed)) return trimmed;
  // 纯数字 → 当作 pt
  if (/^[\d.]+$/.test(trimmed)) return ptToRem(parseFloat(trimmed));
  // 其他直接透传
  return trimmed;
};

/**
 * 将 LLM 返回的 line_height 字符串转为 CSS lineHeight 值。
 * 支持："28pt" → rem、纯倍数 "2" → "2"、百分比 "150%"、带单位值。
 */
const resolveLineHeight = (
  raw: string | undefined | null,
): string | undefined => {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  // "28pt"
  const ptMatch = trimmed.match(/^([\d.]+)\s*pt$/i);
  if (ptMatch) return ptToRem(parseFloat(ptMatch[1]));
  // 带 px/rem/em 直接透传
  if (/^[\d.]+\s*(px|rem|em|%)$/i.test(trimmed)) return trimmed;
  // 纯数字（倍数）直接透传
  if (/^[\d.]+$/.test(trimmed)) return trimmed;
  return trimmed;
};

/* ════════════════════════════════════════════════════════════
 * GB/T 9704 公文样式预设
 * 每种 style_type 的默认 CSS 样式，含颜色
 * ════════════════════════════════════════════════════════════ */
type StyleDef = React.CSSProperties;

const STYLE_PRESETS: Record<string, Record<string, StyleDef>> = {
  official: {
    title: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(22),
      fontWeight: "normal",
      color: "#000000",
      textAlign: "center",
      lineHeight: "2",
      marginBottom: "0.5em",
    },
    recipient: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "0",
      lineHeight: "2",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
    heading2: {
      fontFamily: getFontFamily("楷体_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
    heading3: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
    heading4: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "2",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      paddingRight: "4em",
      lineHeight: "2",
    },
    date: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      paddingRight: "4em",
      lineHeight: "2",
    },
    attachment: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "2",
    },
    closing: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
  },

  school_notice_redhead: {
    title: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(32),
      fontWeight: "normal",
      color: "#CC0000",
      textAlign: "center",
      lineHeight: "1.25",
      letterSpacing: "0.6em",
      marginBottom: "0.6em",
    },
    subtitle: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(22),
      fontWeight: "normal",
      color: "#000000",
      textAlign: "center",
      lineHeight: "1.32",
      marginBottom: "0.5em",
    },
    recipient: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "0",
      lineHeight: "1.81",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.81",
    },
    heading2: {
      fontFamily: getFontFamily("楷体_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.81",
    },
    heading3: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.81",
    },
    heading4: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.81",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "1.81",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      paddingRight: "4em",
      lineHeight: "1.81",
    },
    date: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      paddingRight: "4em",
      lineHeight: "1.81",
    },
    attachment: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      color: "#333333",
      textAlign: "left",
      textIndent: "0",
      lineHeight: "1.5",
    },
    closing: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.81",
    },
  },

  /* ── 学术论文预设 ── */
  academic: {
    title: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(18),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "center",
      lineHeight: "1.8",
      marginBottom: "0.5em",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(15),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      lineHeight: "1.8",
    },
    heading2: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(14),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      lineHeight: "1.8",
    },
    heading3: {
      fontFamily: getFontFamily("楷体_GB2312"),
      fontSize: ptToRem(14),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      lineHeight: "1.8",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(12),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "1.8",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(12),
      color: "#000000",
      textAlign: "right",
      lineHeight: "1.8",
    },
  },

  /* ── 法律文书预设 ── */
  legal: {
    title: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(26),
      fontWeight: "normal",
      color: "#000000",
      textAlign: "center",
      lineHeight: "2.2",
      marginBottom: "0.5em",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "2",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "2",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      lineHeight: "2",
    },
    date: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "right",
      lineHeight: "2",
    },
  },

  /* ── 项目建议书预设 ── */
  /* A4, 行间距固定值25磅, 一级黑体三号, 二级楷体三号, 三四级仿宋四号加粗, 正文仿宋小四 */
  proposal: {
    title: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(22),
      fontWeight: "normal",
      color: "#000000",
      textAlign: "center",
      lineHeight: "1.5",
      marginBottom: "0.5em",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    heading2: {
      fontFamily: getFontFamily("楷体_GB2312"),
      fontSize: ptToRem(16),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    heading3: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    heading4: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(12),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(12),
      color: "#000000",
      textAlign: "right",
      lineHeight: "1.5",
    },
    date: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(12),
      color: "#000000",
      textAlign: "right",
      lineHeight: "1.5",
    },
  },

  /* ── 重点实验室基金指南预设 ── */
  /* 标题方正小标宋简体二号居中单倍行距, 一级标题黑体四号, 正文仿宋四号, 行间距26磅 */
  lab_fund: {
    title: {
      fontFamily: getFontFamily("方正小标宋简体"),
      fontSize: ptToRem(22),
      fontWeight: "normal",
      color: "#000000",
      textAlign: "center",
      lineHeight: "1",
      marginBottom: "0.5em",
    },
    heading1: {
      fontFamily: getFontFamily("黑体"),
      fontSize: ptToRem(14),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    heading2: {
      fontFamily: getFontFamily("楷体_GB2312"),
      fontSize: ptToRem(14),
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    heading3: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      fontWeight: "bold",
      color: "#000000",
      textAlign: "left",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    body: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      color: "#000000",
      textAlign: "justify",
      textIndent: "2em",
      lineHeight: "1.5",
    },
    signature: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      color: "#000000",
      textAlign: "right",
      lineHeight: "1.5",
    },
    date: {
      fontFamily: getFontFamily("仿宋_GB2312"),
      fontSize: ptToRem(14),
      color: "#000000",
      textAlign: "right",
      lineHeight: "1.5",
    },
  },
};

/* ──────── 根据 style_type 选择 HTML 元素标签 ──────── */
const tagForStyle = (st: string): string => {
  if (st === "title") return "h1";
  if (st === "subtitle") return "h2";
  if (st === "heading1") return "h2";
  if (st === "heading2") return "h3";
  if (st === "heading3" || st === "heading4") return "h4";
  return "p";
};

/* ──────── 段落间距规则 ──────── */
/** 根据当前/前一个段落的 style_type 计算 marginTop，提供视觉层次 */
const getSpacingTop = (curType: string, prevType: string | null): string => {
  if (!prevType) return "0"; // 第一段无上间距
  // 标题前留较大间距（除非前一个也是标题或它自身是 title）
  if (curType === "title") return "0";
  if (curType === "subtitle" && prevType === "title") return "0.2em";
  if (
    curType === "recipient" &&
    (prevType === "title" || prevType === "subtitle")
  )
    return "0.8em";
  if (curType.startsWith("heading") && !prevType.startsWith("heading"))
    return "1em";
  if (curType.startsWith("heading") && prevType.startsWith("heading"))
    return "0.4em";
  // 署名/日期上方留间距
  if (
    (curType === "signature" || curType === "date") &&
    prevType !== "signature" &&
    prevType !== "date"
  )
    return "1.5em";
  // 附件前留间距
  if (curType === "attachment" && prevType !== "attachment") return "1.2em";
  return "0";
};

/* ════════════════════════════════════════════════════════════
 * 组件
 * ════════════════════════════════════════════════════════════ */

export const StructuredDocRenderer: React.FC<StructuredDocRendererProps> =
  React.memo(
    ({
      paragraphs,
      preset = "official",
      streaming = false,
      onParagraphsChange,
      onAcceptChange,
      onRejectChange,
    }) => {
      const presetStyles = STYLE_PRESETS[preset] || STYLE_PRESETS.official;
      const defaultStyle = presetStyles.body;
      const editable = !streaming && !!onParagraphsChange;

      // 是否包含任何变更标记
      const hasChanges = React.useMemo(
        () => paragraphs?.some((p) => p._change) ?? false,
        [paragraphs],
      );

      // 预处理：归一化 + 过滤空段落，同时记录原始索引映射
      const { validParagraphs, origIndexMap } = React.useMemo(() => {
        if (!paragraphs)
          return {
            validParagraphs: [] as (StructuredParagraph & {
              style_type: string;
            })[],
            origIndexMap: [] as number[],
          };
        const vp: (StructuredParagraph & { style_type: string })[] = [];
        const idxMap: number[] = [];
        paragraphs.forEach((p, i) => {
          const text = (p.text ?? "").toString();
          const st = normalizeStyleType(p.style_type);
          if (text.trim().length > 0) {
            vp.push({ ...p, text, style_type: st });
            idxMap.push(i);
          }
        });
        return { validParagraphs: vp, origIndexMap: idxMap };
      }, [paragraphs]);

      /** 更新某个 validParagraphs[vidx] 对应的原始段落字段 */
      const updateParagraph = React.useCallback(
        (vidx: number, patch: Partial<StructuredParagraph>) => {
          if (!onParagraphsChange) return;
          const origIdx = origIndexMap[vidx];
          if (origIdx == null) return;
          const updated = paragraphs.map((p, i) =>
            i === origIdx ? { ...p, ...patch } : p,
          );
          onParagraphsChange(updated);
        },
        [onParagraphsChange, paragraphs, origIndexMap],
      );

      if (validParagraphs.length === 0) {
        return (
          <div className="text-gray-400 text-center py-8 text-sm">
            等待 AI 输出结构化内容…
          </div>
        );
      }

      // 统计各类型段落数
      const typeCount: Record<string, number> = {};
      for (const p of validParagraphs) {
        typeCount[p.style_type] = (typeCount[p.style_type] || 0) + 1;
      }
      // 是否包含颜色信息
      const hasColor = validParagraphs.some(
        (p) => p.color && p.color !== "#000000",
      );

      // #16 渐进式渲染：段落 >200 时分批显示，避免 DOM 卡顿
      const PROGRESSIVE_THRESHOLD = 200;
      const BATCH_SIZE = 100;
      const needsProgressive = validParagraphs.length > PROGRESSIVE_THRESHOLD;
      const [visibleCount, setVisibleCount] = useState(
        needsProgressive ? BATCH_SIZE : validParagraphs.length,
      );
      const sentinelRef = useRef<HTMLDivElement>(null);

      // 当段落总数变化时重置渲染范围
      useEffect(() => {
        setVisibleCount(
          validParagraphs.length > PROGRESSIVE_THRESHOLD
            ? BATCH_SIZE
            : validParagraphs.length,
        );
      }, [validParagraphs.length]);

      // IntersectionObserver 自动加载更多段落
      useEffect(() => {
        if (!needsProgressive || visibleCount >= validParagraphs.length) return;
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) {
              setVisibleCount((prev) =>
                Math.min(prev + BATCH_SIZE, validParagraphs.length),
              );
            }
          },
          { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
      }, [needsProgressive, visibleCount, validParagraphs.length]);

      const renderParagraphs = needsProgressive
        ? validParagraphs.slice(0, visibleCount)
        : validParagraphs;

      // 预计算第一个和最后一个 attachment 段落索引（版记区反线定位）
      let _firstAttachIdx = -1;
      let _lastAttachIdx = -1;
      for (let _ai = 0; _ai < renderParagraphs.length; _ai++) {
        if (
          (renderParagraphs[_ai].style_type || renderParagraphs[_ai].type) ===
          "attachment"
        ) {
          if (_firstAttachIdx === -1) _firstAttachIdx = _ai;
          _lastAttachIdx = _ai;
        }
      }

      return (
        <div className="structured-doc-wrapper">
          {/* A4 纸模拟容器 */}
          <div
            className="structured-doc"
            style={{
              background: "#fff",
              padding: "56px 64px 48px",
              maxWidth: "800px",
              margin: "0 auto",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              borderRadius: "4px",
              minHeight: "400px",
            }}
          >
            {renderParagraphs.map((para, idx) => {
              const st = para.style_type;
              const prevSt =
                idx > 0 ? renderParagraphs[idx - 1].style_type : null;
              const tag = tagForStyle(st);
              const change = para._change; // "added" | "deleted" | "modified" | null

              // 基础样式 = 预设默认
              const style: React.CSSProperties = {
                margin: 0,
                padding: 0,
                ...(presetStyles[st] || defaultStyle),
              };

              // 段落间距
              const spacingTop = getSpacingTop(st, prevSt);
              if (spacingTop !== "0") style.marginTop = spacingTop;

              /* ── 用 LLM 富格式属性覆盖预设 ── */
              if (para.font_size) {
                const fs = resolveFontSize(para.font_size);
                if (fs) style.fontSize = fs;
              }
              if (para.font_family) {
                style.fontFamily = getFontFamily(para.font_family);
              }
              if (para.bold !== undefined && para.bold !== null) {
                style.fontWeight = para.bold ? "bold" : "normal";
              }
              if (para.italic !== undefined && para.italic !== null) {
                style.fontStyle = para.italic ? "italic" : "normal";
              }
              // 颜色
              if (para.color) {
                const c = resolveColor(para.color);
                if (c) style.color = c;
              }
              // school_notice_redhead 强制规则：title 必须红色，subtitle 必须居中黑色
              if (preset === "school_notice_redhead") {
                if (st === "title") {
                  style.color = "#CC0000";
                  style.letterSpacing = "0.6em";
                } else if (st === "subtitle") {
                  style.color = "#000000";
                  style.textAlign = "center";
                  style.textIndent = "0";
                }
              }
              {
                const ind = normalizeIndent(para.indent);
                if (ind !== undefined) style.textIndent = ind;
              }
              {
                const align = normalizeAlignment(para.alignment);
                if (align) style.textAlign = align;
              }
              {
                const lh = resolveLineHeight(para.line_height);
                if (lh) style.lineHeight = lh;
              }
              // letter-spacing
              if (para.letter_spacing) {
                style.letterSpacing = para.letter_spacing;
              }

              // 有变更标记的段落不允许直接编辑（需要先接受/拒绝）
              const paraEditable = editable && !change;

              // 可编辑段落样式：悬浮高亮边框
              if (paraEditable) {
                style.outline = "none";
                style.borderRadius = "2px";
                style.transition = "box-shadow 0.15s";
                style.cursor = "text";
                style.minHeight = "1em";
              }

              // deleted 段落特殊样式
              if (change === "deleted") {
                style.textDecoration = "line-through";
                style.opacity = 0.6;
              }

              const isLast = idx === renderParagraphs.length - 1;

              // 红色分隔线
              const needRedLine =
                (preset === "official" || preset === "school_notice_redhead") &&
                st === "title" &&
                para.red_line !== false &&
                idx < renderParagraphs.length - 1;

              const canAddRedLine =
                paraEditable &&
                (preset === "official" || preset === "school_notice_redhead") &&
                st === "title" &&
                para.red_line === false &&
                idx < renderParagraphs.length - 1;

              // 版记反线：使用预计算的首个/末个 attachment 索引
              const isFirstAttachment = idx === _firstAttachIdx && idx > 0;
              const isLastAttachment = idx === _lastAttachIdx;
              const needFooterLine = isFirstAttachment;

              const canAddFooterLine =
                paraEditable &&
                st === "attachment" &&
                !isFirstAttachment &&
                idx > 0 &&
                prevSt !== "attachment";

              // 变更指示器样式（VS Code Copilot 风格）
              const changeConfig =
                change === "added"
                  ? {
                      bar: "#22c55e",
                      bg: "rgba(34,197,94,0.06)",
                      label: "新增",
                      labelBg: "bg-green-100 text-green-700 border-green-200",
                      icon: "+",
                    }
                  : change === "deleted"
                    ? {
                        bar: "#ef4444",
                        bg: "rgba(239,68,68,0.06)",
                        label: "删除",
                        labelBg: "bg-red-100 text-red-700 border-red-200",
                        icon: "−",
                      }
                    : change === "modified"
                      ? {
                          bar: "#3b82f6",
                          bg: "rgba(59,130,246,0.05)",
                          label: "修改",
                          labelBg: "bg-blue-100 text-blue-700 border-blue-200",
                          icon: "~",
                        }
                      : {
                          bar: "transparent",
                          bg: "transparent",
                          label: "",
                          labelBg: "",
                          icon: "",
                        };

              return (
                <React.Fragment key={stableParaKey(para, idx)}>
                  {/* 版记反线（attachment 段落上方，细上粗下） */}
                  {needFooterLine && (
                    <div
                      className="group relative flex flex-col"
                      style={{ margin: "16px 0 8px", padding: "4px 0" }}
                    >
                      <div className="flex items-center">
                        <div style={{ flex: 1 }}>
                          <hr
                            style={{
                              border: "none",
                              borderTop: "1px solid #000000",
                              margin: 0,
                            }}
                            aria-hidden="true"
                          />
                          <hr
                            style={{
                              border: "none",
                              borderTop: "2px solid #000000",
                              margin: "2px 0 0",
                            }}
                            aria-hidden="true"
                          />
                        </div>
                        {paraEditable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateParagraph(idx, { footer_line: false });
                            }}
                            className="ml-2 opacity-30 group-hover:opacity-100 transition-opacity
                          bg-white border border-gray-300 rounded-full w-6 h-6 flex items-center justify-center
                          text-gray-400 hover:text-red-500 hover:border-red-300 shadow-sm cursor-pointer
                          flex-shrink-0"
                            style={{ fontSize: "14px", lineHeight: 1 }}
                            title="删除版记线"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {canAddFooterLine && (
                    <div
                      className="group relative cursor-pointer"
                      style={{ margin: "4px 0", height: "12px" }}
                      onClick={() =>
                        updateParagraph(idx, { footer_line: true })
                      }
                      title="点击添加版记线"
                    >
                      <hr
                        style={{
                          border: "none",
                          borderTop: "2px dashed #e5e7eb",
                          margin: "5px 0 0",
                        }}
                        className="group-hover:!border-t-gray-400 transition-colors"
                      />
                      <span
                        className="absolute left-1/2 -translate-x-1/2 -top-1 text-[10px] text-gray-300
                      group-hover:text-gray-500 transition-colors select-none"
                      >
                        + 版记线
                      </span>
                    </div>
                  )}
                  {/* ── 变更包装器（VS Code Copilot 风格） ── */}
                  {change ? (
                    <div
                      className="group/change relative my-1.5 rounded-md transition-all duration-200"
                      style={{
                        borderLeft: `3px solid ${changeConfig.bar}`,
                        background: changeConfig.bg,
                        padding: "8px 12px 6px",
                      }}
                    >
                      {/* 顶部操作栏：变更类型标签 + 接受/拒绝按钮 */}
                      <div
                        className="flex items-center justify-between mb-1.5 select-none"
                        style={{ minHeight: "22px" }}
                      >
                        {/* 变更类型标签 */}
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${changeConfig.labelBg}`}
                        >
                          <span className="font-mono">{changeConfig.icon}</span>
                          {changeConfig.label}
                        </span>

                        {/* 接受/拒绝按钮组 —— 始终可见但 hover 时高亮 */}
                        {(onAcceptChange || onRejectChange) && (
                          <div className="flex items-center gap-1 opacity-60 group-hover/change:opacity-100 transition-opacity">
                            {onAcceptChange && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAcceptChange(idx);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md
                              bg-green-50 text-green-700 border border-green-200
                              hover:bg-green-500 hover:text-white hover:border-green-500
                              transition-colors cursor-pointer shadow-sm"
                                title={
                                  change === "deleted" ? "确认删除" : "接受修改"
                                }
                              >
                                ✓{" "}
                                <span className="hidden sm:inline">
                                  {change === "deleted" ? "确认" : "接受"}
                                </span>
                              </button>
                            )}
                            {onRejectChange && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRejectChange(idx);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md
                              bg-gray-50 text-gray-500 border border-gray-200
                              hover:bg-red-500 hover:text-white hover:border-red-500
                              transition-colors cursor-pointer shadow-sm"
                                title={
                                  change === "deleted" ? "保留段落" : "拒绝修改"
                                }
                              >
                                ✗{" "}
                                <span className="hidden sm:inline">
                                  {change === "deleted" ? "保留" : "拒绝"}
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* modified: 原文 → 新文 对比 */}
                      {change === "modified" && para._original_text && (
                        <div className="mb-1 rounded overflow-hidden border border-gray-100">
                          {/* 原文行 */}
                          <div
                            className="flex items-start gap-2 px-2 py-1"
                            style={{ background: "rgba(239,68,68,0.06)" }}
                          >
                            <span className="flex-shrink-0 text-[11px] font-mono text-red-400 mt-0.5 select-none w-4 text-center">
                              −
                            </span>
                            <span
                              className="text-sm text-red-600/80 line-through"
                              style={{
                                wordBreak: "break-all",
                                lineHeight: 1.6,
                              }}
                            >
                              {para._original_text}
                            </span>
                          </div>
                          {/* 新文行 */}
                          <div
                            className="flex items-start gap-2 px-2 py-1"
                            style={{ background: "rgba(34,197,94,0.06)" }}
                          >
                            <span className="flex-shrink-0 text-[11px] font-mono text-green-500 mt-0.5 select-none w-4 text-center">
                              +
                            </span>
                            <span
                              className="text-sm text-green-700 font-medium"
                              style={{
                                wordBreak: "break-all",
                                lineHeight: 1.6,
                              }}
                            >
                              {para.text}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 非 modified 或无原文时显示段落内容 */}
                      {(change !== "modified" || !para._original_text) &&
                        React.createElement(tag, {
                          style: {
                            ...style,
                            ...(change === "added" ? { color: "#15803d" } : {}),
                          },
                          className: paraEditable
                            ? "hover:ring-1 hover:ring-blue-300 focus:ring-2 focus:ring-blue-400"
                            : undefined,
                          "data-style-type": st,
                          ...(st === "title"
                            ? { role: "heading", "aria-level": 1 }
                            : {}),
                          children: (
                            <>
                              {para.text}
                              {streaming && isLast && (
                                <span
                                  className="inline-block w-[2px] h-[1em] bg-blue-500 ml-0.5 align-text-bottom"
                                  style={{
                                    animation: "blink 1s step-end infinite",
                                  }}
                                />
                              )}
                            </>
                          ),
                        })}

                      {/* modified 时也在对比框下方用正式样式渲染（带实际排版效果） */}
                      {change === "modified" &&
                        para._original_text &&
                        React.createElement(tag, {
                          style: { ...style, marginTop: "4px" },
                          "data-style-type": st,
                          ...(st === "title"
                            ? { role: "heading", "aria-level": 1 }
                            : {}),
                          children: (
                            <>
                              {para.text}
                              {streaming && isLast && (
                                <span
                                  className="inline-block w-[2px] h-[1em] bg-blue-500 ml-0.5 align-text-bottom"
                                  style={{
                                    animation: "blink 1s step-end infinite",
                                  }}
                                />
                              )}
                            </>
                          ),
                        })}

                      {/* 变更原因提示 */}
                      {para._change_reason && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400 select-none">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 border border-gray-150 rounded text-gray-500">
                            💡 {para._change_reason}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── 无变更：正常渲染（可编辑） ── */
                    <>
                      {React.createElement(tag, {
                        style:
                          para._confidence === "low"
                            ? {
                                ...style,
                                background: "rgba(251,191,36,0.08)",
                                borderLeft: "3px solid #f59e0b",
                                paddingLeft: "8px",
                              }
                            : style,
                        className: paraEditable
                          ? "hover:ring-1 hover:ring-blue-300 focus:ring-2 focus:ring-blue-400"
                          : undefined,
                        "data-style-type": st,
                        ...(st === "title"
                          ? { role: "heading", "aria-level": 1 }
                          : {}),
                        // ── 直接编辑支持 ──
                        contentEditable: paraEditable ? true : undefined,
                        suppressContentEditableWarning: paraEditable
                          ? true
                          : undefined,
                        onBlur: paraEditable
                          ? (e: React.FocusEvent<HTMLElement>) => {
                              const newText = e.currentTarget.textContent || "";
                              if (newText !== para.text) {
                                updateParagraph(idx, { text: newText });
                              }
                            }
                          : undefined,
                        onKeyDown: paraEditable
                          ? (e: React.KeyboardEvent<HTMLElement>) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.currentTarget as HTMLElement).blur();
                              }
                            }
                          : undefined,
                        dangerouslySetInnerHTML: undefined,
                        children: (
                          <>
                            {para.text}
                            {streaming && isLast && (
                              <span
                                className="inline-block w-[2px] h-[1em] bg-blue-500 ml-0.5 align-text-bottom"
                                style={{
                                  animation: "blink 1s step-end infinite",
                                }}
                              />
                            )}
                          </>
                        ),
                      })}
                      {para._confidence === "low" && (
                        <div className="flex items-center gap-1 mt-0.5 ml-2 text-[10px] text-amber-500 select-none">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">
                            ⚠ 此段落样式由规则引擎推断，置信度较低，建议人工确认
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {/* 红色分隔线（可编辑时带删除按钮） */}
                  {needRedLine && (
                    <div
                      className="group relative flex items-center"
                      style={{ margin: "8px 0 12px", padding: "6px 0" }}
                    >
                      <hr
                        style={{
                          border: "none",
                          borderTop: "2.25px solid #cc0000",
                          margin: 0,
                          flex: 1,
                        }}
                        aria-hidden="true"
                      />
                      {paraEditable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateParagraph(idx, { red_line: false });
                          }}
                          className="ml-2 opacity-30 group-hover:opacity-100 transition-opacity
                        bg-white border border-gray-300 rounded-full w-6 h-6 flex items-center justify-center
                        text-gray-400 hover:text-red-500 hover:border-red-300 shadow-sm cursor-pointer
                        flex-shrink-0"
                          style={{ fontSize: "14px", lineHeight: 1 }}
                          title="删除红色分隔线"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                  {/* 标题无红线时：可编辑状态下显示"添加红线"提示 */}
                  {canAddRedLine && (
                    <div
                      className="group relative cursor-pointer"
                      style={{ margin: "4px 0", height: "12px" }}
                      onClick={() => updateParagraph(idx, { red_line: true })}
                      title="点击添加红色分隔线"
                    >
                      <hr
                        style={{
                          border: "none",
                          borderTop: "2px dashed #e5e7eb",
                          margin: "5px 0 0",
                        }}
                        className="group-hover:!border-t-red-300 transition-colors"
                      />
                      <span
                        className="absolute left-1/2 -translate-x-1/2 -top-1 text-[10px] text-gray-300
                      group-hover:text-red-400 transition-colors select-none"
                      >
                        + 红线
                      </span>
                    </div>
                  )}
                  {/* 版记区底部封线（最后一个 attachment 段落下方，上细下粗双反线，与顶部对称） */}
                  {isLastAttachment && (
                    <div style={{ margin: "8px 0 4px", padding: "0" }}>
                      <hr
                        style={{
                          border: "none",
                          borderTop: "1px solid #000000",
                          margin: 0,
                        }}
                        aria-hidden="true"
                      />
                      <hr
                        style={{
                          border: "none",
                          borderTop: "2px solid #000000",
                          margin: "2px 0 0",
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* #16 渐进式渲染：加载更多哨兵 */}
          {needsProgressive && visibleCount < validParagraphs.length && (
            <div
              ref={sentinelRef}
              className="text-center text-xs text-gray-400 py-4 select-none"
            >
              已显示 {visibleCount} / {validParagraphs.length} 段，滚动加载更多…
            </div>
          )}

          {/* 段落统计（非流式时显示） */}
          {!streaming && validParagraphs.length > 0 && (
            <div
              className="text-center text-[10px] text-gray-400 mt-3 select-none"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              共 {validParagraphs.length} 段
              {typeCount.title ? ` · 标题 ${typeCount.title}` : ""}
              {(typeCount.heading1 || 0) +
                (typeCount.heading2 || 0) +
                (typeCount.heading3 || 0) +
                (typeCount.heading4 || 0) >
              0
                ? ` · 标题层级 ${(typeCount.heading1 || 0) + (typeCount.heading2 || 0) + (typeCount.heading3 || 0) + (typeCount.heading4 || 0)}`
                : ""}
              {typeCount.body ? ` · 正文 ${typeCount.body}` : ""}
              {/* 富格式属性指示 */}
              {validParagraphs.some((p) => p.font_size || p.font_family)
                ? " · 📐 含排版格式"
                : ""}
              {hasColor ? " · 🎨 含颜色" : ""}
              {/* 变更统计（增强版） */}
              {hasChanges &&
                (() => {
                  const added = validParagraphs.filter(
                    (p) => p._change === "added",
                  ).length;
                  const deleted = validParagraphs.filter(
                    (p) => p._change === "deleted",
                  ).length;
                  const modified = validParagraphs.filter(
                    (p) => p._change === "modified",
                  ).length;
                  const total = added + deleted + modified;
                  return (
                    <span className="inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full">
                      <span className="text-blue-600 font-medium">
                        {total} 处变更
                      </span>
                      {added > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-green-600 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          +{added}
                        </span>
                      )}
                      {deleted > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-red-500 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                          −{deleted}
                        </span>
                      )}
                      {modified > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-blue-600 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                          ~{modified}
                        </span>
                      )}
                    </span>
                  );
                })()}
            </div>
          )}
        </div>
      );
    },
  );

export default StructuredDocRenderer;
