import { Hono } from "hono";
import { requireAuth, authMiddleware } from "../auth";
import {
  getMemos,
  getMemo,
  createMemo,
  updateMemo,
  deleteMemo,
  getAllTags,
  countMemos,
} from "../db";
import {
  generateAndStoreEmbedding,
  deleteEmbeddingCache,
  getSemanticResults,
} from "../ai/embeddings";

export const memosApp = new Hono();

// GET /api/memos
memosApp.get("/", async (c) => {
  const allParam = c.req.query("all");
  const includePrivate = allParam === "true" && requireAuth(c.req.raw) === null;
  const search = c.req.query("search") || undefined;
  const tag = c.req.query("tag") || undefined;

  const result = getMemos({ includePrivate, search, tag });

  // Also run semantic search and merge results (non-blocking to LIKE results)
  if (search) {
    try {
      const semanticIds = await getSemanticResults(search);
      if (semanticIds.length > 0) {
        const existingIds = new Set(result.map((m) => m.id));
        const extraIds = semanticIds.filter((id) => !existingIds.has(id));
        if (extraIds.length > 0) {
          const extraMemos = getMemos({ includePrivate, ids: extraIds });
          result.push(...extraMemos);
        }
      }
    } catch {
      // semantic search failed, just keep LIKE results
    }
  }

  return c.json({ memos: result });
});

// GET /api/memos/count
memosApp.get("/count", (c) => {
  const includePrivate = requireAuth(c.req.raw) === null;
  const count = countMemos({ includePrivate });
  return c.json({ count });
});

// GET /api/memos/tags
memosApp.get("/tags", (c) => {
  const tags = getAllTags();
  return c.json({ tags });
});

// POST /api/memos — 创建
memosApp.post("/", authMiddleware, async (c) => {
  let body: { content?: string; is_public?: boolean; tag?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0
  ) {
    return c.json({ error: "Content is required" }, 400);
  }

  const memo = createMemo(
    body.content.trim(),
    body.is_public !== false,
    body.tag,
  );

  // Fire-and-forget embedding generation
  generateAndStoreEmbedding(memo.id, memo.content).catch((err) =>
    console.error("Embedding generation failed:", err),
  );

  return c.json({ memo }, 201);
});

// PUT /api/memos/:id — 更新
memosApp.put("/:id", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  let body: { content?: string; is_public?: boolean; tag?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (
    body.content !== undefined &&
    (typeof body.content !== "string" || body.content.trim().length === 0)
  ) {
    return c.json({ error: "Content cannot be empty" }, 400);
  }

  const fields: { content?: string; is_public?: boolean; tag?: string } = {};
  if (body.content !== undefined) fields.content = body.content.trim();
  if (body.is_public !== undefined) fields.is_public = body.is_public;
  if (body.tag !== undefined) fields.tag = body.tag;

  const memo = updateMemo(id, fields);
  if (!memo) return c.json({ error: "Memo not found" }, 404);

  // Regenerate embedding if content changed
  if (fields.content) {
    generateAndStoreEmbedding(memo.id, memo.content).catch((err) =>
      console.error("Embedding generation failed:", err),
    );
  }

  return c.json({ memo });
});

// DELETE /api/memos/:id — 删除
memosApp.delete("/:id", authMiddleware, (c) => {
  const id = Number(c.req.param("id"));
  const deleted = deleteMemo(id);
  if (!deleted) return c.json({ error: "Memo not found" }, 404);

  // Clean up embedding cache
  deleteEmbeddingCache(id);

  return c.json({ ok: true });
});
