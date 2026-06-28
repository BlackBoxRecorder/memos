// 首次启动数据初始化 — 导入内置 prompts 和示例 memos
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAllPrompts,
  createPrompt,
  getMemos,
  importMemo,
  countMemos,
} from "../db";

const DATA_DIR = join(import.meta.dir, "../../data");
const PROMPTS_DIR = join(DATA_DIR, "prompts");
const MEMOS_FILE = join(DATA_DIR, "memos.txt");

function seedPromptsIfEmpty(): void {
  const existing = getAllPrompts();
  if (existing.length > 0) {
    console.log("[seed] prompts 表非空，跳过内置提示词导入");
    return;
  }

  // 读取 data/prompts/ 目录下的所有 .txt 文件
  let files: string[];
  try {
    files = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".txt"));
  } catch {
    console.warn(`[seed] prompts 目录不存在: ${PROMPTS_DIR}`);
    return;
  }

  if (files.length === 0) {
    console.log("[seed] prompts 目录无 .txt 文件，跳过");
    return;
  }

  let inserted = 0;
  for (const file of files) {
    try {
      const content = readFileSync(join(PROMPTS_DIR, file), "utf-8").trim();
      if (!content) continue;

      // 文件名（不含扩展名）作为提示词标题
      const title = file.replace(/\.txt$/, "");
      const existingTitles = new Set(existing.map((p) => p.title));
      if (existingTitles.has(title)) {
        console.log(`[seed] 提示词 "${title}" 已存在，跳过`);
        continue;
      }

      createPrompt(title, content);
      existing.push({ id: -1, title, content, created_at: "", updated_at: "" });
      inserted++;
    } catch (err) {
      console.error(`[seed] 导入提示词文件 "${file}" 失败:`, err);
    }
  }
  console.log(
    `[seed] 内置提示词导入完成: 共 ${files.length} 个文件，成功 ${inserted} 个`,
  );
}

/** 从条目中解析日期行 --YYYY-MM-DD--，返回日期和纯内容；无日期行返回 null */
function parseMemoDate(
  entry: string,
): { date: string; content: string } | null {
  const match = entry.match(/^--(\d{4}-\d{2}-\d{2})--/m);
  if (!match) return null;
  const dateStr = match[1];
  // 移除日期行，保留后续内容
  const content = entry.replace(/^--\d{4}-\d{2}-\d{2}--[\r\n]*/m, "").trim();
  if (!content) return null;
  return { date: `${dateStr}T00:00:00`, content };
}

function seedMemosIfEmpty(): void {
  const count = countMemos({ includePrivate: true });
  if (count > 0) {
    console.log("[seed] memos 表非空，跳过示例数据导入");
    return;
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(MEMOS_FILE, "utf-8");
  } catch {
    console.warn(`[seed] 示例数据文件不存在: ${MEMOS_FILE}`);
    return;
  }

  const entries = rawContent
    .split("---")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // 防止重复（虽然表是空的，但保持健壮性）
  const existingMemos = getMemos({ includePrivate: true });
  const existingContents = new Set(existingMemos.map((m) => m.content));

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const parsed = parseMemoDate(entry);
    if (!parsed) {
      console.warn(`[seed] 跳过无日期行的条目 [${entry.slice(0, 50)}...]`);
      continue;
    }

    if (existingContents.has(parsed.content)) {
      skipped++;
      continue;
    }
    try {
      importMemo({
        content: parsed.content,
        tags: [],
        is_public: true,
        created_at: parsed.date,
      });
      existingContents.add(parsed.content);
      inserted++;
    } catch (err) {
      console.error(
        `[seed] 示例 memo 导入失败 [${parsed.content.slice(0, 50)}...]:`,
        err,
      );
    }
  }

  console.log(
    `[seed] 示例数据导入完成: 共 ${entries.length} 条，插入 ${inserted} 条，跳过 ${skipped} 条`,
  );
}

/** 首次启动时初始化种子数据（内置 prompts + 示例 memos） */
export function initSeedData(): void {
  console.log("[seed] 开始检查种子数据...");
  seedPromptsIfEmpty();
  seedMemosIfEmpty();
}
