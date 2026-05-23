/**
 * Generic SSE stream parser.
 * Reads a Response body with text/event-stream content type,
 * yielding parsed JSON objects from "data: " lines.
 */
export async function* streamSSE(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) return;

  const reader = response.body.getReader();
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
      if (!trimmed.startsWith("data: ")) continue;

      try {
        yield JSON.parse(trimmed.slice(6));
      } catch (err) {
        if ((err as Error).name === "SyntaxError") {
          // Incomplete JSON chunk, put back in buffer
          buffer = line + "\n" + buffer;
          continue;
        }
        throw err;
      }
    }
  }
}
