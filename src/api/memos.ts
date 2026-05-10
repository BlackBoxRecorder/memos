import { requireAuth } from "../auth";
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
import { json } from "../util";

export async function handleMemosRequest(
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method;

  // GET /api/memos
  if (method === "GET" && path === "/api/memos") {
    const url = new URL(request.url);
    const allParam = url.searchParams.get("all");
    const includePrivate =
      allParam === "true"
        ? requireAuth(request) === null
        : requireAuth(request) === null;
    const search = url.searchParams.get("search") || undefined;
    const tag = url.searchParams.get("tag") || undefined;

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

    return json({ memos: result });
  }

  // GET /api/memos/count
  if (method === "GET" && path === "/api/memos/count") {
    const includePrivate = requireAuth(request) === null;
    const count = countMemos({ includePrivate });
    return json({ count });
  }

  // GET /api/memos/tags
  if (method === "GET" && path === "/api/memos/tags") {
    const tags = getAllTags();
    return json({ tags });
  }

  // POST /api/memos — 创建
  if (method === "POST" && path === "/api/memos") {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    let body: { content?: string; is_public?: boolean; tag?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (
      !body.content ||
      typeof body.content !== "string" ||
      body.content.trim().length === 0
    ) {
      return json({ error: "Content is required" }, 400);
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

    return json({ memo }, 201);
  }

  // PUT /api/memos/:id — 更新
  const putMatch = path.match(/^\/api\/memos\/(\d+)$/);
  if (method === "PUT" && putMatch) {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    const id = Number(putMatch[1]);
    let body: { content?: string; is_public?: boolean; tag?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (
      body.content !== undefined &&
      (typeof body.content !== "string" || body.content.trim().length === 0)
    ) {
      return json({ error: "Content cannot be empty" }, 400);
    }

    const fields: { content?: string; is_public?: boolean; tag?: string } = {};
    if (body.content !== undefined) fields.content = body.content.trim();
    if (body.is_public !== undefined) fields.is_public = body.is_public;
    if (body.tag !== undefined) fields.tag = body.tag;

    const memo = updateMemo(id, fields);
    if (!memo) return json({ error: "Memo not found" }, 404);

    // Regenerate embedding if content changed
    if (fields.content) {
      generateAndStoreEmbedding(memo.id, memo.content).catch((err) =>
        console.error("Embedding generation failed:", err),
      );
    }

    return json({ memo });
  }

  // DELETE /api/memos/:id — 删除
  const deleteMatch = path.match(/^\/api\/memos\/(\d+)$/);
  if (method === "DELETE" && deleteMatch) {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    const id = Number(deleteMatch[1]);
    const deleted = deleteMemo(id);
    if (!deleted) return json({ error: "Memo not found" }, 404);

    // Clean up embedding cache
    deleteEmbeddingCache(id);

    return json({ ok: true });
  }

  return null;
}
