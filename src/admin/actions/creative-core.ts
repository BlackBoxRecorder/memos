import { api, apiUrl } from "../../helper/util";
import { getSelectedAiModel } from "../ai-state";
import { streamSSE } from "../utils/sse";
import type { Prompt, CreativeItem } from "../../model";
import type { PreviewMemo } from "../state";
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
  generateModalOpen,
  extraPromptInput,
  generationMode,
  manualMemoIds,
  generating,
  generateError,
  streamContent,
  streamDone,
  streamAbort,
  creativeDeleteId,
  creativeDeleting,
  previewOpen,
  previewMemos,
  previewLoading,
  previewError,
  previewFetched,
} from "../state";

// ====== Helpers ======

export function resetPreview(): void {
  previewFetched.val = false;
  previewMemos.val = [];
  previewError.val = null;
}

export function parseManualIds(): number[] {
  return manualMemoIds.val
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
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
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

export function openPromptEdit(prompt: Prompt): void {
  promptFormMode.val = { type: "edit", id: prompt.id };
  promptFormTitle.val = prompt.title;
  promptFormContent.val = prompt.content;
  promptFormError.val = null;
}

export function closePromptForm(): void {
  promptFormMode.val = { type: "closed" };
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
    if (promptFormMode.val.type === "create") {
      await api("api/creative/prompts", { method: "POST", body });
    } else if (promptFormMode.val.type === "edit") {
      await api(`api/creative/prompts/${promptFormMode.val.id}`, {
        method: "PUT",
        body,
      });
    }
    closePromptForm();
    await loadPrompts();
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

// ====== Context Preview ======

export async function loadPreviewContext(): Promise<void> {
  if (selectedPromptId.val === null) {
    previewError.val = "请先选择提示词";
    previewFetched.val = false;
    previewMemos.val = [];
    return;
  }
  if (!extraPromptInput.val.trim()) {
    previewError.val = "请先输入附加指令";
    previewFetched.val = false;
    previewMemos.val = [];
    return;
  }

  const body: Record<string, unknown> = {
    prompt_id: selectedPromptId.val,
    extra_prompt: extraPromptInput.val.trim(),
  };

  if (generationMode.val === "manual") {
    const ids = parseManualIds();
    if (ids.length === 0) {
      previewError.val = "无效的 Memo ID。请输入有效的数字 ID，用逗号分隔。";
      previewFetched.val = false;
      previewMemos.val = [];
      return;
    }
    body.memo_ids = ids;
  }

  previewLoading.val = true;
  previewError.val = null;
  try {
    const data = await api<{ memos: PreviewMemo[] }>(
      "api/creative/preview-context",
      { method: "POST", body: JSON.stringify(body) },
    );
    previewMemos.val = data.memos;
    previewFetched.val = true;
  } catch (err) {
    previewError.val = (err as Error).message;
    previewMemos.val = [];
    previewFetched.val = false;
  } finally {
    previewLoading.val = false;
  }
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
  if (generationMode.val === "manual" && !manualMemoIds.val.trim()) {
    generateError.val = "请输入 Memo ID（用逗号分隔）";
    return;
  }

  const body: Record<string, unknown> = {
    prompt_id: selectedPromptId.val,
    extra_prompt: extraPromptInput.val.trim(),
  };

  const { provider, model } = getSelectedAiModel();
  body.provider = provider;
  body.model = model;

  if (generationMode.val === "manual") {
    const ids = parseManualIds();
    if (ids.length === 0) {
      generateError.val = "无效的 Memo ID。请输入有效的数字 ID，用逗号分隔。";
      return;
    }
    body.memo_ids = ids;
  }

  generating.val = true;
  generateError.val = null;
  streamContent.val = "";
  streamDone.val = false;

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

    let pendingStreamContent = "";
    let rafScheduled = false;

    const flushStreamContent = () => {
      if (pendingStreamContent) {
        streamContent.val += pendingStreamContent;
        pendingStreamContent = "";
      }
      rafScheduled = false;
    };

    for await (const msg of streamSSE(resp)) {
      if (msg.type === "content") {
        pendingStreamContent += msg.content as string;
        if (!rafScheduled) {
          rafScheduled = true;
          requestAnimationFrame(flushStreamContent);
        }
      } else if (msg.type === "done") {
        creativeItems.val = [msg.item as CreativeItem, ...creativeItems.val];
        streamDone.val = true;
      } else if (msg.type === "error") {
        throw new Error(msg.error as string);
      }
    }

    if (pendingStreamContent) {
      streamContent.val += pendingStreamContent;
      pendingStreamContent = "";
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    generateError.val = (err as Error).message;
  } finally {
    generating.val = false;
    streamAbort.current = null;
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

// ====== Close Generate Modal ======

export function closeGenerateModal(): void {
  if (streamAbort.current) streamAbort.current.abort();
  generateModalOpen.val = false;
  extraPromptInput.val = "";
  manualMemoIds.val = "";
  generationMode.val = "auto";
  generateError.val = null;
  streamContent.val = "";
  streamDone.val = false;
  previewOpen.val = false;
  resetPreview();
}
