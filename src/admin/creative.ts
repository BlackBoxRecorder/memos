import van from "vanjs-core";
import { api, formatDate, truncate, apiUrl } from "../helper/util";
import { getSelectedAiModel } from "./ai-state";
import type { Prompt, CreativeItem, Memo } from "../model";
import { svgTrash } from "../helper/svgHelper";

type PromptFormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

const { div, span, button, input, textarea, h3 } = van.tags;

// ====== State ======
const prompts = van.state<Prompt[]>([]);
const promptFormMode = van.state<PromptFormMode>({ type: "closed" });
const promptFormTitle = van.state("");
const promptFormContent = van.state("");
const promptFormError = van.state<string | null>(null);
const promptFormSaving = van.state(false);

export const creativeItems = van.state<CreativeItem[]>([]);
const selectedPromptId = van.state<number | null>(null);
const generateModalOpen = van.state(false);
const extraPromptInput = van.state("");
const generationMode = van.state<"auto" | "manual">("auto");
const manualMemoIds = van.state("");
const generating = van.state(false);
const generateError = van.state<string | null>(null);
const readMoreItem = van.state<CreativeItem | null>(null);
const creativeLoading = van.state(false);

// Streaming state
const streamContent = van.state("");
const streamDone = van.state(false);
let streamAbort: AbortController | null = null;

// Delete confirm state for creative items
const creativeDeleteId = van.state<number | null>(null);
const creativeDeleting = van.state(false);

// ====== Chat state (Phase 2) ======
const creativeView = van.state<"list" | "chat">("list");
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}
const chatMessages = van.state<ChatMsg[]>([]);
const chatInput = van.state("");
const chatStreaming = van.state(false);
const chatContextCount = van.state(0);
let chatAbort: AbortController | null = null;

// Context preview state
type PreviewMemo = Pick<Memo, "id" | "content" | "tags" | "created_at">;
const previewOpen = van.state(false);
const previewMemos = van.state<PreviewMemo[]>([]);
const previewLoading = van.state(false);
const previewError = van.state<string | null>(null);
const previewFetched = van.state(false);

/** Reset context preview state to initial (not fetched). */
function resetPreview(): void {
  console.log(
    "[DEBUG resetPreview] called, current activeElement=",
    document.activeElement?.tagName,
  );
  previewFetched.val = false;
  previewMemos.val = [];
  previewError.val = null;
  console.log(
    "[DEBUG resetPreview] done, activeElement=",
    document.activeElement?.tagName,
  );
}

