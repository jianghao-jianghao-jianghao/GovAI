/**
 * HTML 消毒工具 — 防止 XSS 攻击
 *
 * 使用 DOMPurify 过滤所有 dangerouslySetInnerHTML 的内容，
 * 移除 <script>, <iframe>, onerror 等危险标签/属性。
 */
import DOMPurify from "dompurify";

// 默认允许的标签和属性（覆盖公文排版需要的所有 HTML 元素）
const PURIFY_CONFIG: DOMPurify.Config = {
  // 允许常用排版标签
  ALLOWED_TAGS: [
    // 文本
    "p", "span", "div", "br", "hr",
    // 标题
    "h1", "h2", "h3", "h4", "h5", "h6",
    // 格式
    "strong", "b", "em", "i", "u", "s", "del", "sub", "sup", "mark",
    // 列表
    "ul", "ol", "li",
    // 表格
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    // 引用/代码
    "blockquote", "pre", "code",
    // 链接（仅 href）
    "a",
    // 注释占位
    // "img" 不允许 — 防止 onerror XSS
  ],
  // 允许的属性
  ALLOWED_ATTR: [
    "style", "class", "id",
    "href", "target", "rel", "title",
    "colspan", "rowspan", "align", "valign",
    "contenteditable", "suppresscontenteditablewarning",
    "data-index", "data-style-type",
  ],
  // 禁止危险协议
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  // 不允许 data: URI（防止 base64 注入）
  ALLOW_DATA_ATTR: false,
};

/**
 * 消毒 HTML 字符串，移除所有潜在 XSS 载体。
 * 所有 dangerouslySetInnerHTML 必须经过此函数。
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG) as string;
}

/**
 * 宽松模式消毒（允许 img 标签，用于需要显示图片的场景）
 */
export function sanitizeHtmlWithImages(dirty: string): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ...PURIFY_CONFIG,
    ALLOWED_TAGS: [...(PURIFY_CONFIG.ALLOWED_TAGS as string[]), "img"],
    ALLOWED_ATTR: [...(PURIFY_CONFIG.ALLOWED_ATTR as string[]), "src", "alt", "width", "height"],
  }) as string;
}
