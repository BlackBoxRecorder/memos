import { Hono } from "hono";
import { authMiddleware } from "../auth";
import {
  getMemos,
  getAllCreativeItems,
  importMemo,
  importCreativeItem,
  ensureDefaultPrompt,
  memoContentExists,
  creativeContentExists,
  getDb,
} from "../db";
import { generateAndStoreEmbedding } from "../ai/embeddings";
import type { Memo, CreativeItem } from "../model";

export const exportImportApp = new Hono();

// ====== Format helpers ======

/** Format a SQLite datetime string to YYYY-MM-DD HH:MM:SS for export. */
function formatExportDate(d: string): string {
  // SQLite datetime format: "2026-05-14 10:36:28" or ISO with T
  return d.replace("T", " ");
}

/** Build a single export record block from metadata and content. */
function buildRecord(
  metadata: Record<string, string>,
  content: string,
): string {
  let block = "======\n";
  block += "—\n";
  for (const [key, value] of Object.entries(metadata)) {
    block += `${key}:${value}\n`;
  }
  block += "—\n";
  block += content + "\n";
  return block;
}

/** Format all memos and creative items into the export text format. */
function formatExportData(
  memos: Memo[],
  creativeItems: CreativeItem[],
): string {
  const blocks: string[] = [];

  for (const m of memos) {
    blocks.push(
      buildRecord(
        {
          date: formatExportDate(m.created_at),
          tags: m.tags.join(","),
          isPrivate: m.is_public ? "false" : "true",
          type: "memo",
          ...(m.pinned_at ? { pinned: m.pinned_at } : {}),
        },
        m.content,
      ),
    );
  }

  for (const c of creativeItems) {
    blocks.push(
      buildRecord(
        {
          date: formatExportDate(c.created_at),
          type: "creative",
        },
        c.content,
      ),
    );
  }

  return blocks.join("\n");
}

// ====== Parse helpers ======

interface ParsedRecord {
  type: "memo" | "creative";
  date: string;
  tags: string[];
  isPrivate?: boolean;
  pinnedAt?: string | null;
  content: string;
}

/** Parse a single record block. Returns null if the block is invalid or empty. */
function parseRecord(block: string): ParsedRecord | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  // Find the metadata section between — delimiters
  const lines = trimmed.split("\n");

  let metaStart = -1;
  let metaEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "—") {
      if (metaStart === -1) {
        metaStart = i;
      } else if (metaEnd === -1) {
        metaEnd = i;
        break;
      }
    }
  }

  if (metaStart === -1 || metaEnd === -1) return null; // No metadata block found

  // Parse metadata lines (between metaStart+1 and metaEnd-1)
  const metadata: Record<string, string> = {};
  for (let i = metaStart + 1; i < metaEnd; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value !== undefined) {
      metadata[key] = value;
    }
  }

  // Type is required
  const type = metadata["type"];
  if (type !== "memo" && type !== "creative") return null;

  // Content is everything after the closing —
  const contentLines = lines.slice(metaEnd + 1);
  const content = contentLines.join("\n").trim();
  if (!content) return null;

  const record: ParsedRecord = {
    type: type as "memo" | "creative",
    date: metadata["date"] || "",
    tags: [],
    content,
  };

  if (type === "memo") {
    // Parse tags: comma-separated string or legacy single tag field
    const tagsRaw = metadata["tags"] || metadata["tag"] || "";
    record.tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    record.isPrivate = metadata["isPrivate"] === "true";
    record.pinnedAt = metadata["pinned"] || null;
  }

  return record;
}

/** Split full file text into record blocks separated by ======. */
function splitBlocks(text: string): string[] {
  // Split on ====== line (may have trailing whitespace)
  const blocks = text.split(/\n?======\n?/);
  return blocks.filter((b) => b.trim().length > 0);
}

// ====== Flomo HTML Parser ======

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHTMLEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => HTML_ENTITIES[match] ?? match,
  );
}

