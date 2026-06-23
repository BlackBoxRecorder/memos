// 速率限制 — IP 级别两层窗口（小时 + 天），支持 memo 和 AI 两类
// 配置优先级：环境变量 > app.config.json > 硬编码默认值
// 环境变量：RATE_LIMIT_MEMOS_PER_HOUR, RATE_LIMIT_MEMOS_PER_DAY, RATE_LIMIT_AI_PER_HOUR, RATE_LIMIT_AI_PER_DAY
// 配置文件：app.config.json → rateLimit 节点
import type { Context } from "hono";
import { getAppConfig } from "../config/app-config";

type RateLimitCategory = "memo" | "ai";

interface WindowEntry {
  count: number;
  windowStart: number;
}

interface RateLimitEntry {
  hourly: WindowEntry;
  daily: WindowEntry;
}

export interface RateLimitError {
  limit: "hourly" | "daily";
  retryAfterMs: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const _rc = getAppConfig().rateLimit;
const MEMOS_PER_HOUR = parseInt(
  process.env.RATE_LIMIT_MEMOS_PER_HOUR || String(_rc.memosPerHour),
);
const MEMOS_PER_DAY = parseInt(
  process.env.RATE_LIMIT_MEMOS_PER_DAY || String(_rc.memosPerDay),
);
const AI_PER_HOUR = parseInt(
  process.env.RATE_LIMIT_AI_PER_HOUR || String(_rc.aiPerHour),
);
const AI_PER_DAY = parseInt(
  process.env.RATE_LIMIT_AI_PER_DAY || String(_rc.aiPerDay),
);

function getLimitKey(ip: string, category: RateLimitCategory): string {
  return `${ip}:${category}`;
}

function getHourWindowStart(): number {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function getDayWindowStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getLimits(category: RateLimitCategory): {
  hourly: number;
  daily: number;
} {
  if (category === "memo") {
    return { hourly: MEMOS_PER_HOUR, daily: MEMOS_PER_DAY };
  }
  return { hourly: AI_PER_HOUR, daily: AI_PER_DAY };
}

/** 从 Hono Context 中提取客户端 IP */
export function getClientIP(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return c.req.header("X-Real-IP") || "127.0.0.1";
}

/** 检查速率限制，返回 null 表示允许，否则返回限制信息 */
export function checkRateLimit(
  ip: string,
  category: RateLimitCategory,
): RateLimitError | null {
  const key = getLimitKey(ip, category);
  const entry = rateLimitMap.get(key);
  const limits = getLimits(category);
  const now = Date.now();

  if (!entry) return null;

  const hourWindow = getHourWindowStart();
  const dayWindow = getDayWindowStart();

  // 优先检查日限制
  if (
    entry.daily.windowStart === dayWindow &&
    entry.daily.count >= limits.daily
  ) {
    const retryAfter = dayWindow + 86_400_000 - now;
    return { limit: "daily", retryAfterMs: retryAfter };
  }

  // 检查小时限制
  if (
    entry.hourly.windowStart === hourWindow &&
    entry.hourly.count >= limits.hourly
  ) {
    const retryAfter = hourWindow + 3_600_000 - now;
    return { limit: "hourly", retryAfterMs: retryAfter };
  }

  return null;
}

/** 记录一次速率限制调用 */
export function recordRateLimit(ip: string, category: RateLimitCategory): void {
  const key = getLimitKey(ip, category);
  const hourWindow = getHourWindowStart();
  const dayWindow = getDayWindowStart();

  let entry = rateLimitMap.get(key);

  if (!entry) {
    entry = {
      hourly: { count: 0, windowStart: hourWindow },
      daily: { count: 0, windowStart: dayWindow },
    };
    rateLimitMap.set(key, entry);
  }

  // 小时窗口过期则重置
  if (entry.hourly.windowStart !== hourWindow) {
    entry.hourly = { count: 0, windowStart: hourWindow };
  }

  // 天窗口过期则重置
  if (entry.daily.windowStart !== dayWindow) {
    entry.daily = { count: 0, windowStart: dayWindow };
  }

  entry.hourly.count++;
  entry.daily.count++;
}

/** 构建速率限制错误响应消息 */
export function formatRateLimitError(
  category: RateLimitCategory,
  err: RateLimitError,
): string {
  const limits = getLimits(category);
  const limitCount = err.limit === "hourly" ? limits.hourly : limits.daily;
  const label = category === "memo" ? "备忘录创建" : "AI 调用";
  const retrySeconds = Math.ceil(err.retryAfterMs / 1000);
  return `速率限制：每${err.limit === "hourly" ? "小时" : "天"}${label}上限 ${limitCount} 次。请在 ${retrySeconds} 秒后重试。`;
}

// Periodic cleanup to prevent unbounded memory growth from stale IP entries
setInterval(() => {
  const hourWindow = getHourWindowStart();
  const dayWindow = getDayWindowStart();
  for (const [key, entry] of rateLimitMap) {
    // Remove entry if both hourly and daily windows are expired
    if (
      entry.hourly.windowStart !== hourWindow &&
      entry.daily.windowStart !== dayWindow
    ) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);
