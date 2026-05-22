// AI API client — multi-provider chat + DashScope embeddings
// All chat APIs use OpenAI-compatible format via standard fetch()
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getOptimizePrompt,
  getSuggestTagsPrompt,
  getSummarizePrompt,
  getRewritePrompt,
  getExpandPrompt,
  getKeypointsPrompt,
  getPolishPrompt,
} from "./prompts";
import { getAppConfig } from "../config/app-config";

function aiTimeout(): number {
  return getAppConfig().ai.requestTimeoutMs;
}
const CONFIG_PATH = join(import.meta.dir, "../../ai.config.json");

// --- Config types & loading ---

interface AiProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKeyEnv: string;
  models: string[];
}

interface AiConfig {
  providers: AiProviderConfig[];
  default: { provider: string; model: string };
}

interface ResolvedProvider {
  baseUrl: string;
  apiKey: string;
}

let _config: AiConfig | null = null;

function loadConfig(): AiConfig {
  if (_config) return _config;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AiConfig;
    if (parsed && parsed.providers && Array.isArray(parsed.providers)) {
      _config = parsed;
      return _config;
    }
  } catch {
    // Config file not found or invalid, fall through to fallback
  }
  // Fallback: DeepSeek-only for backward compatibility
  _config = {
    providers: [
      {
        id: "deepseek",
        name: "DeepSeek",
        endpoint:
          process.env["DEEPSEEK_BASE_URL"] ||
          "https://api.deepseek.com/v1/chat/completions",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        models: ["deepseek-v4-flash"],
      },
    ],
    default: { provider: "deepseek", model: "deepseek-v4-flash" },
  };
  return _config;
}

function getConfig(): AiConfig {
  return _config ?? loadConfig();
}

// --- Provider resolution ---

function resolveProvider(providerId: string): ResolvedProvider | null {
  const config = getConfig();
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) return null;
  return { baseUrl: provider.endpoint, apiKey };
}

function getDefaultProviderId(): string {
  return getConfig().default.provider;
}

function getDefaultModel(): string {
  return getConfig().default.model;
}

// --- Availability ---

export function isAiAvailable(): {
  optimize: boolean;
  embedding: boolean;
  tags: boolean;
  available: boolean;
} {
  const config = getConfig();
  const hasChatProvider = config.providers.some(
    (p) => !!process.env[p.apiKeyEnv],
  );
  const hasDashScope = !!process.env["DASHSCOPE_API_KEY"];
  return {
    optimize: hasChatProvider,
    embedding: hasDashScope,
    tags: hasChatProvider,
    available: hasChatProvider || hasDashScope,
  };
}

// --- Get available models for API / frontend ---

export function getAvailableModels(): {
  providers: Array<{ id: string; name: string; models: string[] }>;
  default: { provider: string; model: string };
} {
  const config = getConfig();
  const available = config.providers
    .filter((p) => !!process.env[p.apiKeyEnv])
    .map((p) => ({ id: p.id, name: p.name, models: [...p.models] }));
  return { providers: available, default: { ...config.default } };
}

// --- Generic OpenAI-compatible chat completion ---

async function chatCompletion(
  providerId: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string | null> {
  const resolved = resolveProvider(providerId);
  if (!resolved) {
    console.error(
      `AI provider "${providerId}" not configured (missing API key or config entry)`,
    );
    return null;
  }

  try {
    const res = await fetch(resolved.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? getAppConfig().ai.defaultTemperature,
        max_tokens: opts?.max_tokens ?? getAppConfig().ai.defaultMaxTokens,
      }),
      signal: AbortSignal.timeout(aiTimeout()),
    });

    if (!res.ok) {
      console.error(
        `Chat API error (${providerId}): ${res.status} ${res.statusText}`,
      );
      return null;
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(`Chat API call failed (${providerId}):`, err);
    return null;
  }
}

// --- Generic OpenAI-compatible streaming chat completion ---

