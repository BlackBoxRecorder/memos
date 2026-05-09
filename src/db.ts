import { Database } from "bun:sqlite";

export interface Memo {
  id: number;
  content: string;
  tag: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prompt {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreativeItem {
  id: number;
  prompt_id: number;
  extra_prompt: string;
  embedding: Buffer | null;
  content: string;
  context_memo_ids: string;
  created_at: string;
  updated_at: string;
}

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
      tag         TEXT    NOT NULL DEFAULT '',
      is_public   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
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

function rowToMemo(row: any): Memo {
  return {
    id: row.id,
    content: row.content,
    tag: row.tag || "",
    is_public: row.is_public === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getMemos(opts: {
  includePrivate: boolean;
  search?: string;
  tag?: string;
  ids?: number[];
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
    conditions.push("tag = ?");
    params.push(opts.tag);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM memos ${where} ORDER BY created_at DESC`;
  const rows = d.query(sql).all(...params);
  return rows.map(rowToMemo);
}

export function getAllTags(): string[] {
  const d = getDb();
  const rows = d
    .query("SELECT DISTINCT tag FROM memos WHERE tag != '' ORDER BY tag")
    .all() as any[];
  return rows.map((r: any) => r.tag);
}

export function countMemos(opts: { includePrivate: boolean }): number {
  const d = getDb();
  const where = opts.includePrivate ? "" : "WHERE is_public = 1";
  const row = d
    .query(`SELECT COUNT(*) as count FROM memos ${where}`)
    .get() as any;
  return row.count;
}

export function getMemo(id: number): Memo | null {
  const d = getDb();
  const row = d.query("SELECT * FROM memos WHERE id = ?").get(id);
  return row ? rowToMemo(row) : null;
}

export function createMemo(
  content: string,
  isPublic: boolean,
  tag?: string,
): Memo {
  const d = getDb();
  const result = d.run(
    "INSERT INTO memos (content, is_public, tag) VALUES (?, ?, ?)",
    [content, isPublic ? 1 : 0, tag || ""],
  );
  return getMemo(Number(result.lastInsertRowid))!;
}

export function updateMemo(
  id: number,
  fields: { content?: string; is_public?: boolean; tag?: string },
): Memo | null {
  const d = getDb();
  const existing = getMemo(id);
  if (!existing) return null;

  const content = fields.content ?? existing.content;
  const isPublic =
    fields.is_public !== undefined ? fields.is_public : existing.is_public;
  const tag = fields.tag !== undefined ? fields.tag : existing.tag;

  d.run(
    "UPDATE memos SET content = ?, is_public = ?, tag = ?, updated_at = datetime('now') WHERE id = ?",
    [content, isPublic ? 1 : 0, tag, id],
  );
  return getMemo(id);
}

export function deleteMemo(id: number): boolean {
  const d = getDb();
  const result = d.run("DELETE FROM memos WHERE id = ?", [id]);
  return result.changes > 0;
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

function rowToPrompt(row: any): Prompt {
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
  const rows = d.query("SELECT * FROM prompts ORDER BY created_at DESC").all();
  return rows.map(rowToPrompt);
}

export function getPrompt(id: number): Prompt | null {
  const d = getDb();
  const row = d.query("SELECT * FROM prompts WHERE id = ?").get(id);
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

function rowToCreative(row: any): CreativeItem {
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
      .all(opts.prompt_id);
    return rows.map(rowToCreative);
  }
  const rows = d.query("SELECT * FROM creative ORDER BY created_at DESC").all();
  return rows.map(rowToCreative);
}

export function getCreativeItem(id: number): CreativeItem | null {
  const d = getDb();
  const row = d.query("SELECT * FROM creative WHERE id = ?").get(id);
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
