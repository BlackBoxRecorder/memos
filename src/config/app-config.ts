// 应用全局配置加载器 — 从 app.config.json 读取，带内存缓存和硬编码 fallback
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_PATH = join(import.meta.dir, "../../app.config.json");

// --- Config types ---

export interface AppConfig {
  ai: {
    requestTimeoutMs: number;
    defaultMaxTokens: number;
    defaultTemperature: number;
  };
  embeddings: {
    similarityThreshold: number;
  };
  rerank: {
    enabled: boolean;
    candidateTopN: number;
    finalTopN: number;
  };
  rateLimit: {
    memosPerHour: number;
    memosPerDay: number;
    aiPerHour: number;
    aiPerDay: number;
  };
}

// --- 硬编码最终 fallback 值 ---

const FALLBACK: AppConfig = {
  ai: {
    requestTimeoutMs: 120_000,
    defaultMaxTokens: 2048,
    defaultTemperature: 0.7,
  },
  embeddings: {
    similarityThreshold: 0.5,
  },
  rerank: {
    enabled: true,
    candidateTopN: 30,
    finalTopN: 10,
  },
  rateLimit: {
    memosPerHour: 50,
    memosPerDay: 200,
    aiPerHour: 30,
    aiPerDay: 100,
  },
};

let _config: AppConfig | null = null;

function loadConfig(): AppConfig {
  // Helper: validate numeric config value, fallback on wrong type
  const safeNum = (val: unknown, fallback: number, name: string): number => {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (val !== undefined && val !== null) {
      console.warn(
        `[app-config] Invalid type for "${name}" (expected number, got ${typeof val} = ${JSON.stringify(val)}), using fallback: ${fallback}`,
      );
    }
    return fallback;
  };
  const safeBool = (val: unknown, fallback: boolean, name: string): boolean => {
    if (typeof val === "boolean") return val;
    if (val !== undefined && val !== null) {
      console.warn(
        `[app-config] Invalid type for "${name}" (expected boolean, got ${typeof val} = ${JSON.stringify(val)}), using fallback: ${fallback}`,
      );
    }
    return fallback;
  };

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      console.log("[app-config] Loaded from app.config.json");
      return {
        ai: {
          requestTimeoutMs: safeNum(
            parsed.ai?.requestTimeoutMs,
            FALLBACK.ai.requestTimeoutMs,
            "ai.requestTimeoutMs",
          ),
          defaultMaxTokens: safeNum(
            parsed.ai?.defaultMaxTokens,
            FALLBACK.ai.defaultMaxTokens,
            "ai.defaultMaxTokens",
          ),
          defaultTemperature: safeNum(
            parsed.ai?.defaultTemperature,
            FALLBACK.ai.defaultTemperature,
            "ai.defaultTemperature",
          ),
        },
        embeddings: {
          similarityThreshold: safeNum(
            parsed.embeddings?.similarityThreshold,
            FALLBACK.embeddings.similarityThreshold,
            "embeddings.similarityThreshold",
          ),
        },
        rerank: {
          enabled: safeBool(
            parsed.rerank?.enabled,
            FALLBACK.rerank.enabled,
            "rerank.enabled",
          ),
          candidateTopN: safeNum(
            parsed.rerank?.candidateTopN,
            FALLBACK.rerank.candidateTopN,
            "rerank.candidateTopN",
          ),
          finalTopN: safeNum(
            parsed.rerank?.finalTopN,
            FALLBACK.rerank.finalTopN,
            "rerank.finalTopN",
          ),
        },
        rateLimit: {
          memosPerHour: safeNum(
            parsed.rateLimit?.memosPerHour,
            FALLBACK.rateLimit.memosPerHour,
            "rateLimit.memosPerHour",
          ),
          memosPerDay: safeNum(
            parsed.rateLimit?.memosPerDay,
            FALLBACK.rateLimit.memosPerDay,
            "rateLimit.memosPerDay",
          ),
          aiPerHour: safeNum(
            parsed.rateLimit?.aiPerHour,
            FALLBACK.rateLimit.aiPerHour,
            "rateLimit.aiPerHour",
          ),
          aiPerDay: safeNum(
            parsed.rateLimit?.aiPerDay,
            FALLBACK.rateLimit.aiPerDay,
            "rateLimit.aiPerDay",
          ),
        },
      };
    }
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.log(
        "[app-config] app.config.json not found, using fallback defaults",
      );
    } else {
      console.warn(
        `[app-config] Failed to read/parse app.config.json: ${err?.message || err}, using fallback defaults`,
      );
    }
  }
  return { ...FALLBACK };
}

export function getAppConfig(): AppConfig {
  if (_config) return _config;
  _config = loadConfig();
  return _config;
}