/** Parse comma-separated memo ID string into validated number array. */
function parseManualIds(): number[] {
  return manualMemoIds.val
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

// ====== API ======

// ====== Actions ======
/** Fetch all creative prompts from server. Auto-selects the first prompt if none is currently selected. */
export async function loadPrompts(): Promise<void> {
  try {
    const data = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    prompts.val = data.prompts;
    // Auto-select first prompt if none selected
    if (selectedPromptId.val === null && data.prompts.length > 0) {
      const first = data.prompts[0]!;
      selectedPromptId.val = first.id;
      loadCreativeItems(first.id);
    }
  } catch {
    //prompts.val = [];
  }
}

/** Fetch creative items for a specific prompt, or all items if no promptId given. */
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

/** Open the prompt form in create mode with empty fields. */
export function openPromptCreate(): void {
  promptFormMode.val = { type: "create" };
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

/** Open the prompt form in edit mode, pre-filled with the given prompt's data. */
function openPromptEdit(prompt: Prompt): void {
  promptFormMode.val = { type: "edit", id: prompt.id };
  promptFormTitle.val = prompt.title;
  promptFormContent.val = prompt.content;
  promptFormError.val = null;
}

/** Close the prompt form and reset all related state. */
function closePromptForm(): void {
  promptFormMode.val = { type: "closed" };
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

/** Validate and save the prompt form (create or edit), then refresh the prompts list. */
async function savePromptForm(): Promise<void> {
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

/** Delete a prompt by ID. Clears selected state and creative items if the deleted prompt was active. */
async function deletePrompt(id: number): Promise<void> {
  try {
    await api(`api/creative/prompts/${id}`, { method: "DELETE" });
    // If deleted prompt was selected, clear selection
    if (selectedPromptId.val === id) {
      selectedPromptId.val = null;
      creativeItems.val = [];
    }
    await loadPrompts();
  } catch {
    // silently fail
  }
}

/** Select a prompt by ID and load its associated creative items. */
async function selectPrompt(id: number): Promise<void> {
  selectedPromptId.val = id;
  await loadCreativeItems(id);
}

/** Fetch context preview from server showing which memos will be used for generation. Supports both auto-search and manual memo ID modes. */
async function loadPreviewContext(): Promise<void> {
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

/** Main creative generation entry: validates inputs, builds request body, starts SSE stream and renders output in real-time. */
async function handleGenerate(): Promise<void> {
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

  // Add current AI model selection
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

  // Abort any previous stream
  if (streamAbort) streamAbort.abort();
  streamAbort = new AbortController();

  try {
    const resp = await fetch(apiUrl("api/creative/generate"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: streamAbort.signal,
    });

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `请求失败（${resp.status}）` }));
      throw new Error(err.error || "请求失败");
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let pendingStreamContent = "";
    let rafScheduled = false;

    const flushStreamContent = () => {
      if (pendingStreamContent) {
        streamContent.val += pendingStreamContent;
        pendingStreamContent = "";
      }
      rafScheduled = false;
    };

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
          const msg = JSON.parse(trimmed.slice(6));
          if (msg.type === "content") {
            pendingStreamContent += msg.content;
            if (!rafScheduled) {
              rafScheduled = true;
              requestAnimationFrame(flushStreamContent);
            }
          } else if (msg.type === "done") {
            creativeItems.val = [msg.item, ...creativeItems.val];
            streamDone.val = true;
          } else if (msg.type === "error") {
            throw new Error(msg.error);
          }
        } catch (err) {
          // If parse failed (e.g. incomplete chunk), put back in buffer for next chunk
          if ((err as Error).name === "SyntaxError") {
            buffer = line + "\n" + buffer;
            continue;
          }
          throw err;
        }
      }
    }

    // Flush any remaining pending content after stream ends
    if (pendingStreamContent) {
      streamContent.val += pendingStreamContent;
      pendingStreamContent = "";
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    generateError.val = (err as Error).message;
  } finally {
    generating.val = false;
    streamAbort = null;
  }
}

/** Delete a creative item by ID, then reload the current prompt's items. */
async function deleteCreativeItem(id: number): Promise<void> {
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

// ====== Chat Actions ======

/** Send a chat message to the AI workspace and handle SSE streaming. */
async function sendChatMessage(): Promise<void> {
  const msg = chatInput.val.trim();
  if (!msg || chatStreaming.val) return;

  chatInput.val = "";
  chatStreaming.val = true;
  chatContextCount.val = 0;

  // Add user message
  chatMessages.val = [...chatMessages.val, { role: "user", content: msg }];
  // Add placeholder for assistant response
  const aiIdx = chatMessages.val.length;
  chatMessages.val = [...chatMessages.val, { role: "assistant", content: "" }];

  if (chatAbort) chatAbort.abort();
  chatAbort = new AbortController();

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
      signal: chatAbort.signal,
    });

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `请求失败（${resp.status}）` }));
      throw new Error(err.error || "请求失败");
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aiContent = "";

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
          const evt = JSON.parse(trimmed.slice(6));
          if (evt.type === "content") {
            aiContent += evt.content;
            const msgs = [...chatMessages.val];
            msgs[aiIdx] = { role: "assistant", content: aiContent };
            chatMessages.val = msgs;
          } else if (evt.type === "done") {
            chatContextCount.val = evt.contextCount ?? 0;
          } else if (evt.type === "error") {
            throw new Error(evt.error);
          }
        } catch (err) {
          if ((err as Error).name === "SyntaxError") {
            buffer = line + "\n" + buffer;
            continue;
          }
          throw err;
        }
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
    chatAbort = null;
  }
}

