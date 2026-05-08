import { Database } from "bun:sqlite";

export interface Memo {
  id: number;
  content: string;
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
    is_public: row.is_public === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getMemos(includePrivate: boolean): Memo[] {
  const d = getDb();
  if (includePrivate) {
    const rows = d.query("SELECT * FROM memos ORDER BY created_at DESC").all();
    return rows.map(rowToMemo);
  }
  const rows = d
    .query("SELECT * FROM memos WHERE is_public = 1 ORDER BY created_at DESC")
    .all();
  return rows.map(rowToMemo);
}

export function getMemo(id: number): Memo | null {
  const d = getDb();
  const row = d.query("SELECT * FROM memos WHERE id = ?").get(id);
  return row ? rowToMemo(row) : null;
}

export function createMemo(content: string, isPublic: boolean): Memo {
  const d = getDb();
  const result = d.run("INSERT INTO memos (content, is_public) VALUES (?, ?)", [
    content,
    isPublic ? 1 : 0,
  ]);
  return getMemo(Number(result.lastInsertRowid))!;
}

export function updateMemo(
  id: number,
  fields: { content?: string; is_public?: boolean },
): Memo | null {
  const d = getDb();
  const existing = getMemo(id);
  if (!existing) return null;

  const content = fields.content ?? existing.content;
  const isPublic =
    fields.is_public !== undefined ? fields.is_public : existing.is_public;

  d.run(
    "UPDATE memos SET content = ?, is_public = ?, updated_at = datetime('now') WHERE id = ?",
    [content, isPublic ? 1 : 0, id],
  );
  return getMemo(id);
}

export function deleteMemo(id: number): boolean {
  const d = getDb();
  const result = d.run("DELETE FROM memos WHERE id = ?", [id]);
  return result.changes > 0;
}

export function seedFromJson(thoughts: string[]): void {
  const d = getDb();
  const count = d.query("SELECT COUNT(*) as c FROM memos").get() as any;
  if (count.c > 0) return; // 已有数据，不重复导入
  const stmt = d.prepare(
    "INSERT INTO memos (content, is_public) VALUES (?, 1)",
  );
  for (const text of thoughts) {
    stmt.run(text);
  }
}
