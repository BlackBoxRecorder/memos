import {
  createSession,
  destroySession,
  getSessionToken,
  isAuthenticated,
  setAuthCookie,
  clearAuthCookie,
} from "../auth";

const SECRET_KEY = process.env.MEMOS_SECRET_KEY || "memos-dev-test";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleAuthRequest(
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method;

  // GET /api/auth/check
  if (method === "GET" && path === "/api/auth/check") {
    return json({ authenticated: isAuthenticated(request) });
  }

  // POST /api/auth/login
  if (method === "POST" && path === "/api/auth/login") {
    let body: { key?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!body.key || body.key !== SECRET_KEY) {
      return json({ error: "Invalid key" }, 401);
    }

    const token = createSession();
    const headers = new Headers({ "Content-Type": "application/json" });
    setAuthCookie(headers, token);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  }

  // POST /api/auth/logout
  if (method === "POST" && path === "/api/auth/logout") {
    const token = getSessionToken(request);
    if (token) destroySession(token);
    const headers = new Headers({ "Content-Type": "application/json" });
    clearAuthCookie(headers);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  }

  return null; // 不匹配此 handler
}
