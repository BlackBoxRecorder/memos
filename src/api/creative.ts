import { Hono } from "hono";
import { authMiddleware } from "../auth";
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

export const creativeApp = new Hono();

// --- Prompts endpoints ---

// GET /api/creative/prompts — 获取所有 prompts
creativeApp.get("/prompts", (c) => {
  const prompts = getAllPrompts();
  return c.json({ prompts });
});

// POST /api/creative/prompts — 创建 prompt
creativeApp.post("/prompts", authMiddleware, async (c) => {
  let body: { title?: string; content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (
    !body.title ||
    typeof body.title !== "string" ||
    body.title.trim().length === 0
  ) {
    return c.json({ error: "Title is required" }, 400);
  }
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0
  ) {
    return c.json({ error: "Content is required" }, 400);
  }

  const prompt = createPrompt(body.title.trim(), body.content.trim());
  return c.json({ prompt }, 201);
});

// PUT /api/creative/prompts/:id — 更新 prompt
creativeApp.put("/prompts/:id", authMiddleware, async (c) => {
  const id = Number(c.req.param("id"));
  let body: { title?: string; content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const fields: { title?: string; content?: string } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    fields.title = body.title.trim();
  }
  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return c.json({ error: "Content cannot be empty" }, 400);
    }
    fields.content = body.content.trim();
  }

  const prompt = updatePrompt(id, fields);
  if (!prompt) return c.json({ error: "Prompt not found" }, 404);

  return c.json({ prompt });
});

// DELETE /api/creative/prompts/:id — 删除 prompt
creativeApp.delete("/prompts/:id", authMiddleware, (c) => {
  const id = Number(c.req.param("id"));
  const deleted = deletePrompt(id);
  if (!deleted) return c.json({ error: "Prompt not found" }, 404);

  return c.json({ ok: true });
});

// --- Creative endpoints ---

// GET /api/creative — 获取 creative 列表（可选 ?prompt_id=X 过滤）
creativeApp.get("/", (c) => {
  const promptIdParam = c.req.query("prompt_id");
  const opts: { prompt_id?: number } = {};
  if (promptIdParam) {
    opts.prompt_id = Number(promptIdParam);
  }
  const items = getCreativeItems(opts);
  return c.json({ items });
});

// POST /api/creative/generate — 生成创意内容
creativeApp.post("/generate", authMiddleware, async (c) => {
  let body: {
    prompt_id?: number;
    extra_prompt?: string;
    memo_ids?: number[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.prompt_id || typeof body.prompt_id !== "number") {
    return c.json({ error: "prompt_id is required" }, 400);
  }
  if (
    !body.extra_prompt ||
    typeof body.extra_prompt !== "string" ||
    body.extra_prompt.trim().length === 0
  ) {
    return c.json({ error: "extra_prompt is required" }, 400);
  }
  // Validate memo_ids if provided
  if (body.memo_ids !== undefined) {
    if (
      !Array.isArray(body.memo_ids) ||
      body.memo_ids.some((id) => typeof id !== "number" || id <= 0)
    ) {
      return c.json(
        { error: "memo_ids must be an array of positive integers" },
        400,
      );
    }
  }

  const prompt = getPrompt(body.prompt_id);
  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  let contextMemos: string[] = [];
  let contextMemoIds = "";
  let embedding: Float32Array | null = null;

  const isManualMode = body.memo_ids !== undefined && body.memo_ids.length > 0;

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
      const semanticIds = await getSemanticResults(body.extra_prompt.trim(), 5);
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
    return c.json({ error: "AI service temporarily unavailable" }, 500);
  }

  // Step 4: Save to database
  const item = createCreativeItem({
    prompt_id: body.prompt_id,
    extra_prompt: body.extra_prompt.trim(),
    embedding: embedding ? Buffer.from(embedding.buffer) : undefined,
    content,
    context_memo_ids: contextMemoIds,
  });

  return c.json({ item }, 201);
});

// DELETE /api/creative/:id — 删除 creative
creativeApp.delete("/:id", authMiddleware, (c) => {
  const id = Number(c.req.param("id"));
  const deleted = deleteCreativeItem(id);
  if (!deleted) return c.json({ error: "Creative item not found" }, 404);

  return c.json({ ok: true });
});
