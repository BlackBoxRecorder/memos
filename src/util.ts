// ====== HTTP Response Helper ======
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ====== HTTP Client Helper ======
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await resp.json();
  if (!resp.ok)
    throw new Error(data.error || `Request failed (${resp.status})`);
  return data as T;
}

// ====== Date Formatter ======
export function formatDate(d: string): string {
  try {
    const date = new Date(d + "Z");
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

// ====== String Helpers ======
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

/**
 * 计算文本包含的“字数”
 * - 汉字：每个汉字算 1 字（匹配基本汉字区和兼容汉字区）
 * - 英文单词：连续的字母序列（允许单词内部出现撇号、连字符，如 don't、high-level）
 * - 不统计标点、特殊符号、数字等
 *
 * @param text 输入文本
 * @returns 字数统计结果
 */
export function countWords(text: string): number {
  if (!text) return 0;

  // 1. 统计汉字数量（包括基本汉字及扩展 A 区等）
  const hanRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
  const hanCount = (text.match(hanRegex) || []).length;

  // 2. 统计英文单词数量
  // 先移除所有汉字，避免影响单词边界的识别
  const withoutHan = text.replace(hanRegex, " ");
  // 匹配英文单词：至少一个字母开头，内部可包含撇号或连字符
  const wordRegex = /[a-zA-Z]+(?:[''-][a-zA-Z]+)*/g;
  const englishWords = withoutHan.match(wordRegex) || [];
  const englishCount = englishWords.length;

  return hanCount + englishCount;
}