async function* chatCompletionStream(
  providerId: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; max_tokens?: number },
): AsyncGenerator<string> {
  const resolved = resolveProvider(providerId);
  if (!resolved) {
    throw new Error(
      `AI provider "${providerId}" not configured (missing API key or config entry)`,
    );
  }

  const res = await fetch(resolved.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? getAppConfig().ai.defaultTemperature,
      max_tokens: opts?.max_tokens ?? getAppConfig().ai.defaultMaxTokens,
      stream: true,
    }),
    signal: AbortSignal.timeout(aiTimeout()),
  });

  if (!res.ok) {
    console.error(
      `Chat API streaming error (${providerId}): ${res.status} ${res.statusText}`,
    );
    throw new Error(`Chat API error: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed?.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // skip unparseable lines
      }
    }
  }
}

// --- Content Optimization ---

export async function optimizeContent(
  content: string,
  providerId?: string,
  model?: string,
): Promise<string | null> {
  const pid = providerId || getDefaultProviderId();
  const mdl = model || getDefaultModel();
  if (!resolveProvider(pid)) return null;
  return chatCompletion(pid, mdl, [
    { role: "system", content: getOptimizePrompt() },
    {
      role: "user",
      content: `请优化以下备忘录内容：\n\n${content}`,
    },
  ]);
}

// --- Tag Suggestions ---

export async function suggestTags(
  content: string,
  existingTags: string[],
  providerId?: string,
  model?: string,
): Promise<string[]> {
  const pid = providerId || getDefaultProviderId();
  const mdl = model || getDefaultModel();
  if (!resolveProvider(pid) || !content.trim()) return [];

  const tagsStr =
    existingTags.length > 0 ? `已有标签: ${existingTags.join(", ")}。` : "";

  const result = await chatCompletion(pid, mdl, [
    {
      role: "system",
      content: getSuggestTagsPrompt().replace("{EXISTING_TAGS}", tagsStr),
    },
    { role: "user", content },
  ]);

  if (!result) return [];

  try {
    const trimmed = result.replace(/```(json)?|```/g, "").trim();
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (t: unknown): t is string => typeof t === "string" && t.length > 0,
        )
        .slice(0, 5);
    }
    return [];
  } catch {
    return result
      .split(/[\n,]/)
      .map((s) => s.replace(/^[\s"'-]+|[\s"'-]+$/g, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  }
}

// --- AI 写作工具箱：统一操作执行 ---

export async function executeAction(
  content: string,
  action: "summarize" | "rewrite" | "expand" | "extract-keypoints" | "polish",
  style?: "professional" | "casual" | "minimal" | "academic",
  providerId?: string,
  model?: string,
): Promise<string | null> {
  const pid = providerId || getDefaultProviderId();
  const mdl = model || getDefaultModel();
  if (!resolveProvider(pid)) return null;

  let systemPrompt: string;
  switch (action) {
    case "summarize":
      systemPrompt = getSummarizePrompt();
      break;
    case "rewrite":
      systemPrompt = getRewritePrompt(style || "professional");
      break;
    case "expand":
      systemPrompt = getExpandPrompt();
      break;
    case "extract-keypoints":
      systemPrompt = getKeypointsPrompt();
      break;
    case "polish":
      systemPrompt = getPolishPrompt();
      break;
  }

  return chatCompletion(pid, mdl, [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ]);
}

// --- DashScope Embeddings (unchanged) ---

export async function generateEmbedding(
  text: string,
): Promise<Float32Array | null> {
  try {
    const res = await fetch(
      `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env["DASHSCOPE_API_KEY"]}`,
        },
        body: JSON.stringify({
          model: "text-embedding-v3",
          input: text,
          dimensions: 1024,
        }),
        signal: AbortSignal.timeout(aiTimeout()),
      },
    );

    if (!res.ok) {
      console.error(`DashScope API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: any = await res.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) return null;
    return new Float32Array(embedding);
  } catch (err) {
    console.error("DashScope API call failed:", err);
    return null;
  }
}

// --- Rerank (DashScope qwen3-rerank) ---

export async function rerankDocuments(
  query: string,
  documents: Array<{ id: number; text: string }>,
  topN?: number,
): Promise<Array<{ id: number; score: number }>> {
  const finalTopN = topN ?? getAppConfig().rerank.finalTopN;

  try {
    const docTexts = documents.map((d) => d.text);
    const res = await fetch(
      `https://dashscope.aliyuncs.com/compatible-api/v1/reranks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env["DASHSCOPE_API_KEY"]}`,
        },
        body: JSON.stringify({
          model: "qwen3-rerank",

          query,
          documents: docTexts,

          parameters: {
            return_documents: false,
            top_n: finalTopN,
          },
        }),
        signal: AbortSignal.timeout(2000),
      },
    );

    if (!res.ok) {
      console.warn(`Rerank API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data: any = await res.json();
    const results: Array<{ index: number; relevance_score: number }> =
      data?.output?.results;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return [];
    }

    return results
      .map((r) => ({
        id: documents[r.index]?.id ?? -1,
        score: r.relevance_score,
      }))
      .filter((r) => r.id >= 0)
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn("Rerank API call failed:", err);
    return [];
  }
}

// --- Creative Content Generation (Streaming) ---

export async function* generateCreativeContentStream(
  promptContent: string,
  extraPrompt: string,
  contextMemos: string[],
  providerId?: string,
  model?: string,
): AsyncGenerator<string> {
  const pid = providerId || getDefaultProviderId();
  const mdl = model || getDefaultModel();

  const contextText =
    contextMemos.length > 0
      ? `\n\n相关备忘录上下文：\n${contextMemos
          .map((c, i) => `${i + 1}. ${c.slice(0, 500)}`)
          .join("\n\n")}`
      : "";

  yield* chatCompletionStream(pid, mdl, [
    {
      role: "system",
      content: promptContent,
    },
    {
      role: "user",
      content: `\n\n附加说明：${extraPrompt}${contextText}\n\n请根据以上所有内容生成创意输出。`,
    },
  ]);
}
