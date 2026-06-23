import { Database } from "bun:sqlite";
import type { Memo, Prompt, CreativeItem } from "./model";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database("memos.db");
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
  }
  return db;
}

export function initDb(): void {
  const d = getDb();

  d.run(`
    CREATE TABLE IF NOT EXISTS memos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT    NOT NULL,
      tags        TEXT    NOT NULL DEFAULT '[]',
      is_public   INTEGER NOT NULL DEFAULT 1,
      pinned_at   TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  d.run("CREATE INDEX IF NOT EXISTS idx_memos_pinned_at ON memos(pinned_at)");
  d.run(`
    CREATE TABLE IF NOT EXISTS memo_embeddings (
      memo_id    INTEGER PRIMARY KEY,
      embedding  BLOB NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE
    )
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS prompts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS creative (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id        INTEGER NOT NULL,
      extra_prompt     TEXT    NOT NULL DEFAULT '',
      embedding        BLOB,
      content          TEXT    NOT NULL DEFAULT '',
      context_memo_ids TEXT    NOT NULL DEFAULT '',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
    )
  `);
}

// 数据库行类型
interface MemoRow {
  id: number;
  content: string;
  tags: string;
  is_public: number;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PromptRow {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface CreativeRow {
  id: number;
  prompt_id: number;
  extra_prompt: string;
  embedding: Buffer | null;
  content: string;
  context_memo_ids: string;
  created_at: string;
  updated_at: string;
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    // Handle both array format (normal) and legacy single-string format
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (t: unknown): t is string => typeof t === "string" && t.length > 0,
      );
    }
    if (typeof parsed === "string" && parsed.length > 0) {
      return [parsed];
    }
  } catch {
    // legacy: if old data has a plain string tag (not JSON-encoded), wrap it
    if (typeof raw === "string" && raw.length > 0) {
      return [raw];
    }
  }
  return [];
}

function rowToMemo(row: MemoRow): Memo {
  return {
    id: row.id,
    content: row.content,
    tags: parseTags(row.tags),
    is_public: row.is_public === 1,
    pinned_at: row.pinned_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getMemos(opts: {
  includePrivate: boolean;
  search?: string;
  tag?: string;
  ids?: number[];
  limit?: number;
}): Memo[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (!opts.includePrivate) {
    conditions.push("is_public = 1");
  }
  if (opts.ids && opts.ids.length > 0) {
    const placeholders = opts.ids.map(() => "?").join(", ");
    conditions.push(`id IN (${placeholders})`);
    params.push(...opts.ids);
  }
  if (opts.search) {
    conditions.push("content LIKE ?");
    params.push(`%${opts.search}%`);
  }
  if (opts.tag) {
    // Support comma-separated multiple tags: any matching tag → include memo
    const tagList = opts.tag
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tagList.length > 0) {
      const placeholders = tagList.map(() => "?").join(", ");
      conditions.push(
        `EXISTS (SELECT 1 FROM json_each(memos.tags) WHERE value IN (${placeholders}))`,
      );
      params.push(...tagList);
    }
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = opts.limit ? ` LIMIT ?` : "";
  const sql = `SELECT * FROM memos ${where} ORDER BY pinned_at IS NOT NULL DESC, pinned_at DESC, created_at DESC${limitClause}`;
  if (opts.limit) {
    params.push(opts.limit);
  }
  const rows = d.query(sql).all(...params) as MemoRow[];
  return rows.map(rowToMemo);
}

export function getAllTags(): string[] {
  const d = getDb();
  const rows = d
    .query(
      "SELECT DISTINCT value FROM memos, json_each(memos.tags) WHERE value != '' ORDER BY value",
    )
    .all() as { value: string }[];
  return rows.map((r) => r.value);
}

export function countMemos(opts: { includePrivate: boolean }): number {
  const d = getDb();
  const where = opts.includePrivate ? "" : "WHERE is_public = 1";
  const row = d.query(`SELECT COUNT(*) as count FROM memos ${where}`).get() as {
    count: number;
  };
  return row.count;
}

export function getMemo(id: number): Memo | null {
  const d = getDb();
  const row = d.query("SELECT * FROM memos WHERE id = ?").get(id) as
    | MemoRow
    | undefined;
  return row ? rowToMemo(row) : null;
}

export function createMemo(
  content: string,
  isPublic: boolean,
  tags?: string[],
): Memo {
  const d = getDb();
  const tagsJson = JSON.stringify(
    tags && tags.length > 0 ? tags.filter((t) => t.length > 0) : [],
  );
  const result = d.run(
    "INSERT INTO memos (content, is_public, tags) VALUES (?, ?, ?)",
    [content, isPublic ? 1 : 0, tagsJson],
  );
  return getMemo(Number(result.lastInsertRowid))!;
}

export function updateMemo(
  id: number,
  fields: { content?: string; is_public?: boolean; tags?: string[] },
): Memo | null {
  const d = getDb();
  const existing = getMemo(id);
  if (!existing) return null;

  const content = fields.content ?? existing.content;
  const isPublic =
    fields.is_public !== undefined ? fields.is_public : existing.is_public;
  const tags = fields.tags !== undefined ? fields.tags : existing.tags;
  const tagsJson = JSON.stringify(tags.filter((t) => t.length > 0));

  d.run(
    "UPDATE memos SET content = ?, is_public = ?, tags = ?, updated_at = datetime('now') WHERE id = ?",
    [content, isPublic ? 1 : 0, tagsJson, id],
  );
  return getMemo(id);
}

export function deleteMemo(id: number): boolean {
  const d = getDb();
  const result = d.run("DELETE FROM memos WHERE id = ?", [id]);
  return result.changes > 0;
}

export function pinMemo(id: number, pin: boolean): Memo | null {
  const d = getDb();
  if (pin) {
    d.run("UPDATE memos SET pinned_at = datetime('now') WHERE id = ?", [id]);
  } else {
    d.run("UPDATE memos SET pinned_at = NULL WHERE id = ?", [id]);
  }
  return getMemo(id);
}

// --- Embedding helpers ---

export function getAllEmbeddings(): Array<{
  memo_id: number;
  embedding: Buffer;
}> {
  const d = getDb();
  const rows = d
    .query("SELECT memo_id, embedding FROM memo_embeddings")
    .all() as Array<{ memo_id: number; embedding: Buffer }>;
  return rows;
}

export function saveEmbedding(memoId: number, embedding: Buffer): void {
  const d = getDb();
  d.run(
    "INSERT OR REPLACE INTO memo_embeddings (memo_id, embedding, updated_at) VALUES (?, ?, datetime('now'))",
    [memoId, embedding],
  );
}

export function deleteEmbedding(memoId: number): void {
  const d = getDb();
  d.run("DELETE FROM memo_embeddings WHERE memo_id = ?", [memoId]);
}

// --- Prompt helpers ---

function rowToPrompt(row: PromptRow): Prompt {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getAllPrompts(): Prompt[] {
  const d = getDb();
  const rows = d
    .query("SELECT * FROM prompts ORDER BY created_at DESC")
    .all() as PromptRow[];
  return rows.map(rowToPrompt);
}

export function getPrompt(id: number): Prompt | null {
  const d = getDb();
  const row = d.query("SELECT * FROM prompts WHERE id = ?").get(id) as
    | PromptRow
    | undefined;
  return row ? rowToPrompt(row) : null;
}

export function createPrompt(title: string, content: string): Prompt {
  const d = getDb();
  const result = d.run("INSERT INTO prompts (title, content) VALUES (?, ?)", [
    title,
    content,
  ]);
  return getPrompt(Number(result.lastInsertRowid))!;
}

export function updatePrompt(
  id: number,
  fields: { title?: string; content?: string },
): Prompt | null {
  const d = getDb();
  const existing = getPrompt(id);
  if (!existing) return null;

  const title = fields.title ?? existing.title;
  const content = fields.content ?? existing.content;

  d.run(
    "UPDATE prompts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?",
    [title, content, id],
  );
  return getPrompt(id);
}

export function deletePrompt(id: number): boolean {
  const d = getDb();
  const result = d.run("DELETE FROM prompts WHERE id = ?", [id]);
  return result.changes > 0;
}

// --- Creative helpers ---

function rowToCreative(row: CreativeRow): CreativeItem {
  return {
    id: row.id,
    prompt_id: row.prompt_id,
    extra_prompt: row.extra_prompt || "",
    embedding: row.embedding || null,
    content: row.content || "",
    context_memo_ids: row.context_memo_ids || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getCreativeItems(opts: { prompt_id?: number }): CreativeItem[] {
  const d = getDb();
  if (opts.prompt_id !== undefined) {
    const rows = d
      .query(
        "SELECT * FROM creative WHERE prompt_id = ? ORDER BY created_at DESC",
      )
      .all(opts.prompt_id) as CreativeRow[];
    return rows.map(rowToCreative);
  }
  const rows = d
    .query("SELECT * FROM creative ORDER BY created_at DESC")
    .all() as CreativeRow[];
  return rows.map(rowToCreative);
}

export function getCreativeItem(id: number): CreativeItem | null {
  const d = getDb();
  const row = d.query("SELECT * FROM creative WHERE id = ?").get(id) as
    | CreativeRow
    | undefined;
  return row ? rowToCreative(row) : null;
}

export function createCreativeItem(fields: {
  prompt_id: number;
  extra_prompt: string;
  embedding?: Buffer;
  content: string;
  context_memo_ids: string;
}): CreativeItem {
  const d = getDb();
  const result = d.run(
    "INSERT INTO creative (prompt_id, extra_prompt, embedding, content, context_memo_ids) VALUES (?, ?, ?, ?, ?)",
    [
      fields.prompt_id,
      fields.extra_prompt,
      fields.embedding || null,
      fields.content,
      fields.context_memo_ids,
    ],
  );
  return getCreativeItem(Number(result.lastInsertRowid))!;
}

export function deleteCreativeItem(id: number): boolean {
  const d = getDb();
  const result = d.run("DELETE FROM creative WHERE id = ?", [id]);
  return result.changes > 0;
}

// --- Import helpers (with custom dates) ---

/** Insert a memo with an explicit created_at timestamp. Returns the newly created memo. */
export function importMemo(fields: {
  content: string;
  tags: string[];
  is_public: boolean;
  pinned_at?: string;
  created_at: string;
}): Memo {
  const d = getDb();
  const tagsJson = JSON.stringify(fields.tags.filter((t) => t.length > 0));
  const result = d.run(
    "INSERT INTO memos (content, tags, is_public, pinned_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      fields.content,
      tagsJson,
      fields.is_public ? 1 : 0,
      fields.pinned_at || null,
      fields.created_at,
      fields.created_at,
    ],
  );
  return getMemo(Number(result.lastInsertRowid))!;
}

/** Insert a creative item with an explicit created_at timestamp. Returns the newly created item. */
export function importCreativeItem(fields: {
  prompt_id: number;
  content: string;
  created_at: string;
}): CreativeItem {
  const d = getDb();
  const result = d.run(
    "INSERT INTO creative (prompt_id, extra_prompt, content, context_memo_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      fields.prompt_id,
      "",
      fields.content,
      "",
      fields.created_at,
      fields.created_at,
    ],
  );
  return getCreativeItem(Number(result.lastInsertRowid))!;
}

/** Ensure at least one prompt exists for creative items imported without a prompt_id. Returns the first prompt or creates a default one. */
export function ensureDefaultPrompt(): Prompt {
  const existing = getAllPrompts();
  if (existing.length > 0) return existing[0]!;
  return createPrompt("默认", "默认提示词");
}

/** Check if a memo with the exact same content already exists in the database. */
export function memoContentExists(content: string): boolean {
  const d = getDb();
  const row = d
    .query("SELECT 1 FROM memos WHERE content = ? LIMIT 1")
    .get(content) as { 1: number } | null;
  return row !== null;
}

/** Check if a creative item with the exact same content already exists in the database. */
export function creativeContentExists(content: string): boolean {
  const d = getDb();
  const row = d
    .query("SELECT 1 FROM creative WHERE content = ? LIMIT 1")
    .get(content) as { 1: number } | null;
  return row !== null;
}

/** Get all creative items without any filter (for export). */
export function getAllCreativeItems(): CreativeItem[] {
  const d = getDb();
  const rows = d
    .query("SELECT * FROM creative ORDER BY created_at ASC")
    .all() as CreativeRow[];
  return rows.map(rowToCreative);
}
