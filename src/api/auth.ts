import { Hono } from "hono";
import {
  createSession,
  destroySession,
  getSessionToken,
  isAuthenticated,
  setAuthCookie,
  clearAuthCookie,
} from "../auth";

const SECRET_KEY = process.env.MEMOS_SECRET_KEY || "memos-dev-test";

export const authApp = new Hono();

// GET /api/auth/check
authApp.get("/check", (c) => {
  return c.json({ authenticated: isAuthenticated(c.req.raw) });
});

// POST /api/auth/login
authApp.post("/login", async (c) => {
  let body: { key?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.key || body.key !== SECRET_KEY) {
    return c.json({ error: "Invalid key" }, 401);
  }

  const token = createSession();
  setAuthCookie(c.res.headers, token);
  return c.json({ ok: true });
});

// POST /api/auth/logout
authApp.post("/logout", (c) => {
  const token = getSessionToken(c.req.raw);
  if (token) destroySession(token);
  clearAuthCookie(c.res.headers);
  return c.json({ ok: true });
});
