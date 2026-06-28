import { api, apiUrl } from "../../../helper/util";
import { getSelectedAiModel } from "../ai-state";
import { streamSSE } from "../../shared/utils/sse";
import type { Prompt, CreativeItem } from "../../../model";
import {
  prompts,
  selectedPromptId,
  creativeItems,
  creativeLoading,
  promptFormMode,
  promptFormTitle,
  promptFormContent,
  promptFormError,
  promptFormSaving,
  extraPromptInput,
  selectedTagFilter,
  generating,
  generateError,
  streamContent,
  streamAbort,
  creativeDeleteId,
  creativeDeleting,
  availableTags,
  promptModalSelectedId,
} from "../state";

// ====== Tags ======

export async function loadTags(): Promise<void> {
  try {
    const data = await api<{ tags: Array<{ name: string; count: number }> }>(
      "api/creative/tags",
    );
    availableTags.val = data.tags;
  } catch {
    // silently ignore
  }
}

// ====== Prompt CRUD ======

export async function loadPrompts(): Promise<void> {
  try {
    const data = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    prompts.val = data.prompts;
    if (selectedPromptId.val === null && data.prompts.length > 0) {
      const first = data.prompts[0]!;
      selectedPromptId.val = first.id;
      loadCreativeItems(first.id);
    }
  } catch {
    // silently ignore
  }
}

async function loadCreativeItems(promptId?: number): Promise<void> {
  creativeLoading.val = true;
  try {
    const query = promptId !== undefined ? `?prompt_id=${promptId}` : "";
    const data = await api<{ items: CreativeItem[] }>(`api/creative${query}`);
    creativeItems.val = data.items;
  } catch {
    creativeItems.val = [];
  } finally {
    creativeLoading.val = false;
  }
}

export function openPromptCreate(): void {
  promptFormMode.val = { type: "create" };
  promptModalSelectedId.val = null;
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

export function openPromptEdit(prompt: Prompt): void {
  promptFormMode.val = { type: "edit", id: prompt.id };
  promptModalSelectedId.val = prompt.id;
  promptFormTitle.val = prompt.title;
  promptFormContent.val = prompt.content;
  promptFormError.val = null;
}

export function closePromptForm(): void {
  promptFormMode.val = { type: "closed" };
  promptModalSelectedId.val = null;
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

export async function savePromptForm(): Promise<void> {
  if (!promptFormTitle.val.trim()) {
    promptFormError.val = "标题不能为空";
    return;
  }
  if (!promptFormContent.val.trim()) {
    promptFormError.val = "内容不能为空";
    return;
  }
  promptFormSaving.val = true;
  promptFormError.val = null;
  try {
    const body = JSON.stringify({
      title: promptFormTitle.val.trim(),
      content: promptFormContent.val.trim(),
    });
    // Keep selection after save
    if (promptFormMode.val.type === "create") {
      await api("api/creative/prompts", { method: "POST", body });
    } else if (promptFormMode.val.type === "edit") {
      await api(`api/creative/prompts/${promptFormMode.val.id}`, {
        method: "PUT",
        body,
      });
    }
    const wasEdit = promptFormMode.val.type === "edit";
    const savedId = wasEdit
      ? (promptFormMode.val as { type: "edit"; id: number }).id
      : null;
    closePromptForm();
    await loadPrompts();
    // Re-select the saved prompt
    if (savedId !== null) {
      promptModalSelectedId.val = savedId;
      const p = prompts.val.find((pp) => pp.id === savedId);
      if (p) {
        promptFormMode.val = { type: "edit", id: p.id };
        promptFormTitle.val = p.title;
        promptFormContent.val = p.content;
      }
    } else {
      // After create, select the first prompt
      const first = prompts.val[0];
      if (first) {
        promptModalSelectedId.val = first.id;
        promptFormMode.val = { type: "edit", id: first.id };
        promptFormTitle.val = first.title;
        promptFormContent.val = first.content;
      }
    }
  } catch (err) {
    promptFormError.val = (err as Error).message;
  } finally {
    promptFormSaving.val = false;
  }
}

export async function deletePrompt(id: number): Promise<void> {
  try {
    await api(`api/creative/prompts/${id}`, { method: "DELETE" });
    if (selectedPromptId.val === id) {
      selectedPromptId.val = null;
      creativeItems.val = [];
    }
    await loadPrompts();
  } catch {
    // silently fail
  }
}

export async function selectPrompt(id: number): Promise<void> {
  selectedPromptId.val = id;
  await loadCreativeItems(id);
}

// ====== Generate ======

export async function handleGenerate(): Promise<void> {
  if (!extraPromptInput.val.trim()) {
    generateError.val = "请输入附加指令";
    return;
  }
  if (selectedPromptId.val === null) {
    generateError.val = "请先选择提示词";
    return;
  }
  if (!selectedTagFilter.val.trim()) {
    generateError.val = "请选择一个标签";
    return;
  }

  const body: Record<string, unknown> = {
    prompt_id: selectedPromptId.val,
    extra_prompt: extraPromptInput.val.trim(),
    tag: selectedTagFilter.val.trim(),
  };

  const { provider, model } = getSelectedAiModel();
  body.provider = provider;
  body.model = model;

  generating.val = true;
  generateError.val = null;

  if (streamAbort.current) streamAbort.current.abort();
  streamAbort.current = new AbortController();

  try {
    const resp = await fetch(apiUrl("api/creative/generate"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: streamAbort.current.signal,
    });

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `请求失败（${resp.status}）` }));
      throw new Error(err.error || "请求失败");
    }

    // rAF throttled streaming output
    let streamBuffer = "";
    let flushPending = false;
    const flushStream = () => {
      if (streamBuffer) {
        streamContent.val += streamBuffer;
        streamBuffer = "";
      }
      flushPending = false;
    };

    for await (const msg of streamSSE(resp)) {
      if (msg.type === "content") {
        streamBuffer += msg.content as string;
        if (!flushPending) {
          flushPending = true;
          requestAnimationFrame(flushStream);
        }
      } else if (msg.type === "done") {
        // Flush any remaining buffered content
        if (streamBuffer || flushPending) {
          flushStream();
        }
        creativeItems.val = [msg.item as CreativeItem, ...creativeItems.val];
        extraPromptInput.val = "";
      } else if (msg.type === "error") {
        throw new Error(msg.error as string);
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    generateError.val = (err as Error).message;
  } finally {
    generating.val = false;
    streamAbort.current = null;
    streamContent.val = "";
  }
}

// ====== Creative Item Delete ======

export async function deleteCreativeItem(id: number): Promise<void> {
  creativeDeleting.val = true;
  try {
    await api(`api/creative/${id}`, { method: "DELETE" });
    creativeDeleteId.val = null;
    await loadCreativeItems(selectedPromptId.val ?? undefined);
  } catch {
    // silently fail
  } finally {
    creativeDeleting.val = false;
  }
}

// ====== Reset Generation ======

export function resetGeneration(): void {
  if (streamAbort.current) streamAbort.current.abort();
  extraPromptInput.val = "";
  generateError.val = null;
}