/** Save the current conversation as a creative item. */
async function saveChatAsCreative(): Promise<void> {
  if (chatMessages.val.length === 0) return;
  const content = chatMessages.val
    .map((m) => `**${m.role === "user" ? "用户" : "AI"}：**\n${m.content}`)
    .join("\n\n---\n\n");
  try {
    // Ensure we have a prompt; auto-select or create default
    const data = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    if (data.prompts.length === 0) {
      await api("api/creative/prompts", {
        method: "POST",
        body: JSON.stringify({ title: "对话记录", content: "对话记录" }),
      });
    }
    const pdata = await api<{ prompts: Prompt[] }>("api/creative/prompts");
    const promptId = pdata.prompts[0]?.id ?? 1;
    const item = await api<{ item: CreativeItem }>("api/creative", {
      method: "POST",
      body: JSON.stringify({ prompt_id: promptId, content, extra_prompt: "" }),
    });
    creativeItems.val = [item.item, ...creativeItems.val];
  } catch {
    // silently fail
  }
}

/** Clear the current conversation. */
function newChat(): void {
  if (chatAbort) chatAbort.abort();
  chatMessages.val = [];
  chatInput.val = "";
  chatStreaming.val = false;
  chatContextCount.val = 0;
}

// ====== Components ======

/** Modal form component for creating or editing a creative prompt. */
function PromptForm() {
  const isEdit = promptFormMode.val.type === "edit";
  const title = isEdit ? "Edit Prompt" : "New Prompt";
  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closePromptForm();
      },
    },
    div(
      { class: "modal" },
      div(
        { class: "form-card", style: "margin-bottom:0;box-shadow:none;" },
        h3(title),

        input({
          type: "text",
          placeholder: "提示词标题",
          value: promptFormTitle,
          disabled: () => promptFormSaving.val,
          oninput: (e: Event) =>
            (promptFormTitle.val = (e.target as HTMLInputElement).value),
        }),
        textarea({
          placeholder: "提示词内容（AI 指令）",
          style: "margin-top:10px;",
          value: promptFormContent,
          disabled: () => promptFormSaving.val,
          oninput: (e: Event) =>
            (promptFormContent.val = (e.target as HTMLTextAreaElement).value),
        }),
        div(
          { class: "form-row" },
          div({ style: "flex:1" }),
          button(
            { class: "btn btn-outline btn-sm", onclick: closePromptForm },
            "取消",
          ),
          button(
            {
              class: "btn btn-primary btn-sm",
              disabled: () => promptFormSaving.val,
              onclick: savePromptForm,
            },
            () => (promptFormSaving.val ? "保存中..." : "保存"),
          ),
        ),
        () =>
          promptFormError.val
            ? div({ class: "form-error" }, promptFormError.val)
            : "",
      ),
    ),
  );
}

/** Horizontal tag cloud showing all prompts as selectable tags with edit/delete actions. */
function TagCloud() {
  return div(
    { class: "tag-cloud" },
    ...prompts.val.map((prompt) => {
      return button(
        {
          class: () =>
            "tag-cloud-item" +
            (selectedPromptId.val === prompt.id ? " active" : ""),
          onclick: () => selectPrompt(prompt.id),
        },
        prompt.title,
        span(
          { class: "tag-actions" },
          button(
            {
              class: "tag-action-btn",
              title: "编辑",
              onclick: (e: Event) => {
                e.stopPropagation();
                openPromptEdit(prompt);
              },
            },
            "\u270E", // ✎
          ),
          button(
            {
              class: "tag-action-btn",
              title: "删除",
              onclick: (e: Event) => {
                e.stopPropagation();
                if (confirm(`确定要删除提示词「${prompt.title}」吗？`)) {
                  deletePrompt(prompt.id);
                }
              },
            },
            "\u00D7", // ×
          ),
        ),
      );
    }),
  );
}

