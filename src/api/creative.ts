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
import {
  generateCreativeContentStream,
} from "../ai/service";
import {
  checkRateLimit,
  recordRateLimit,
  getClientIP,
  formatRateLimitError,
} from "../helper/rate-limit";

export const creativeApp = new Hono();

/** Maximum number of tag-filtered memos used as context to avoid token overflow */
const MAX_TAG_CONTEXT = 20;

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

// POST /api/creative/generate — 生成创意内容（流式输出）
creativeApp.post("/generate", authMiddleware, async (c) => {
  let body: {
    prompt_id?: number;
    extra_prompt?: string;
    provider?: string;
    model?: string;
    tag?: string;
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

  const prompt = getPrompt(body.prompt_id);
  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  const ip = getClientIP(c);
  const rateError = checkRateLimit(ip, "ai");
  if (rateError) {
    return c.json({ error: formatRateLimitError("ai", rateError) }, 429);
  }
  recordRateLimit(ip, "ai");

  let contextMemos: string[] = [];
  let contextMemoIds = "";

  // Tag mode: use tag-filtered memos as context
  if (typeof body.tag === "string" && body.tag.trim().length > 0) {
    const memos = getMemos({ includePrivate: true, tag: body.tag.trim(), limit: MAX_TAG_CONTEXT });
    contextMemos = memos.map((m) => m.content);
    contextMemoIds = memos.map((m) => m.id).join(",");
  }

  // Build SSE stream with abort support for client disconnect
  const encoder = new TextEncoder();
  const scopePromptId = body.prompt_id;
  const scopeExtraPrompt = body.extra_prompt.trim();
  const scopeProvider = body.provider;
  const scopeModel = body.model;

  const abortController = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      try {
        const gen = generateCreativeContentStream(
          prompt.content,
          scopeExtraPrompt,
          contextMemos,
          scopeProvider,
          scopeModel,
          abortController.signal,
        );

        for await (const chunk of gen) {
          fullContent += chunk;
          const msg = JSON.stringify({ type: "content", content: chunk });
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        }

        // Save to DB after streaming completes
        const item = createCreativeItem({
          prompt_id: scopePromptId,
          extra_prompt: scopeExtraPrompt,
          content: fullContent,
          context_memo_ids: contextMemoIds,
        });

        const doneMsg = JSON.stringify({ type: "done", item });
        controller.enqueue(encoder.encode(`data: ${doneMsg}\n\n`));
        controller.close();
      } catch (err) {
        // Suppress AbortError when client disconnects intentionally
        if (err instanceof Error && err.name === "AbortError") {
          try { controller.close(); } catch { /* already closed */ }
          return;
        }
        const errorMsg = JSON.stringify({
          type: "error",
          error: (err as Error).message || "Generation failed",
        });
        controller.enqueue(encoder.encode(`data: ${errorMsg}\n\n`));
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// POST /api/creative — 直接创建 creative item（如对话保存等）
creativeApp.post("/", authMiddleware, async (c) => {
  let body: {
    prompt_id?: number;
    extra_prompt?: string;
    content?: string;
    context_memo_ids?: string;
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
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0
  ) {
    return c.json({ error: "content is required" }, 400);
  }

  const item = createCreativeItem({
    prompt_id: body.prompt_id,
    extra_prompt: (body.extra_prompt || "").trim(),
    content: body.content.trim(),
    context_memo_ids: body.context_memo_ids || "",
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
