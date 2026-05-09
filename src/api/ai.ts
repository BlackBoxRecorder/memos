import { requireAuth } from "../auth";
import { getAllTags } from "../db";
import { isAiAvailable, optimizeContent, suggestTags } from "../ai/service";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleAiRequest(
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method;

  // GET /api/ai/status — feature detection (no auth required)
  if (method === "GET" && path === "/api/ai/status") {
    const features = isAiAvailable();
    return json(features);
  }

  // POST /api/ai/optimize — content optimization (auth required)
  if (method === "POST" && path === "/api/ai/optimize") {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    if (!isAiAvailable().optimize) {
      return json({ error: "AI optimization is not configured" }, 503);
    }

    let body: { content?: string };
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

    const result = await optimizeContent(body.content.trim());
    if (result === null) {
      return json({ error: "AI service temporarily unavailable" }, 500);
    }

    return json({ content: result });
  }

  // POST /api/ai/suggest-tags — tag suggestions (auth required)
  if (method === "POST" && path === "/api/ai/suggest-tags") {
    const authErr = requireAuth(request);
    if (authErr) return authErr;

    if (!isAiAvailable().tags) {
      return json({ error: "Tag suggestion is not configured" }, 503);
    }

    let body: { content?: string };
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

    const existingTags = getAllTags();
    const tags = await suggestTags(body.content.trim(), existingTags);
    return json({ tags });
  }

  return null;
}
