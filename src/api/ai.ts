import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { getAllTags } from "../db";
import {
  isAiAvailable,
  optimizeContent,
  suggestTags,
  getAvailableModels,
} from "../ai/service";

export const aiApp = new Hono();

// GET /api/ai/status — feature detection (no auth required)
aiApp.get("/status", (c) => {
  return c.json(isAiAvailable());
});

// GET /api/ai/models — list available providers & models (no auth required)
aiApp.get("/models", (c) => {
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

  const result = await optimizeContent(
    body.content.trim(),
    body.provider,
    body.model,
  );
  if (result === null) {
    return c.json({ error: "AI service temporarily unavailable" }, 500);
  }

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

  const existingTags = getAllTags();
  const tags = await suggestTags(
    body.content.trim(),
    existingTags,
    body.provider,
    body.model,
  );
  return c.json({ tags });
});