/** Collapsible panel that fetches and displays a preview of memos that will be used as generation context. */
function PreviewPanel() {
  return div(
    {},
    // Compact toggle bar
    div(
      {
        class: "context-preview-bar",
        onclick: () => (previewOpen.val = !previewOpen.val),
      },
      () => (previewOpen.val ? "\u25BC" : "\u25B6"),
      "Memos 预览",
      () => {
        const hasData = previewFetched.val && !previewError.val;
        const memoCount = previewMemos.val.length;
        return hasData
          ? span(
              {
                class:
                  "context-preview-count" + (memoCount === 0 ? " empty" : ""),
              },
              memoCount === 0 ? "无结果" : memoCount + " 条 Memos",
            )
          : "";
      },
      span(
        { style: "margin-left:auto;" },
        button(
          {
            class: "btn btn-outline btn-sm",
            disabled: () => previewLoading.val || generating.val,
            onclick: (e: Event) => {
              e.stopPropagation();
              previewOpen.val = true;
              loadPreviewContext();
            },
          },
          () =>
            previewLoading.val
              ? "加载中..."
              : previewFetched.val
                ? "刷新"
                : "预览",
        ),
      ),
    ),
    // Expanded body
    () => (previewOpen.val ? renderPreviewBody() : ""),
  );
}

/** Renders the expanded body of the context preview panel. Handles error/loading/empty/data states. */
function renderPreviewBody() {
  if (previewError.val) {
    return div(
      {
        style: "margin-top:8px;font-size:12px;color:#c0392b;",
      },
      previewError.val,
    );
  }
  if (previewLoading.val && !previewFetched.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "正在加载上下文...",
    );
  }
  if (!previewFetched.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "点击「预览」查看将用作上下文的 Memos。",
    );
  }
  if (previewMemos.val.length === 0) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "未找到相关 Memos。",
    );
  }
  return div(
    {
      class: "modal-scroll-area",
      style:
        "margin-top:8px;display:flex;flex-direction:column;gap:6px;" +
        "max-height:180px;overflow-y:auto;",
    },
    ...previewMemos.val.map((m) =>
      div(
        {
          style:
            "padding:8px;background:#fff;border:1px solid #e5e5e5;" +
            "border-radius:4px;font-size:12px;color:#333;",
        },
        div(
          { class: "creative-meta", style: "margin-bottom:4px;" },
          span({ class: "badge" }, "#" + String(m.id)),
          ...m.tags.map((tag) => span({ class: "badge badge-tag" }, tag)),
          span(formatDate(m.created_at)),
        ),
        div(
          {
            style:
              "line-height:18px;white-space:pre-wrap;word-break:break-word;",
          },
          truncate(m.content, 120),
        ),
      ),
    ),
  );
}