function htmlToPlainText(html: string): string {
  let text = html;

  // 处理自闭合标签
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n");

  // 块级元素结束标签 → 换行
  text = text.replace(/<\/(?:p|li|h[1-6]|div|tr)>/gi, "\n");

  // 列表/表格容器结束标签 → 换行
  text = text.replace(/<\/(?:ul|ol|table)>/gi, "\n");

  // 去除所有剩余标签
  text = text.replace(/<[^>]*>/g, "");

  // 解码 HTML 实体
  text = decodeHTMLEntities(text);

  // 规范化空白
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

function extractTags(text: string): string[] {
  const matches = text.match(/#([^\s#<>]+)/g);
  if (!matches) return [];
  const tags = matches.map((t) => t.slice(1));
  return [...new Set(tags)];
}

interface FlomoRecord {
  time: string;
  content: string;
  tags: string[];
}

function parseFlomoHTML(html: string): FlomoRecord[] {
  const records: FlomoRecord[] = [];

  const memoRegex =
    /<div class="memo">\s*([\s\S]*?)<\/div>\s*(?=<div class="memo">|\s*<\/div>\s*<script|$)/g;

  let match: RegExpExecArray | null;
  while ((match = memoRegex.exec(html)) !== null) {
    const block = match[1]!;

    // 提取时间
    const timeMatch = block.match(/<div class="time">\s*(.*?)\s*<\/div>/);
    const time = timeMatch ? timeMatch[1]!.trim() : "";

    // 提取内容 HTML
    const contentMatch = block.match(
      /<div class="content">\s*([\s\S]*?)\s*<\/div>/,
    );
    const contentHTML = contentMatch ? contentMatch[1]!.trim() : "";

    if (!contentHTML) continue;

    // HTML → 纯文本
    const plainText = htmlToPlainText(contentHTML);

    if (!plainText) continue;

    // 提取标签
    const tags = extractTags(plainText);

    records.push({ time, content: plainText, tags });
  }

  return records;
}

// ====== Endpoints ======

// GET /api/export — 导出所有数据为文本文件
exportImportApp.get("/export", authMiddleware, (c) => {
  const memos = getMemos({ includePrivate: true });
  const creativeItems = getAllCreativeItems();

  const text = formatExportData(memos, creativeItems);

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="memos-export-' +
        new Date().toISOString().slice(0, 10) +
        '.txt"',
    },
  });
});

// POST /api/import — 从上传的文本文件导入数据
exportImportApp.post("/import", authMiddleware, async (c) => {
  let fileContent: string | null = null;

  try {
    const body = await c.req.parseBody({ all: true });
    // Look for a file field — could be named "file" or be any File in the body
    for (const [, value] of Object.entries(body)) {
      if (value instanceof File) {
        fileContent = await value.text();
        break;
      }
    }
  } catch {
    return c.json({ error: "Invalid form data" }, 400);
  }

  if (!fileContent) {
    return c.json({ error: "No file uploaded" }, 400);
  }

  if (fileContent.trim().length === 0) {
    return c.json({ error: "Empty file" }, 400);
  }

  // Parse and import
  const blocks = splitBlocks(fileContent);
  if (blocks.length === 0) {
    return c.json({
      imported: 0,
      skipped: 0,
      message: "No valid records found",
    });
  }

  let imported = 0;
  let skipped = 0;
  let deduped = 0;
  const errors: string[] = [];
  let defaultPromptId: number | null = null;
  const importedMemoIds: number[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const record = parseRecord(blocks[i]!);
    if (!record) {
      skipped++;
      errors.push(`Record ${i + 1}: invalid format`);
      continue;
    }

    try {
      if (record.type === "memo") {
        // Dedup: skip if content already exists in database
        if (memoContentExists(record.content)) {
          deduped++;
          continue;
        }
        const memo = importMemo({
          content: record.content,
          tags: record.tags,
          is_public: !record.isPrivate,
          pinned_at: record.pinnedAt || undefined,
          created_at:
            record.date ||
            new Date().toISOString().replace("T", " ").slice(0, 19),
        });
        importedMemoIds.push(memo.id);
        imported++;
      } else if (record.type === "creative") {
        // Dedup: skip if content already exists in database
        if (creativeContentExists(record.content)) {
          deduped++;
          continue;
        }
        if (defaultPromptId === null) {
          defaultPromptId = ensureDefaultPrompt().id;
        }
        importCreativeItem({
          prompt_id: defaultPromptId,
          content: record.content,
          created_at:
            record.date ||
            new Date().toISOString().replace("T", " ").slice(0, 19),
        });
        imported++;
      }
    } catch (err) {
      skipped++;
      errors.push(
        `Record ${i + 1}: ${(err as Error).message || "import failed"}`,
      );
    }
  }

  // Generate embeddings with concurrency control to avoid overwhelming the API
  if (importedMemoIds.length > 0) {
    const CONCURRENCY = 5;
    const memos = getMemos({ includePrivate: true, ids: importedMemoIds });
    for (let i = 0; i < memos.length; i += CONCURRENCY) {
      const chunk = memos.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        chunk.map((memo) =>
          generateAndStoreEmbedding(memo.id, memo.content).catch((err) =>
            console.error(
              "Embedding generation failed for imported memo:",
              err,
            ),
          ),
        ),
      );
    }
  }

  const message =
    errors.length > 0
      ? `Imported ${imported}, skipped ${skipped}, deduped ${deduped}. Errors: ${errors.join("; ")}`
      : `Imported ${imported}, deduped ${deduped} record(s).`;

  return c.json({
    imported,
    skipped,
    deduped,
    errors: errors.length > 0 ? errors : undefined,
    message,
  });
});

