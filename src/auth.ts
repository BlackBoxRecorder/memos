// 内存 session 存储 — 仅一个管理员用户，服务重启即失效
const sessions = new Set<string>();

const COOKIE_NAME = "memos_token";
const COOKIE_MAX_AGE = 86400; // 24 小时

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie");
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function getSessionToken(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies[COOKIE_NAME] || null;
}

export function isAuthenticated(request: Request): boolean {
  const token = getSessionToken(request);
  return token !== null && sessions.has(token);
}

export function createSession(): string {
  const token = crypto.randomUUID();
  sessions.add(token);
  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function setAuthCookie(headers: Headers, token: string): void {
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
  );
}

export function clearAuthCookie(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
  );
}

// 返回 null 表示认证通过，否则返回 401 Response
export function requireAuth(request: Request): Response | null {
  if (!isAuthenticated(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

// Hono 中间件：认证失败直接返回 401，通过则继续后续处理
export const authMiddleware = async (c: any, next: any) => {
  const err = requireAuth(c.req.raw);
  if (err) return err;
  await next();
};
