import van from "vanjs-core";
import { api, formatDate, truncate } from "../util";
import { getSelectedAiModel } from "./ai-state";
import type { Prompt, CreativeItem, Memo } from "../model";

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

function resetPreview(): void {
  previewFetched.val = false;
  previewMemos.val = [];
  previewError.val = null;
}

function parseManualIds(): number[] {
  return manualMemoIds.val
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

// ====== API ======

// ====== Actions ======
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

export function openPromptCreate(): void {
  promptFormMode.val = { type: "create" };
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

function openPromptEdit(prompt: Prompt): void {
  promptFormMode.val = { type: "edit", id: prompt.id };
  promptFormTitle.val = prompt.title;
  promptFormContent.val = prompt.content;
  promptFormError.val = null;
}

function closePromptForm(): void {
  promptFormMode.val = { type: "closed" };
  promptFormTitle.val = "";
  promptFormContent.val = "";
  promptFormError.val = null;
}

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

async function selectPrompt(id: number): Promise<void> {
  selectedPromptId.val = id;
  await loadCreativeItems(id);
}

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
        div({ class: "prompt-label" }, "Title"),
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

function PreviewPanel() {
  return div(
    {
      style: "margin:10px 0;padding:10px;background:#f5f5f5;border-radius:6px;",
    },
    div(
      {
        style:
          "cursor:pointer;display:flex;align-items:center;gap:6px;font-size:13px;color:#555;",
        onclick: () => (previewOpen.val = !previewOpen.val),
      },
      () => (previewOpen.val ? "\u25BC" : "\u25B6"),
      "Context preview",
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
    () => (previewOpen.val ? renderPreviewBody() : ""),
  );
}

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
    { style: "margin-top:8px;display:flex;flex-direction:column;gap:6px;" },
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

function GenerateModal() {
  const selectedPrompt = prompts.val.find((p) => p.id === selectedPromptId.val);
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
      { class: "modal modal-flex" },
      h3("Generate Creative Content"),
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
          extraPromptInput.val = (e.target as HTMLTextAreaElement).value;
          resetPreview();
        },
      }),
      // Context mode toggle
      div(
        { class: "context-mode-toggle" },
        span(
          { style: "font-size:13px;color:#666;margin-right:8px;" },
          "Context:",
        ),
        button(
          {
            class: () =>
              "mode-btn" + (generationMode.val === "auto" ? " active" : ""),
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
              "mode-btn" + (generationMode.val === "manual" ? " active" : ""),
            disabled: () => generating.val,
            onclick: () => {
              generationMode.val = "manual";
              resetPreview();
            },
          },
          "Manual Select",
        ),
      ),
      // Manual memo ID input (shown only in manual mode)
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
                  manualMemoIds.val = (e.target as HTMLInputElement).value;
                  resetPreview();
                },
              }),
              div(
                {
                  style: "font-size:11px;color:#999;margin-top:4px;",
                },
                "Enter memo IDs separated by commas. Find IDs on the Memos tab (#number).",
              ),
            )
          : "",
      // Context preview panel
      PreviewPanel(),
      div(
        { class: "modal-actions" },
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
          () =>
            generating.val
              ? "Generating..."
              : streamDone.val
                ? "Done"
                : "Generate",
        ),
      ),
      () =>
        generateError.val
          ? div({ class: "form-error" }, generateError.val)
          : "",
      // Streaming output area
      () => {
        if (!streamContent.val && !generating.val) return "";
        const done = streamDone.val;
        const active = generating.val;
        return div(
          {
            class: "hide-scrollbar",
            style:
              "margin-top:14px;padding:12px;background:#f8f9fb;" +
              "border-radius:6px;border:1px solid #e5e5e5;" +
              "flex:1;min-height:0;overflow-y:auto;",
          },
          div(
            {
              style: "font-size:13px;color:#888;margin-bottom:6px;",
            },
            done ? "Generated content:" : "Generating...",
          ),
          div(
            {
              id: "stream-output",
              style:
                "font-size:14px;line-height:22px;white-space:pre-wrap;" +
                "word-break:break-word;color:#333;",
            },
            streamContent,
            () =>
              active
                ? span(
                    {
                      style: "animation:blink 0.8s infinite;color:#3b82f6;",
                    },
                    "\u258B",
                  )
                : "",
          ),
          done
            ? button(
                {
                  class: "btn btn-outline btn-sm",
                  style: "margin-top:10px;",
                  onclick: closeGenerateModal,
                },
                "Close",
              )
            : "",
        );
      },
    ),
  );
}

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
    ),
    div({ class: "memo-actions" }, () =>
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
        : button(
            {
              class: "btn btn-danger btn-sm",
              onclick: () => (creativeDeleteId.val = item.id),
            },
            "Delete",
          ),
    ),
  );
}

// ====== Main Creative Tab Component ======

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
