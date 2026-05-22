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

  summarize: `你是一位个人便签应用的写作助手。请对以下内容进行摘要：
- 用2-3句话提炼核心内容
- 保留关键信息和主要观点
- 语言简洁精炼
- 只返回摘要文本，不要包含解释或前缀`,

  rewrite: `你是一位个人便签应用的写作助手。请按{STYLE}风格重写以下内容：
- 保持原意不变
- 调整语气和表达方式以匹配指定风格
- 在不丢失原意的前提下使表达更自然
- 只返回改写后的文本，不要包含解释或前缀`,

  expand: `你是一位个人便签应用的写作助手。请基于以下简短想法展开为完整段落：
- 增加细节和连贯性
- 保持主题聚焦
- 使内容更加丰富和完整
- 只返回扩写后的文本，不要包含解释或前缀`,

  "extract-keypoints": `你是一位个人便签应用的写作助手。请从以下内容中提取关键要点：
- 以 - 列表形式输出
- 每点一行，简洁明确
- 提取最重要的信息
- 只返回要点列表，不要包含解释或前缀`,

  polish: `你是一位个人便签应用的写作助手。优化用户的便签内容：
- 提炼并阐明核心观点
- 自然地突出关键信息
- 保持语言流畅自然
- 在不丢失原意的前提下使表达更精炼
- 如果内容过于简略，适当扩展并丰富
- 只返回优化后的文本，不要包含解释或前缀`,
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

// --- AI 写作工具箱 Prompts ---

/** 获取摘要 system prompt */
export function getSummarizePrompt(): string {
  return getPrompt("summarize");
}

/** 获取改写 system prompt（含 {STYLE} 占位符） */
export function getRewritePrompt(style: string): string {
  return getPrompt("rewrite").replace("{STYLE}", style);
}

/** 获取扩写 system prompt */
export function getExpandPrompt(): string {
  return getPrompt("expand");
}

/** 获取要点提炼 system prompt */
export function getKeypointsPrompt(): string {
  return getPrompt("extract-keypoints");
}

/** 获取润色 system prompt（复用 optimize） */
export function getPolishPrompt(): string {
  return getPrompt("polish");
}
