import { api, apiUrl } from "../../../helper/util";
import { getSelectedAiModel } from "../ai-state";
import { streamSSE } from "../../shared/utils/sse";
import type { Prompt, CreativeItem } from "../../../model";
import {
  chatMessages,
  chatInput,
  chatStreaming,
  chatContextCount,
  chatAbort,
  creativeItems,
  prompts,
} from "../state";

export async function sendChatMessage(): Promise<void> {
  const msg = chatInput.val.trim();
  if (!msg || chatStreaming.val) return;

  chatInput.val = "";
  chatStreaming.val = true;
  chatContextCount.val = 0;

  chatMessages.val = [...chatMessages.val, { role: "user", content: msg }];
  const aiIdx = chatMessages.val.length;
  chatMessages.val = [...chatMessages.val, { role: "assistant", content: "" }];

  if (chatAbort.current) chatAbort.current.abort();
  chatAbort.current = new AbortController();

  try {
    const body: Record<string, unknown> = {
      message: msg,
      history: chatMessages.val.slice(0, aiIdx).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    const selected = getSelectedAiModel();
    if (selected) {
      body.provider = selected.provider;
      body.model = selected.model;
    }

    const resp = await fetch(apiUrl("api/ai/chat"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: chatAbort.current.signal,
    });

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `请求失败（${resp.status}）` }));
      throw new Error(err.error || "请求失败");
    }

    let aiContent = "";

    for await (const evt of streamSSE(resp)) {
      if (evt.type === "content") {
        aiContent += evt.content as string;
        const msgs = [...chatMessages.val];
        msgs[aiIdx] = { role: "assistant", content: aiContent };
        chatMessages.val = msgs;
      } else if (evt.type === "done") {
        chatContextCount.val = (evt.contextCount as number) ?? 0;
      } else if (evt.type === "error") {
        throw new Error(evt.error as string);
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    const msgs = [...chatMessages.val];
    msgs[aiIdx] = {
      role: "assistant",
      content: `错误: ${(err as Error).message}`,
    };
    chatMessages.val = msgs;
  } finally {
    chatStreaming.val = false;
    chatAbort.current = null;
  }
}

export async function saveChatAsCreative(): Promise<void> {
  if (chatMessages.val.length === 0) return;
  const content = chatMessages.val
    .map((m) => `**${m.role === "user" ? "用户" : "AI"}：**\n${m.content}`)
    .join("\n\n---\n\n");
  try {
    // 确保存在至少一个 prompt，否则自动创建
    let data = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    if (data.prompts.length === 0) {
      await api("api/creative/prompts", {
        method: "POST",
        body: JSON.stringify({ title: "对话记录", content: "对话记录" }),
      });
      data = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    }
    const promptId = data.prompts[0]?.id ?? 1;
    const itemResp = await api<{ item: CreativeItem }>("api/creative", {
      method: "POST",
      body: JSON.stringify({
        prompt_id: promptId,
        content,
        extra_prompt: "",
        context_memo_ids: "",
      }),
    });
    creativeItems.val = [itemResp.item, ...creativeItems.val];
    alert("对话已保存到创意内容列表");
  } catch (err) {
    alert("保存失败：" + (err as Error).message);
  }
}

export function newChat(): void {
  if (chatAbort.current) chatAbort.current.abort();
  chatMessages.val = [];
  chatInput.val = "";
  chatStreaming.val = false;
  chatContextCount.val = 0;
}
