import { Database } from "bun:sqlite";

export interface Memo {
  id: number;
  content: string;
  tag: string;
  is_public: boolean;
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
}): Memo[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (!opts.includePrivate) {
    conditions.push("is_public = 1");
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