/** Close the generate modal: abort any in-progress stream and reset all modal state. */
function closeGenerateModal(): void {
  if (streamAbort) streamAbort.abort();
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

/** Main generation modal: configuration form (prompt selection, context mode, extra instructions) + real-time streaming output display. */
function GenerateModal() {
  console.log("[DEBUG GenerateModal] called/rendered");
  const selectedPrompt = prompts.val.find((p) => p.id === selectedPromptId.val);
  const hasStarted = generating.val || !!streamContent.val || streamDone.val;

  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) {
          closeGenerateModal();
        }
      },
    },
    div(
      { class: "modal modal-flex", style: "max-width:600px;" },

      // ═══ HEADER ═══
      div(
        { class: "modal-header" },
        div(
          {
            style:
              "display:flex;align-items:center;justify-content:space-between;",
          },
          h3({ style: "margin-bottom:0;" }, "Generate Creative Content"),
          () =>
            hasStarted
              ? button(
                  {
                    class: "btn btn-outline btn-sm",
                    onclick: closeGenerateModal,
                  },
                  "\u2715",
                )
              : "",
        ),
        // Compact summary during generation
        () =>
          hasStarted
            ? div(
                { class: "generation-summary" },
                selectedPrompt ? selectedPrompt.title + " \u00B7 " : "",
                truncate(extraPromptInput.val, 60),
                generationMode.val === "manual" && manualMemoIds.val
                  ? " · ID：" + manualMemoIds.val
                  : "",
              )
            : "",
      ),

      // ═══ BODY ═══
      div(
        { class: "modal-body" },
        // ── Setup phase: always in DOM, hidden via display:none during generation ──
        div(
          {
            style: () => (hasStarted ? "display:none" : ""),
          },
          div(
            { class: "modal-section" },
            () =>
              selectedPrompt
                ? div(
                    { class: "selected-prompt-label" },
                    "已选提示词：",
                    span(
                      { style: "font-weight:500;color:#333" },
                      selectedPrompt.title,
                    ),
                  )
                : "",
            textarea({
              placeholder: "AI 生成的附加指令...",
              value: extraPromptInput,
              disabled: () => generating.val,
              oninput: (e: Event) => {
                const ta = e.target as HTMLTextAreaElement;
                console.log(
                  "[DEBUG oninput] value=",
                  ta.value,
                  "activeElement=",
                  document.activeElement?.tagName,
                  "isSame=",
                  document.activeElement === ta,
                );
                extraPromptInput.val = ta.value;
                console.log(
                  "[DEBUG oninput] after state set, activeElement=",
                  document.activeElement?.tagName,
                );
                resetPreview();
                console.log(
                  "[DEBUG oninput] after resetPreview, activeElement=",
                  document.activeElement?.tagName,
                  "isSame=",
                  document.activeElement === ta,
                );
                // Check again after a microtask (VanJS updates are async)
                queueMicrotask(() => {
                  console.log(
                    "[DEBUG oninput microtask] activeElement=",
                    document.activeElement?.tagName,
                    "isSame=",
                    document.activeElement === ta,
                    "textarea.value=",
                    ta.value,
                  );
                });
              },
              onfocus: () => console.log("[DEBUG FOCUS] textarea gained focus"),
              onblur: () =>
                console.log(
                  "[DEBUG BLUR] textarea lost focus, activeElement=",
                  document.activeElement?.tagName,
                ),
            }),
            // Context mode toggle
            div(
              { class: "context-mode-toggle" },
              span(
                {
                  style: "font-size:13px;color:#666;margin-right:8px;",
                },
                "上下文：",
              ),
              button(
                {
                  class: () =>
                    "mode-btn" +
                    (generationMode.val === "auto" ? " active" : ""),
                  disabled: () => generating.val,
                  onclick: () => {
                    generationMode.val = "auto";
                    resetPreview();
                  },
                },
                "自动匹配",
              ),
              button(
                {
                  class: () =>
                    "mode-btn" +
                    (generationMode.val === "manual" ? " active" : ""),
                  disabled: () => generating.val,
                  onclick: () => {
                    generationMode.val = "manual";
                    resetPreview();
                  },
                },
                "手动选择",
              ),
            ),
            // Manual memo ID input
            () =>
              generationMode.val === "manual"
                ? div(
                    { style: "margin-top:8px;" },
                    input({
                      type: "text",
                      placeholder: "Memo ID（例如 1,3,5）",
                      value: manualMemoIds,
                      disabled: () => generating.val,
                      oninput: (e: Event) => {
                        const inp = e.target as HTMLInputElement;
                        console.log(
                          "[DEBUG oninput memoIds] value=",
                          inp.value,
                          "activeElement=",
                          document.activeElement?.tagName,
                          "isSame=",
                          document.activeElement === inp,
                        );
                        manualMemoIds.val = inp.value;
                        console.log(
                          "[DEBUG oninput memoIds] after state set, activeElement=",
                          document.activeElement?.tagName,
                        );
                        resetPreview();
                        console.log(
                          "[DEBUG oninput memoIds] after resetPreview, activeElement=",
                          document.activeElement?.tagName,
                          "isSame=",
                          document.activeElement === inp,
                        );
                        queueMicrotask(() => {
                          console.log(
                            "[DEBUG oninput memoIds microtask] activeElement=",
                            document.activeElement?.tagName,
                            "isSame=",
                            document.activeElement === inp,
                            "input.value=",
                            inp.value,
                          );
                        });
                      },
                      onfocus: () =>
                        console.log("[DEBUG FOCUS] memoIds input gained focus"),
                      onblur: () =>
                        console.log(
                          "[DEBUG BLUR] memoIds input lost focus, activeElement=",
                          document.activeElement?.tagName,
                        ),
                    }),
                    div(
                      {
                        style: "font-size:11px;color:#999;margin-top:4px;",
                      },
                      "输入 Memo ID，用逗号分隔。在备忘录标签页查看 ID（#编号）。",
                    ),
                  )
                : "",
          ),
          // Context preview section
          div(
            { class: "modal-section" },
            div({ class: "modal-section-title" }, "Memos 预览"),
            PreviewPanel(),
          ),
        ),
        // ── Generation phase: output fills body ──
        () =>
          hasStarted
            ? (() => {
                if (!streamContent.val && !generating.val) return "";
                const done = streamDone.val;
                const active = generating.val;
                return div(
                  {
                    class: "hide-scrollbar",
                    style:
                      "background:#f8f9fb;border-radius:6px;" +
                      "border:1px solid #e5e5e5;padding:14px;" +
                      "min-height:200px;display:flex;flex-direction:column;",
                  },
                  div(
                    {
                      style: "font-size:13px;color:#888;margin-bottom:8px;",
                    },
                    done ? "生成的内容：" : "生成中...",
                  ),
                  div(
                    {
                      style:
                        "font-size:14px;line-height:22px;" +
                        "white-space:pre-wrap;word-break:break-word;" +
                        "color:#333;flex:1;",
                    },
                    streamContent,
                    () =>
                      active
                        ? span(
                            {
                              style:
                                "animation:blink 0.8s infinite;color:#3b82f6;",
                            },
                            "\u258B",
                          )
                        : "",
                  ),
                );
              })()
            : "",
      ),

      // ═══ FOOTER ═══
      div(
        { class: "modal-footer" },
        () =>
          generateError.val
            ? div(
                {
                  class: "form-error",
                  style: "margin-bottom:8px;",
                },
                generateError.val,
              )
            : "",
        () =>
          hasStarted
            ? div(
                { class: "modal-actions", style: "margin-top:0;" },
                button(
                  {
                    class: () =>
                      "btn btn-sm " +
                      (streamDone.val ? "btn-primary" : "btn-outline"),
                    onclick: closeGenerateModal,
                  },
                  () => (streamDone.val ? "关闭" : "取消"),
                ),
              )
            : div(
                { class: "modal-actions", style: "margin-top:0;" },
                button(
                  {
                    class: "btn btn-outline btn-sm",
                    onclick: closeGenerateModal,
                  },
                  "取消",
                ),
                button(
                  {
                    class: "btn btn-primary btn-sm",
                    disabled: () => generating.val || streamDone.val,
                    onclick: handleGenerate,
                  },
                  "生成",
                ),
              ),
      ),
    ),
  );
}

