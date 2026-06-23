// 内存 session 存储 — 仅一个管理员用户，服务重启即失效
import type { Context, Next } from "hono";

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

// --- Bearer Token 认证（CLI/API 调用用） ---
export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function isBearerAuthenticated(request: Request): boolean {
  const key = process.env.MEMOS_SECRET_KEY;
  if (!key) return false;
  const token = getBearerToken(request);
  return token !== null && token === key;
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

// --- 登录频率限制 ---
const loginAttempts = new Map<
  string,
  { count: number; firstAttempt: number }
>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 60_000; // 1 分钟

// 返回 null 表示允许尝试，否则返回冷却剩余时间（毫秒）
export function checkLoginRateLimit(ip: string): number | null {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return null;
  if (now - entry.firstAttempt > LOGIN_COOLDOWN_MS) {
    loginAttempts.delete(ip);
    return null;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return LOGIN_COOLDOWN_MS - (now - entry.firstAttempt);
  }
  return null;
}

export function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > LOGIN_COOLDOWN_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    entry.count++;
  }
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// Periodic cleanup to prevent unbounded memory growth from stale IP entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAttempt > LOGIN_COOLDOWN_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 60_000);

// 返回 null 表示认证通过，否则返回 401 Response
// 同时支持 session cookie 和 Bearer token 两种认证方式
export function requireAuth(request: Request): Response | null {
  if (isAuthenticated(request) || isBearerAuthenticated(request)) {
    return null;
  }
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// Hono 中间件：认证失败直接返回 401，通过则继续后续处理
// 同时支持 session cookie 和 Bearer token 两种认证方式
export const authMiddleware = async (c: Context, next: Next) => {
  const err = requireAuth(c.req.raw);
  if (err) return err;
  await next();
};
