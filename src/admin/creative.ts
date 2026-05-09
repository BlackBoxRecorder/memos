import van from "vanjs-core";

interface Prompt {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface CreativeItem {
  id: number;
  prompt_id: number;
  extra_prompt: string;
  content: string;
  context_memo_ids: string;
  created_at: string;
  updated_at: string;
}

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

const creativeItems = van.state<CreativeItem[]>([]);
const selectedPromptId = van.state<number | null>(null);
const generateModalOpen = van.state(false);
const extraPromptInput = van.state("");
const generating = van.state(false);
const generateError = van.state<string | null>(null);
const readMoreItem = van.state<CreativeItem | null>(null);
const creativeLoading = van.state(false);

// Delete confirm state for creative items
const creativeDeleteId = van.state<number | null>(null);
const creativeDeleting = van.state(false);

// ====== API ======
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await resp.json();
  if (!resp.ok)
    throw new Error(data.error || `Request failed (${resp.status})`);
  return data as T;
}

// ====== Helpers ======
function formatDate(d: string): string {
  try {
    const date = new Date(d + "Z");
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

// ====== Actions ======
export async function loadPrompts(): Promise<void> {
  try {
    const data = await api<{ prompts: Prompt[] }>("/api/creative/prompts");
    // Auto-select first prompt if none selected
    if (selectedPromptId.val === null && data.prompts.length > 0) {
      const first = data.prompts[0]!;
      selectedPromptId.val = first.id;
      prompts.val = data.prompts;

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

async function handleGenerate(): Promise<void> {
  if (!extraPromptInput.val.trim()) {
    generateError.val = "Please enter additional instructions";
    return;
  }
  if (selectedPromptId.val === null) {
    generateError.val = "Please select a prompt first";
    return;
  }
  generating.val = true;
  generateError.val = null;
  try {
    await api("/api/creative/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt_id: selectedPromptId.val,
        extra_prompt: extraPromptInput.val.trim(),
      }),
    });
    generateModalOpen.val = false;
    extraPromptInput.val = "";
    await loadCreativeItems(selectedPromptId.val);
  } catch (err) {
    generateError.val = (err as Error).message;
  } finally {
    generating.val = false;
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

function GenerateModal() {
  const selectedPrompt = prompts.val.find((p) => p.id === selectedPromptId.val);
  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) {
          generateModalOpen.val = false;
          extraPromptInput.val = "";
          generateError.val = null;
        }
      },
    },
    div(
      { class: "modal" },
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
        oninput: (e: Event) =>
          (extraPromptInput.val = (e.target as HTMLTextAreaElement).value),
      }),
      div(
        { class: "modal-actions" },
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: () => {
              generateModalOpen.val = false;
              extraPromptInput.val = "";
              generateError.val = null;
            },
          },
          "Cancel",
        ),
        button(
          {
            class: "btn btn-primary btn-sm",
            disabled: () => generating.val,
            onclick: handleGenerate,
          },
          () => (generating.val ? "Generating..." : "Generate"),
        ),
      ),
      () =>
        generateError.val
          ? div({ class: "form-error" }, generateError.val)
          : "",
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
    { class: "creative-card" },
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
