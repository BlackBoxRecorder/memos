import van from "vanjs-core";
import { api, formatDate, truncate } from "../helper/util";
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

// Context preview state
type PreviewMemo = Pick<Memo, "id" | "content" | "tag" | "created_at">;
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
    const data = await api<{ prompts: Prompt[] }>("/api/creative/prompts");
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
    const data = await api<{ items: CreativeItem[] }>(`/api/creative${query}`);
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
    promptFormError.val = "Title is required";
    return;
  }
  if (!promptFormContent.val.trim()) {
    promptFormError.val = "Content is required";
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
      await api("/api/creative/prompts", { method: "POST", body });
    } else if (promptFormMode.val.type === "edit") {
      await api(`/api/creative/prompts/${promptFormMode.val.id}`, {
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
    await api(`/api/creative/prompts/${id}`, { method: "DELETE" });
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
    previewError.val = "Please select a prompt first";
    previewFetched.val = false;
    previewMemos.val = [];
    return;
  }
  if (!extraPromptInput.val.trim()) {
    previewError.val = "Please enter additional instructions first";
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
      previewError.val =
        "Invalid memo IDs. Please enter valid numeric IDs separated by commas.";
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
      "/api/creative/preview-context",
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
    generateError.val = "Please enter additional instructions";
    return;
  }
  if (selectedPromptId.val === null) {
    generateError.val = "Please select a prompt first";
    return;
  }
  if (generationMode.val === "manual" && !manualMemoIds.val.trim()) {
    generateError.val = "Please enter memo IDs (comma-separated)";
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
      generateError.val =
        "Invalid memo IDs. Please enter valid numeric IDs separated by commas.";
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
    const resp = await fetch("/api/creative/generate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: streamAbort.signal,
    });

    if (!resp.ok) {
      const err = await resp
        .json()
        .catch(() => ({ error: `Request failed (${resp.status})` }));
      throw new Error(err.error || "Request failed");
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
    await api(`/api/creative/${id}`, { method: "DELETE" });
    creativeDeleteId.val = null;
    await loadCreativeItems(selectedPromptId.val ?? undefined);
  } catch {
    // silently fail
  } finally {
    creativeDeleting.val = false;
  }
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
          placeholder: "Prompt title",
          value: promptFormTitle,
          disabled: () => promptFormSaving.val,
          oninput: (e: Event) =>
            (promptFormTitle.val = (e.target as HTMLInputElement).value),
        }),
        textarea({
          placeholder: "Prompt content (instructions for AI)",
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
            "Cancel",
          ),
          button(
            {
              class: "btn btn-primary btn-sm",
              disabled: () => promptFormSaving.val,
              onclick: savePromptForm,
            },
            () => (promptFormSaving.val ? "Saving..." : "Save"),
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
              title: "Edit",
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
              title: "Delete",
              onclick: (e: Event) => {
                e.stopPropagation();
                if (confirm(`Delete prompt "${prompt.title}"?`)) {
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
      "Context Preview",
      () => {
        const hasData = previewFetched.val && !previewError.val;
        const memoCount = previewMemos.val.length;
        return hasData
          ? span(
              {
                class:
                  "context-preview-count" + (memoCount === 0 ? " empty" : ""),
              },
              memoCount === 0
                ? "No results"
                : memoCount + " memo" + (memoCount !== 1 ? "s" : ""),
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
              ? "Loading..."
              : previewFetched.val
                ? "Refresh"
                : "Preview",
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
      "Loading context...",
    );
  }
  if (!previewFetched.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      'Click "Preview" to see which memos will be used as context.',
    );
  }
  if (previewMemos.val.length === 0) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "No related memos found.",
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
          m.tag ? span({ class: "badge badge-tag" }, m.tag) : "",
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
                  ? " \u00B7 IDs: " + manualMemoIds.val
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
                    "Selected prompt: ",
                    span(
                      { style: "font-weight:500;color:#333" },
                      selectedPrompt.title,
                    ),
                  )
                : "",
            textarea({
              placeholder: "Additional instructions for AI generation...",
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
                "Context:",
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
                "Auto Search",
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
                "Manual Select",
              ),
            ),
            // Manual memo ID input
            () =>
              generationMode.val === "manual"
                ? div(
                    { style: "margin-top:8px;" },
                    input({
                      type: "text",
                      placeholder: "Memo IDs (e.g. 1,3,5)",
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
                      "Enter memo IDs separated by commas. Find IDs on the Memos tab (#number).",
                    ),
                  )
                : "",
          ),
          // Context preview section
          div(
            { class: "modal-section" },
            div({ class: "modal-section-title" }, "Context Preview"),
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
                    done ? "Generated content:" : "Generating...",
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
                  () => (streamDone.val ? "Close" : "Cancel"),
                ),
              )
            : div(
                { class: "modal-actions", style: "margin-top:0;" },
                button(
                  {
                    class: "btn btn-outline btn-sm",
                    onclick: closeGenerateModal,
                  },
                  "Cancel",
                ),
                button(
                  {
                    class: "btn btn-primary btn-sm",
                    disabled: () => generating.val || streamDone.val,
                    onclick: handleGenerate,
                  },
                  "Generate",
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
          "Close",
        ),
      ),
      div({ class: "read-more-content" }, item.content),
      item.extra_prompt
        ? div(
            { style: "margin-top:12px;font-size:12px;color:#999;" },
            "Extra prompt: ",
            item.extra_prompt,
          )
        : "",
      div(
        { style: "margin-top:4px;font-size:12px;color:#999;" },
        "Generated: ",
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
            " Read more",
          )
        : "",
    ),
    div(
      { class: "creative-meta" },
      prompt ? span({ class: "badge badge-tag" }, prompt.title) : "",
      item.extra_prompt
        ? span({ class: "badge" }, "Extra: " + truncate(item.extra_prompt, 40))
        : "",
      span(formatDate(item.created_at)),
      span(
        { class: "creative-meta-icons" },
        button(
          {
            class: "creative-icon-btn delete",
            title: "Delete",
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
            span("Delete this creative item?"),
            button(
              {
                class: "btn btn-danger btn-sm",
                disabled: () => creativeDeleting.val,
                onclick: () => deleteCreativeItem(item.id),
              },
              "Yes, delete",
            ),
            button(
              {
                class: "btn btn-outline btn-sm",
                onclick: () => (creativeDeleteId.val = null),
              },
              "Cancel",
            ),
          )
        : "",
  );
}

// ====== Main Creative Tab Component ======

/** Root component of the Creative tab: tag cloud, generate button, modals, and conditional content list. */
export function CreativeTab() {
  // Load data on first render
  if (prompts.val.length === 0) {
    loadPrompts();
  }

  return div(
    // Tag cloud
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
              ? "Select a prompt first"
              : "Generate creative content",
        },
        "Generate",
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
          "No prompts yet. Create a prompt to get started!",
        );
      }
      if (creativeLoading.val) {
        return div({ class: "status-msg" }, "Loading...");
      }
      if (creativeItems.val.length === 0) {
        return div(
          { class: "empty-state" },
          "No creative content yet. Select a prompt above and click Generate.",
        );
      }
      return div(creativeItems.val.map(CreativeCard));
    },
    // Read more modal
    () => (readMoreItem.val ? ReadMoreModal() : ""),
  );
}