// POST /api/import-flomo — 从上传的 flomo HTML 文件导入数据
exportImportApp.post("/import-flomo", authMiddleware, async (c) => {
  let fileContent: string | null = null;

  try {
    const body = await c.req.parseBody({ all: true });
    for (const [, value] of Object.entries(body)) {
      if (value instanceof File) {
        fileContent = await value.text();
        break;
      }
    }
  } catch {
    return c.json({ error: "Invalid form data" }, 400);
  }

  if (!fileContent) {
    return c.json({ error: "No file uploaded" }, 400);
  }

  if (fileContent.trim().length === 0) {
    return c.json({ error: "Empty file" }, 400);
  }

  // 解析 flomo HTML
  const records = parseFlomoHTML(fileContent);
  if (records.length === 0) {
    return c.json({
      imported: 0,
      skipped: 0,
      message: "No valid flomo memo records found in the HTML file",
    });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const importedMemoIds: number[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;

    try {
      // 去重检查
      if (memoContentExists(record.content)) {
        skipped++;
        continue;
      }

      // 导入
      const memo = importMemo({
        content: record.content,
        tags: record.tags,
        is_public: false,
        created_at:
          record.time ||
          new Date().toISOString().replace("T", " ").slice(0, 19),
      });
      importedMemoIds.push(memo.id);
      imported++;
    } catch (err) {
      skipped++;
      errors.push(
        `Record ${i + 1}: ${(err as Error).message || "import failed"}`,
      );
    }
  }

  // Generate embeddings with concurrency control to avoid overwhelming the API
  if (importedMemoIds.length > 0) {
    const CONCURRENCY = 5;
    const memos = getMemos({ includePrivate: true, ids: importedMemoIds });
    for (let i = 0; i < memos.length; i += CONCURRENCY) {
      const chunk = memos.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        chunk.map((memo) =>
          generateAndStoreEmbedding(memo.id, memo.content).catch((err) =>
            console.error(
              "Embedding generation failed for imported memo:",
              err,
            ),
          ),
        ),
      );
    }
  }

  // WAL checkpoint: 将 WAL 日志合并回主数据库文件
  if (imported > 0) {
    const d = getDb();
    d.run("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  const message =
    errors.length > 0
      ? `Imported ${imported}, skipped ${skipped}. Errors: ${errors.join("; ")}`
      : `Imported ${imported}, skipped ${skipped} record(s) from flomo HTML.`;

  return c.json({
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    message,
  });
});
