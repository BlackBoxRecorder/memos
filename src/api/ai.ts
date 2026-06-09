import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { getAllTags } from "../db";
import {
  isAiAvailable,
  optimizeContent,
  suggestTags,
  getAvailableModels,
  executeAction,
  chatStream,
} from "../ai/service";
import { getSemanticResults } from "../ai/embeddings";
import { getMemos } from "../db";
import {
  checkRateLimit,
  recordRateLimit,
  getClientIP,
  formatRateLimitError,
} from "../helper/rate-limit";

export const aiApp = new Hono();

// GET /api/ai/status — feature detection (no auth required)
aiApp.get("/status", (c) => {
  return c.json(isAiAvailable());
});

// GET /api/ai/models — list available providers & models (auth required)
aiApp.get("/models", authMiddleware, (c) => {
  return c.json(getAvailableModels());
});

// POST /api/ai/optimize — content optimization (auth required)
aiApp.post("/optimize", authMiddleware, async (c) => {
  let body: { content?: string; provider?: string; model?: string };
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

  if (!isAiAvailable().optimize) {
    return c.json({ error: "AI optimization is not configured" }, 503);
  }

  const ip = getClientIP(c);
  const rateError = checkRateLimit(ip, "ai");
  if (rateError) {
    return c.json({ error: formatRateLimitError("ai", rateError) }, 429);
  }

  const result = await optimizeContent(
    body.content.trim(),
    body.provider,
    body.model,
  );
  if (result === null) {
    return c.json({ error: "AI service temporarily unavailable" }, 500);
  }

  recordRateLimit(ip, "ai");

  return c.json({ content: result });
});

// POST /api/ai/suggest-tags — tag suggestions (auth required)
aiApp.post("/suggest-tags", authMiddleware, async (c) => {
  let body: { content?: string; provider?: string; model?: string };
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

  if (!isAiAvailable().tags) {
    return c.json({ error: "Tag suggestion is not configured" }, 503);
  }

  const ip2 = getClientIP(c);
  const rateError2 = checkRateLimit(ip2, "ai");
  if (rateError2) {
    return c.json({ error: formatRateLimitError("ai", rateError2) }, 429);
  }

  const existingTags = getAllTags();
  const tags = await suggestTags(
    body.content.trim(),
    existingTags,
    body.provider,
    body.model,
  );

  recordRateLimit(ip2, "ai");

  return c.json({ tags });
});

// POST /api/ai/action — 统一 AI 写作操作（auth required）
const VALID_ACTIONS = [
  "summarize",
  "expand",
  "extract-keypoints",
  "polish",
] as const;

aiApp.post("/action", authMiddleware, async (c) => {
  let body: {
    content?: string;
    action?: string;
    style?: string;
    provider?: string;
    model?: string;
  };
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

  if (
    !body.action ||
    !VALID_ACTIONS.includes(body.action as (typeof VALID_ACTIONS)[number])
  ) {
    return c.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      400,
    );
  }

  const action = body.action as (typeof VALID_ACTIONS)[number];

  if (!isAiAvailable().optimize) {
    return c.json({ error: "AI is not configured" }, 503);
  }

  const ip = getClientIP(c);
  const rateError = checkRateLimit(ip, "ai");
  if (rateError) {
    return c.json({ error: formatRateLimitError("ai", rateError) }, 429);
  }

  const result = await executeAction(
    body.content.trim(),
    action,
    body.provider,
    body.model,
  );
  if (result === null) {
    return c.json({ error: "AI service temporarily unavailable" }, 500);
  }

  recordRateLimit(ip, "ai");

  return c.json({ result });
});

// POST /api/ai/chat — 对话式 AI 工作台 (SSE, auth required)
interface ChatMessage {
  role: string;
  content: string;
}

aiApp.post("/chat", authMiddleware, async (c) => {
  let body: {
    message?: string;
    history?: ChatMessage[];
    provider?: string;
    model?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (
    !body.message ||
    typeof body.message !== "string" ||
    body.message.trim().length === 0
  ) {
    return c.json({ error: "Message is required" }, 400);
  }

  if (!isAiAvailable().optimize) {
    return c.json({ error: "AI chat is not configured" }, 503);
  }

  const ip = getClientIP(c);
  const rateError = checkRateLimit(ip, "ai");
  if (rateError) {
    return c.json({ error: formatRateLimitError("ai", rateError) }, 429);
  }

  recordRateLimit(ip, "ai");

  const message = body.message.trim();
  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history.filter(
        (h) => h && typeof h.role === "string" && typeof h.content === "string",
      )
    : [];

  // Build context via semantic search
  let contextMemos: string[] = [];

  try {
    const semanticIds = await getSemanticResults(message, 5);
    if (semanticIds.length > 0) {
      const semMemos = getMemos({ includePrivate: true, ids: semanticIds });
      contextMemos = semMemos.map((m) => m.content);
    }
  } catch {
    // Semantic search failed, continue without context
  }

  // Build SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = chatStream(
          message,
          history,
          contextMemos,
          body.provider,
          body.model,
        );

        for await (const chunk of gen) {
          const data = JSON.stringify({ type: "content", content: chunk });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", contextCount: contextMemos.length })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: msg })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return c.body(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