/** Modal displaying the full content of a creative item (for items longer than 200 chars). */
function ReadMoreModal() {
  const item = readMoreItem.val;
  if (!item) return "";
  const prompt = prompts.val.find((p) => p.id === item.prompt_id);
  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) readMoreItem.val = null;
      },
    },
    div(
      { class: "modal modal-wide" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;",
        },
        h3(prompt ? prompt.title : "Creative Content"),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: () => (readMoreItem.val = null),
          },
          "\u2715",
        ),
      ),
      div(
        { class: "read-more-content", style: "padding-right:16px;" },
        item.content,
      ),
      item.extra_prompt
        ? div(
            { style: "margin-top:12px;font-size:12px;color:#999;" },
            "附加指令：",
            item.extra_prompt,
          )
        : "",
      div(
        { style: "margin-top:4px;font-size:12px;color:#999;" },
        "创建于：",
        formatDate(item.created_at),
      ),
    ),
  );
}

/** Single creative item card with truncated content, metadata badges, and delete action. */
function CreativeCard(item: CreativeItem) {
  const prompt = prompts.val.find((p) => p.id === item.prompt_id);
  const isLong = item.content.length > 200;
  const displayContent = isLong
    ? item.content.slice(0, 200) + "..."
    : item.content;

  return div(
    { class: "creative-card", "data-creative-id": String(item.id) },
    div(
      { class: "creative-content" },
      displayContent,
      isLong
        ? button(
            {
              class: "read-more-btn",
              onclick: () => (readMoreItem.val = item),
            },
            " 更多",
          )
        : "",
    ),
    div(
      { class: "creative-meta" },
      prompt ? span({ class: "badge badge-tag" }, prompt.title) : "",
      item.extra_prompt
        ? span({ class: "badge" }, "附加：" + truncate(item.extra_prompt, 40))
        : "",
      span(formatDate(item.created_at)),
      span(
        { class: "creative-meta-icons" },
        button(
          {
            class: "creative-icon-btn delete",
            title: "删除",
            onclick: () => (creativeDeleteId.val = item.id),
          },
          svgTrash(),
        ),
      ),
    ),
    () =>
      creativeDeleteId.val === item.id
        ? div(
            { class: "delete-confirm" },
            span("确定要删除这条创意内容吗？"),
            button(
              {
                class: "btn btn-danger btn-sm",
                disabled: () => creativeDeleting.val,
                onclick: () => deleteCreativeItem(item.id),
              },
              "删除",
            ),
            button(
              {
                class: "btn btn-outline btn-sm",
                onclick: () => (creativeDeleteId.val = null),
              },
              "取消",
            ),
          )
        : "",
  );
}

