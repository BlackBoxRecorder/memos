import { requireAuth } from "../auth";
import {
  getAllPrompts,
  getPrompt,
  createPrompt,
  updatePrompt,
  deletePrompt,
  getCreativeItems,
  getCreativeItem,
  createCreativeItem,
  deleteCreativeItem,
  getMemos,
} from "../db";
import { generateEmbedding, generateCreativeContent } from "../ai/service";
import { getSemanticResults } from "../ai/embeddings";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleCreativeRequest(
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method;

  // --- Prompts endpoints ---

  // GET /api/creative/prompts — 获取所有 prompts
  if (method === "GET" && path === "/api/creative/prompts") {
    const prompts = getAllPrompts();
    return json({ prompts });
  }

  // POST /api/creative/prompts — 创建 prompt
  if (method === "POST" && path === "/api/creative/prompts") {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    let body: { title?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (
      !body.title ||
      typeof body.title !== "string" ||
      body.title.trim().length === 0
    ) {
      return json({ error: "Title is required" }, 400);
    }
    if (
      !body.content ||
      typeof body.content !== "string" ||
      body.content.trim().length === 0
    ) {
      return json({ error: "Content is required" }, 400);
    }

    const prompt = createPrompt(body.title.trim(), body.content.trim());
    return json({ prompt }, 201);
  }

  // PUT /api/creative/prompts/:id — 更新 prompt
  const promptPutMatch = path.match(/^\/api\/creative\/prompts\/(\d+)$/);
  if (method === "PUT" && promptPutMatch) {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    const id = Number(promptPutMatch[1]);
    let body: { title?: string; content?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const fields: { title?: string; content?: string } = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return json({ error: "Title cannot be empty" }, 400);
      }
      fields.title = body.title.trim();
    }
    if (body.content !== undefined) {
      if (
        typeof body.content !== "string" ||
        body.content.trim().length === 0
      ) {
        return json({ error: "Content cannot be empty" }, 400);
      }
      fields.content = body.content.trim();
    }

    const prompt = updatePrompt(id, fields);
    if (!prompt) return json({ error: "Prompt not found" }, 404);

    return json({ prompt });
  }

  // DELETE /api/creative/prompts/:id — 删除 prompt
  const promptDeleteMatch = path.match(/^\/api\/creative\/prompts\/(\d+)$/);
  if (method === "DELETE" && promptDeleteMatch) {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    const id = Number(promptDeleteMatch[1]);
    const deleted = deletePrompt(id);
    if (!deleted) return json({ error: "Prompt not found" }, 404);

    return json({ ok: true });
  }

  // --- Creative endpoints ---

  // GET /api/creative — 获取 creative 列表（可选 ?prompt_id=X 过滤）
  if (method === "GET" && path === "/api/creative") {
    const url = new URL(request.url);
    const promptIdParam = url.searchParams.get("prompt_id");
    const opts: { prompt_id?: number } = {};
    if (promptIdParam) {
      opts.prompt_id = Number(promptIdParam);
    }
    const items = getCreativeItems(opts);
    return json({ items });
  }

  // POST /api/creative/generate — 生成创意内容
  if (method === "POST" && path === "/api/creative/generate") {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    let body: {
      prompt_id?: number;
      extra_prompt?: string;
      memo_ids?: number[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!body.prompt_id || typeof body.prompt_id !== "number") {
      return json({ error: "prompt_id is required" }, 400);
    }
    if (
      !body.extra_prompt ||
      typeof body.extra_prompt !== "string" ||
      body.extra_prompt.trim().length === 0
    ) {
      return json({ error: "extra_prompt is required" }, 400);
    }
    // Validate memo_ids if provided
    if (body.memo_ids !== undefined) {
      if (
        !Array.isArray(body.memo_ids) ||
        body.memo_ids.some((id) => typeof id !== "number" || id <= 0)
      ) {
        return json(
          { error: "memo_ids must be an array of positive integers" },
          400,
        );
      }
    }

    const prompt = getPrompt(body.prompt_id);
    if (!prompt) {
      return json({ error: "Prompt not found" }, 404);
    }

    let contextMemos: string[] = [];
    let contextMemoIds = "";
    let embedding: Float32Array | null = null;

    const isManualMode =
      body.memo_ids !== undefined && body.memo_ids.length > 0;

    if (isManualMode) {
      // Manual mode: use user-provided memo IDs
      const memos = getMemos({ includePrivate: true, ids: body.memo_ids });
      contextMemos = memos.map((m) => m.content);
      contextMemoIds = body.memo_ids!.join(",");
    } else {
      // Auto mode: semantic search (existing logic)
      // Step 1: Generate embedding for extra_prompt
      embedding = await generateEmbedding(body.extra_prompt.trim());

      // Step 2: Vector search related memos
      try {
        const semanticIds = await getSemanticResults(
          body.extra_prompt.trim(),
          5,
        );
        if (semanticIds.length > 0) {
          const memos = getMemos({ includePrivate: true, ids: semanticIds });
          contextMemos = memos.map((m) => m.content);
          contextMemoIds = semanticIds.join(",");
        }
      } catch {
        // Semantic search failed, proceed without context
      }
    }

    // Step 3: Call AI to generate content
    const content = await generateCreativeContent(
      prompt.content,
      body.extra_prompt.trim(),
      contextMemos,
    );

    if (content === null) {
      return json({ error: "AI service temporarily unavailable" }, 500);
    }

    // Step 4: Save to database
    const item = createCreativeItem({
      prompt_id: body.prompt_id,
      extra_prompt: body.extra_prompt.trim(),
      embedding: embedding ? Buffer.from(embedding.buffer) : undefined,
      content,
      context_memo_ids: contextMemoIds,
    });

    return json({ item }, 201);
  }

  // DELETE /api/creative/:id — 删除 creative
  const creativeDeleteMatch = path.match(/^\/api\/creative\/(\d+)$/);
  if (method === "DELETE" && creativeDeleteMatch) {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    const id = Number(creativeDeleteMatch[1]);
    const deleted = deleteCreativeItem(id);
    if (!deleted) return json({ error: "Creative item not found" }, 404);

    return json({ ok: true });
  }

  return null;
}
