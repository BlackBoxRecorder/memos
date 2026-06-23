import { Hono } from "hono";
import {
  createSession,
  destroySession,
  getSessionToken,
  isAuthenticated,
  setAuthCookie,
  clearAuthCookie,
  checkLoginRateLimit,
  recordLoginAttempt,
  clearLoginAttempts,
} from "../auth";

const SECRET_KEY = (() => {
  const key = process.env.MEMOS_SECRET_KEY;
  if (key) return key;
  console.error(
    "FATAL: MEMOS_SECRET_KEY environment variable is not set. Exiting.",
  );
  process.exit(1);
})();

export const authApp = new Hono();

// GET /api/auth/check
authApp.get("/check", (c) => {
  return c.json({ authenticated: isAuthenticated(c.req.raw) });
});

// POST /api/auth/login
authApp.post("/login", async (c) => {
  const ip =
    c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";

  // Rate limiting check
  const cooldown = checkLoginRateLimit(ip);
  if (cooldown !== null) {
    return c.json(
      {
        error: `Too many login attempts. Please wait ${Math.ceil(cooldown / 1000)} seconds.`,
      },
      429,
    );
  }

  let body: { key?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.key || body.key !== SECRET_KEY) {
    recordLoginAttempt(ip);
    return c.json({ error: "Invalid key" }, 401);
  }

  clearLoginAttempts(ip);
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