// ====== Main Creative Tab Component ======

/** Root component of the Creative tab: tag cloud, generate button, modals, and conditional content list. */
// ====== ChatPanel Component ======

function ChatPanel() {
  const { span, button, textarea, form } = van.tags;

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    sendChatMessage();
  };

  return div(
    {},
    // Conversation area
    div(
      {
        style:
          "max-height:60vh;overflow-y:auto;margin-bottom:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color);",
      },
      () =>
        chatMessages.val.length === 0
          ? div(
              {
                style:
                  "text-align:center;color:var(--text-muted);padding:40px 20px;",
              },
              "开始与 AI 对话，探索你的笔记库。",
            )
          : div(
              chatMessages.val.map((msg, i) =>
                div(
                  {
                    style: () => {
                      const isUser = chatMessages.val[i]?.role === "user";
                      return (
                        "margin-bottom:12px;padding:8px 12px;border-radius:8px;max-width:85%;" +
                        (isUser
                          ? "margin-left:auto;background:var(--primary-light);color:var(--primary-text);"
                          : "margin-right:auto;background:var(--bg-primary);border:1px solid var(--border-color);")
                      );
                    },
                  },
                  div(
                    {
                      style:
                        "font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted);",
                    },
                    msg.role === "user" ? "你" : "AI 助手",
                  ),
                  div(
                    {
                      style:
                        "white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;",
                    },
                    msg.content ||
                      (chatStreaming.val && i === chatMessages.val.length - 1
                        ? div(
                            { style: "color:var(--text-muted);" },
                            "思考中...",
                          )
                        : ""),
                  ),
                ),
              ),
            ),
    ),
    // Status bar
    () =>
      chatContextCount.val > 0
        ? div(
            {
              style:
                "font-size:12px;color:var(--text-muted);margin-bottom:8px;",
            },
            `已检索 ${chatContextCount.val} 条相关备忘录作为上下文`,
          )
        : "",
    // Input area
    () =>
      form(
        {
          onsubmit: handleSubmit,
          style: "display:flex;gap:8px;align-items:flex-end;",
        },
        textarea({
          class: "form-input",
          placeholder: "输入消息探索你的笔记...",
          disabled: chatStreaming.val,
          oninput: (e: InputEvent) =>
            (chatInput.val = (e.target as HTMLTextAreaElement).value),
          onkeydown: handleKeydown,
          value: chatInput.val,
          rows: 2,
          style:
            "flex:1;resize:none;min-height:44px;padding:8px;border-radius:8px;border:1px solid var(--border-color);font-size:14px;background:var(--bg-primary);color:var(--text-primary);",
        }),
        button(
          {
            class: () =>
              "btn btn-sm " +
              (chatStreaming.val ? "btn-outline" : "btn-primary"),
            disabled: () => chatStreaming.val || !chatInput.val.trim(),
            type: "submit",
            style: "flex-shrink:0;",
          },
          () => (chatStreaming.val ? "..." : "发送"),
        ),
      ),
    // Action buttons
    div(
      { style: "margin-top:12px;display:flex;gap:8px;" },
      button(
        {
          class: "btn btn-sm",
          disabled: () => chatMessages.val.length === 0,
          onclick: saveChatAsCreative,
          style: "font-size:12px;",
        },
        "保存对话",
      ),
      button(
        {
          class: "btn btn-sm btn-outline",
          disabled: () => chatMessages.val.length === 0,
          onclick: newChat,
          style: "font-size:12px;",
        },
        "新对话",
      ),
      // Prompt launcher (Task 5): show available prompts as quick-start chips
      () =>
        prompts.val.length > 0
          ? div(
              {
                style: "display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;",
              },
              prompts.val.slice(0, 5).map((p) =>
                button(
                  {
                    class: "tag-btn",
                    style: "font-size:11px;padding:2px 8px;",
                    title: p.content,
                    onclick: () => {
                      chatMessages.val = [
                        ...chatMessages.val,
                        {
                          role: "user",
                          content: `使用提示词「${p.title}」：\n${p.content}`,
                        },
                      ];
                      // Auto-scroll and focus
                      setTimeout(() => sendChatMessage(), 100);
                    },
                  },
                  p.title,
                ),
              ),
            )
          : "",
    ),
  );
}

