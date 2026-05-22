import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { getAllTags } from "../db";
import {
  isAiAvailable,
  optimizeContent,
  suggestTags,
  getAvailableModels,
  executeAction,
} from "../ai/service";
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
  "rewrite",
  "expand",
  "extract-keypoints",
  "polish",
] as const;
const VALID_STYLES = ["professional", "casual", "minimal", "academic"];

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

  // 改写操作支持 style 参数
  let style: "professional" | "casual" | "minimal" | "academic" | undefined;
  if (action === "rewrite") {
    if (
      body.style &&
      (VALID_STYLES as readonly string[]).includes(body.style)
    ) {
      style = body.style as "professional" | "casual" | "minimal" | "academic";
    }
  }

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
    style,
    body.provider,
    body.model,
  );
  if (result === null) {
    return c.json({ error: "AI service temporarily unavailable" }, 500);
  }

  recordRateLimit(ip, "ai");

  return c.json({ result });
});
