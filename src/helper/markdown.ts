// Markdown 渲染工具 — marked 解析 + DOMPurify 安全清洗
// BROWSER-ONLY: 依赖 document API 和 DOMPurify (需要 window 环境)
import { Marked } from "marked";
import DOMPurify from "dompurify";
import type { Config as PurifyConfig } from "dompurify";

if (typeof window === "undefined") {
  throw new Error("markdown.ts 仅可在浏览器环境中使用");
}

// --- marked 实例配置 ---
const markedInstance = new Marked({
  breaks: false,
  gfm: true,
});

// --- DOMPurify 白名单配置 ---
const PURIFY_CONFIG: PurifyConfig = {
  ALLOWED_TAGS: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "a",
    "pre",
    "code",
  ],
  ALLOWED_ATTR: ["href"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

const STRIP_TAGS_CONFIG: PurifyConfig = { ALLOWED_TAGS: [] };

/**
 * 将 markdown 文本渲染为安全的 HTML 字符串。
 * 返回的 HTML 已经过 DOMPurify 清洗，可直接用于 innerHTML。
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";
  const rawHtml = markedInstance.parse(text) as string;
  return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
}

/**
 * 去除 HTML 标签，仅保留纯文本。
 */
export function stripHtmlTags(html: string): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = DOMPurify.sanitize(html, STRIP_TAGS_CONFIG);
  return div.textContent || "";
}

/** 截断结果 */
export interface TruncateResult {
  html: string;
  truncated: boolean;
}

/**
 * 将渲染后的 HTML 按可见字符数截断，保持标签闭合。
 * 截断后在末尾追加 "..."。
 *
 * @param html - 已通过 renderMarkdown 处理的干净 HTML
 * @param maxLen - 可见字符数上限（不含HTML标签）
 */
export function truncateRendered(html: string, maxLen: number): TruncateResult {
  if (!html) return { html: "", truncated: false };
  if (maxLen <= 0) return { html: "", truncated: false };

  const container = document.createElement("div");
  container.innerHTML = html;

  let charCount = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    const text = node.textContent || "";
    if (charCount + text.length > maxLen) {
      const remaining = maxLen - charCount;
      node.textContent = text.slice(0, remaining) + "...";
      removeFollowingSiblings(node);
      removeAfterNode(node);
      return { html: container.innerHTML, truncated: true };
    }
    charCount += text.length;
  }

  return { html: container.innerHTML, truncated: false };
}

/** 移除 node 之后的所有兄弟节点 */
function removeFollowingSiblings(node: Node): void {
  let sibling = node.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    sibling.parentNode?.removeChild(sibling);
    sibling = next;
  }
}

/** 移除 node 所在父元素及其祖先的所有后续节点 */
function removeAfterNode(node: Node): void {
  // 从父节点开始，跳过当前层级（兄弟已在调用处清理）
  let current: Node | null = node.parentNode;
  while (current) {
    removeFollowingSiblings(current);
    current = current.parentNode;
  }
}