// ====== CreativeTab ======

export function CreativeTab() {
  // Load data on first render
  if (prompts.val.length === 0) {
    loadPrompts();
  }

  return div(
    // Sub-tab bar
    div(
      {
        style:
          "display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border-color);",
      },
      button(
        {
          class: () =>
            "tab-btn " + (creativeView.val === "list" ? "active" : ""),
          style: () =>
            "padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid " +
            (creativeView.val === "list"
              ? "var(--primary-color)"
              : "transparent") +
            ";color:" +
            (creativeView.val === "list"
              ? "var(--primary-color)"
              : "var(--text-muted)") +
            ";margin-bottom:-2px;",
          onclick: () => {
            creativeView.val = "list";
          },
        },
        "列表视图",
      ),
      button(
        {
          class: () =>
            "tab-btn " + (creativeView.val === "chat" ? "active" : ""),
          style: () =>
            "padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid " +
            (creativeView.val === "chat"
              ? "var(--primary-color)"
              : "transparent") +
            ";color:" +
            (creativeView.val === "chat"
              ? "var(--primary-color)"
              : "var(--text-muted)") +
            ";margin-bottom:-2px;",
          onclick: () => {
            creativeView.val = "chat";
          },
        },
        "对话模式",
      ),
    ),
    () =>
      creativeView.val === "chat"
        ? ChatPanel()
        : div(
            // Tag cloud (list view only)
            () => (prompts.val.length > 0 ? TagCloud() : ""),
            // Generate button (below tag cloud)
            div(
              { style: "margin-bottom:16px;" },
              button(
                {
                  class: "btn btn-primary btn-sm",
                  disabled: () => selectedPromptId.val === null,
                  onclick: () => (generateModalOpen.val = true),
                  title:
                    selectedPromptId.val === null
                      ? "请先选择提示词"
                      : "生成创意内容",
                },
                "生成",
              ),
            ),
            // Generate modal
            () => (generateModalOpen.val ? GenerateModal() : ""),
            // Prompt form modal
            () => (promptFormMode.val.type !== "closed" ? PromptForm() : ""),
            // Creative content list
            () => {
              if (prompts.val.length === 0) {
                return div(
                  { class: "empty-state" },
                  "还没有提示词，创建一个开始吧！",
                );
              }
              if (creativeLoading.val) {
                return div({ class: "status-msg" }, "加载中...");
              }
              if (creativeItems.val.length === 0) {
                return div(
                  { class: "empty-state" },
                  "还没有创意内容。请在上方选择提示词并点击生成。",
                );
              }
              return div(creativeItems.val.map(CreativeCard));
            },
            // Read more modal
            () => (readMoreItem.val ? ReadMoreModal() : ""),
          ),
  );
}
