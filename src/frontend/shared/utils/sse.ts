/**
 * 通用 SSE（Server-Sent Events）流解析器。
 *
 * 使用 async 生成器函数（async function*）逐行读取 Response body 中的
 * `text/event-stream` 数据流，解析 `data:` 行中的 JSON 对象，并通过
 * `yield` 逐个产出解析结果，供调用方以 `for await...of` 循环消费。
 *
 * ---
 * TypeScript 中 function* 和 yield 用法说明：
 *
 * 1. function*（生成器函数 / Generator Function）
 *    - 声明一个生成器函数，调用时不立即执行函数体，而是返回一个
 *      Generator 迭代器对象。
 *    - 结合 async 关键字：`async function*` 声明一个 **异步生成器**，
 *      返回 AsyncGenerator，支持在 yield 处使用 await。
 *
 * 2. yield（产出）
 *    - 在生成器函数内部使用，用于“产出”一个值并暂停执行，等待外部
 *      调用 `.next()` 或 `for await...of` 下一次迭代时才继续执行。
 *    - 类比：普通函数 return 会终止函数；yield 会“暂停”函数，交出
 *      值给调用方，后续可以从暂停点恢复继续执行。
 *
 * 3. 为什么用 async 生成器处理 SSE？
 *    - 传统回调方式或一次性读取全部数据会导致代码嵌套深、内存占用大。
 *    - 生成器让流式数据可以像操作普通数组一样用 for await...of 消费，
 *      每次只处理一条消息，代码清晰且内存友好。
 *
 * ---
 * @param response - Fetch API 的 Response 对象，body 应为 text/event-stream
 * @returns AsyncGenerator，每次 yield 一个解析后的 JSON 对象
 */
export async function* streamSSE(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  // 如果响应没有 body（例如 HEAD 请求），直接结束
  if (!response.body) return;

  // 获取 ReadableStream 的 reader，用于逐块读取二进制数据
  const reader = response.body.getReader();
  // TextDecoder 将字节流解码为字符串；{ stream: true } 确保跨 chunk 的
  // 多字节字符（如中文 UTF-8 编码）不会被截断
  const decoder = new TextDecoder();
  // buffer 缓存未完整解析的尾部数据（跨 chunk 的不完整行或 JSON 片段）
  let buffer = "";

  // 循环读取流中的每一块数据
  while (true) {
    // reader.read() 返回 { done: boolean, value?: Uint8Array }
    // done=true 表示流已结束
    const { done, value } = await reader.read();
    if (done) break;

    // 将二进制数据块解码为字符串并追加到 buffer
    buffer += decoder.decode(value, { stream: true });
    // 按换行符拆分成多行；pop() 获取最后一段不完整的行放回 buffer，
    // 等待下一个 chunk 补齐
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    // 逐行处理
    for (const line of lines) {
      const trimmed = line.trim();
      // SSE 协议：有效数据行以 "data: " 开头
      if (!trimmed.startsWith("data: ")) continue;

      try {
        // 去掉 "data: " 前缀（6 个字符），解析 JSON 并通过 yield 产出
        yield JSON.parse(trimmed.slice(6));
      } catch (err) {
        // JSON 解析失败：可能是 chunk 边界恰好切断了 JSON 字符串。
        // 如果 buffer 不大（<10KB），说明是短 JSON 被截断，将当前行
        // 放回 buffer 等待下一个 chunk 拼接后重试。
        if ((err as Error).name === "SyntaxError" && buffer.length < 10_000) {
          // 将当前行放回 buffer 头部，等待与下一个 chunk 拼接
          buffer = line + "\n" + buffer;
          continue;
        }
        // 非截断导致的 JSON 解析错误（或 buffer 过大），直接抛出
        throw err;
      }
    }
  }
}
