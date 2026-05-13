// AI 提示词文件加载器 — 从 data/system-prompts/ 读取 .txt，内置中文 fallback
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dir, "../../data/system-prompts");

// 内存缓存
const cache = new Map<string, string>();

// 中文 fallback 提示词 — 确保在文件缺失时功能不受影响
const FALLBACKS: Record<string, string> = {
  optimize: `你是一位个人便签应用的写作助手。优化用户的便签内容：
- 提炼并阐明核心观点
- 自然地突出关键信息
- 保持语言流畅自然
- 在不丢失原意的前提下使表达更精炼
- 如果内容过于简略，适当扩展并丰富
- 只返回优化后的文本，不要包含解释或前缀`,

  "suggest-tags": `你是一个标签建议助手。分析内容并推荐最合适的1-3个标签。
{EXISTING_TAGS}优先复用现有标签（当它们适合时）。只有在没有合适标签时才建议新的简洁标签。
只返回一个JSON字符串数组，如["标签1", "标签2"]。不要包含解释。`,
};

// 记录已打印过警告的文件名，避免重复日志
const warned = new Set<string>();

function loadPromptFile(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;

  try {
    const content = readFileSync(
      join(PROMPTS_DIR, `${name}.txt`),
      "utf-8",
    ).trim();
    if (content) {
      cache.set(name, content);
      return content;
    }
  } catch {
    // 文件不存在，使用 fallback
  }
  return null;
}

function getPrompt(name: string): string {
  const loaded = loadPromptFile(name);
  if (loaded) return loaded;

  const fallback = FALLBACKS[name];
  if (fallback) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(
        `[prompts] 提示词文件 "${name}.txt" 未找到，使用内置备用提示词`,
      );
    }
    return fallback;
  }

  console.error(`[prompts] 未知提示词: ${name}`);
  return "";
}

/** 获取内容优化 system prompt */
export function getOptimizePrompt(): string {
  return getPrompt("optimize");
}

/** 获取标签建议 system prompt（含 {EXISTING_TAGS} 占位符） */
export function getSuggestTagsPrompt(): string {
  return getPrompt("suggest-tags");
}
