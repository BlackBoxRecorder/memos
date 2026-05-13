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
  rateLimit: {
    memosPerHour: 50,
    memosPerDay: 200,
    aiPerHour: 30,
    aiPerDay: 100,
  },
};

let _config: AppConfig | null = null;

function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      console.log("[app-config] Loaded from app.config.json");
      return {
        ai: {
          requestTimeoutMs:
            parsed.ai?.requestTimeoutMs ?? FALLBACK.ai.requestTimeoutMs,
          defaultMaxTokens:
            parsed.ai?.defaultMaxTokens ?? FALLBACK.ai.defaultMaxTokens,
          defaultTemperature:
            parsed.ai?.defaultTemperature ?? FALLBACK.ai.defaultTemperature,
        },
        embeddings: {
          similarityThreshold:
            parsed.embeddings?.similarityThreshold ??
            FALLBACK.embeddings.similarityThreshold,
        },
        rateLimit: {
          memosPerHour:
            parsed.rateLimit?.memosPerHour ?? FALLBACK.rateLimit.memosPerHour,
          memosPerDay:
            parsed.rateLimit?.memosPerDay ?? FALLBACK.rateLimit.memosPerDay,
          aiPerHour:
            parsed.rateLimit?.aiPerHour ?? FALLBACK.rateLimit.aiPerHour,
          aiPerDay: parsed.rateLimit?.aiPerDay ?? FALLBACK.rateLimit.aiPerDay,
        },
      };
    }
  } catch {
    // Config file not found or invalid, fall through to fallback
  }
  console.log(
    "[app-config] app.config.json not found or invalid, using fallback defaults",
  );
  return { ...FALLBACK };
}

export function getAppConfig(): AppConfig {
  if (_config) return _config;
  _config = loadConfig();
  return _config;
}
