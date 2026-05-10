// AI API client — DeepSeek (chat/optimize/tags) + DashScope (embeddings)
// All APIs use OpenAI-compatible format via standard fetch()

function env(key: string): string {
  return process.env[key] || "";
}

// --- Availability ---

export function isAiAvailable(): {
  optimize: boolean;
  embedding: boolean;
  tags: boolean;
  available: boolean;
} {
  const hasDeepSeek = !!env("DEEPSEEK_API_KEY");
  const hasDashScope = !!env("DASHSCOPE_API_KEY");
  return {
    optimize: hasDeepSeek,
    embedding: hasDashScope,
    tags: hasDeepSeek,
    available: hasDeepSeek || hasDashScope,
  };
}

// --- DeepSeek Chat (optimize & tags) ---

function deepseekBaseUrl(): string | null {
  const key = env("DEEPSEEK_API_KEY");
  if (!key) return null;
  return env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
}

async function deepseekChat(
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  const baseUrl = deepseekBaseUrl();
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env("DEEPSEEK_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      console.error(`DeepSeek API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("DeepSeek API call failed:", err);
    return null;
  }
}

// --- Content Optimization ---

const OPTIMIZE_SYSTEM_PROMPT = `You are a writing assistant for a personal memos app. Optimize the user's memo content:
- Extract and clarify core viewpoints
- Highlight key information naturally
- Keep language fluent and natural
- Make expression more concise without losing meaning
- If the content is too terse, appropriately expand and enrich it
- Return ONLY the optimized text, no explanations or prefixes`;

export async function optimizeContent(content: string): Promise<string | null> {
  if (!deepseekBaseUrl()) return null;
  return deepseekChat([
    { role: "system", content: OPTIMIZE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Please optimize the following memo content:\n\n${content}`,
    },
  ]);
}

// --- Tag Suggestions ---

export async function suggestTags(
  content: string,
  existingTags: string[],
): Promise<string[]> {
  if (!deepseekBaseUrl() || !content.trim()) return [];

  const tagsStr =
    existingTags.length > 0
      ? `Existing tags: ${existingTags.join(", ")}. `
      : "";

  const result = await deepseekChat([
    {
      role: "system",
      content: `You are a tag suggestion assistant. Analyze the content and suggest the most appropriate 1-3 tags.
${tagsStr}Prefer reusing existing tags when they fit well. Suggest new concise tags only when no existing tag fits.
Return ONLY a JSON array of strings, like ["tag1", "tag2"]. No explanations.`,
    },
    { role: "user", content },
  ]);

  if (!result) return [];

  try {
    // Try to parse as JSON array
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
    // Fallback: extract lines that look like tags
    return result
      .split(/[\n,]/)
      .map((s) => s.replace(/^[\s"'-]+|[\s"'-]+$/g, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  }
}

// --- DashScope Embeddings ---

function dashscopeBaseUrl(): string | null {
  const key = env("DASHSCOPE_API_KEY");
  if (!key) return null;
  return "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

export async function generateEmbedding(
  text: string,
): Promise<Float32Array | null> {
  const baseUrl = dashscopeBaseUrl();
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env("DASHSCOPE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "text-embedding-v3",
        input: text,
        dimensions: 1024,
      }),
    });

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

// --- Creative Content Generation ---

export async function generateCreativeContent(
  promptContent: string,
  extraPrompt: string,
  contextMemos: string[],
): Promise<string | null> {
  if (!deepseekBaseUrl()) return null;

  const contextText =
    contextMemos.length > 0
      ? `\n\nRelevant context from my memos:\n${contextMemos.map((c, i) => `${i + 1}. ${c.slice(0, 500)}`).join("\n\n")}`
      : "";

  return deepseekChat([
    {
      role: "system",
      content:
        "You are a creative assistant for a personal memos app. Follow the instructions provided to generate thoughtful, well-structured content.",
    },
    {
      role: "user",
      content: `Creative task: ${promptContent}\n\nAdditional instructions: ${extraPrompt}${contextText}\n\nGenerate creative content based on all of the above.`,
    },
  ]);
}

// --- Creative Content Generation (Streaming) ---

export async function* generateCreativeContentStream(
  promptContent: string,
  extraPrompt: string,
  contextMemos: string[],
): AsyncGenerator<string> {
  const baseUrl = deepseekBaseUrl();
  if (!baseUrl) throw new Error("DeepSeek API not configured");

  const contextText =
    contextMemos.length > 0
      ? `\n\nRelevant context from my memos:\n${contextMemos
          .map((c, i) => `${i + 1}. ${c.slice(0, 500)}`)
          .join("\n\n")}`
      : "";

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("DEEPSEEK_API_KEY")}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a creative assistant for a personal memos app. Follow the instructions provided to generate thoughtful, well-structured content.",
        },
        {
          role: "user",
          content: `Creative task: ${promptContent}\n\nAdditional instructions: ${extraPrompt}${contextText}\n\nGenerate creative content based on all of the above.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    }),
  });

  if (!res.ok) {
    console.error(`DeepSeek API error: ${res.status} ${res.statusText}`);
    throw new Error(`DeepSeek API error: ${res.status}`);
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
