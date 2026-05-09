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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
    const memos = getMemos({ includePrivate, search, tag });
    return json({ memos });
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

    return json({ ok: true });
  }

  return null;
}
