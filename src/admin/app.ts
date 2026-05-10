import van from "vanjs-core";
import { CreativeTab, openPromptCreate } from "./creative";
import { api, formatDate } from "../util";
import type { Memo } from "../model";

type FormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

const { div, span, button, input, textarea, a, h1, h2, label } = van.tags;

// ====== State ======
const authenticated = van.state<boolean | null>(null);
const memos = van.state<Memo[]>([]);
const formMode = van.state<FormMode>({ type: "closed" });
const formContent = van.state("");
const formIsPublic = van.state(true);
const formTag = van.state("");
const formError = van.state<string | null>(null);
const formSaving = van.state(false);
const deleteConfirmId = van.state<number | null>(null);
const deleteDeleting = van.state(false);
const globalError = van.state<string | null>(null);
const loading = van.state(false);
const activeTab = van.state<"memos" | "creative">("memos");
const aiAvailable = van.state(false);
const aiOptimizing = van.state(false);
const aiSuggestedTags = van.state<string[]>([]);
const aiSuggestingTags = van.state(false);
let suggestTimer: ReturnType<typeof setTimeout> | null = null;

// ====== API ======

// ====== Actions ======
async function checkAuth(): Promise<void> {
  try {
    const data = await api<{ authenticated: boolean }>("/api/auth/check");
    authenticated.val = data.authenticated;
    if (data.authenticated) {
      await loadMemos();
      checkAiStatus();
    }
  } catch {
    authenticated.val = false;
  }
}

async function login(key: string): Promise<void> {
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    authenticated.val = true;
    globalError.val = null;
    await loadMemos();
    checkAiStatus();
  } catch (err) {
    globalError.val = (err as Error).message;
  }
}

async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  authenticated.val = false;
  memos.val = [];
  formMode.val = { type: "closed" };
  deleteConfirmId.val = null;
}

async function loadMemos(): Promise<void> {
  loading.val = true;
  try {
    const data = await api<{ memos: Memo[] }>("/api/memos?all=true");
    memos.val = data.memos;
    globalError.val = null;
  } catch (err) {
    globalError.val = (err as Error).message;
  } finally {
    loading.val = false;
  }
}

async function saveForm(): Promise<void> {
  if (!formContent.val.trim()) {
    formError.val = "Content is required";
    return;
  }
  formSaving.val = true;
  formError.val = null;
  try {
    const body = JSON.stringify({
      content: formContent.val.trim(),
      is_public: formIsPublic.val,
      tag: formTag.val.trim(),
    });
    if (formMode.val.type === "create") {
      await api("/api/memos", { method: "POST", body });
    } else if (formMode.val.type === "edit") {
      await api(`/api/memos/${formMode.val.id}`, { method: "PUT", body });
    }
    closeForm();
    await loadMemos();
  } catch (err) {
    formError.val = (err as Error).message;
  } finally {
    formSaving.val = false;
  }
}

async function toggleVisibility(memo: Memo): Promise<void> {
  try {
    await api(`/api/memos/${memo.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_public: !memo.is_public }),
    });
    await loadMemos();
  } catch (err) {
    globalError.val = (err as Error).message;
  }
}

async function deleteMemo(id: number): Promise<void> {
  deleteDeleting.val = true;
  try {
    await api(`/api/memos/${id}`, { method: "DELETE" });
    deleteConfirmId.val = null;
    await loadMemos();
  } catch (err) {
    globalError.val = (err as Error).message;
  } finally {
    deleteDeleting.val = false;
  }
}

// ====== AI Actions ======

async function checkAiStatus(): Promise<void> {
  try {
    const data = await api<{ optimize: boolean }>("/api/ai/status");
    aiAvailable.val = data.optimize || false;
  } catch {
    aiAvailable.val = false;
  }
}

async function handleOptimize(): Promise<void> {
  const content = formContent.val.trim();
  if (!content || aiOptimizing.val) return;

  aiOptimizing.val = true;
  formError.val = null;
  try {
    const data = await api<{ content: string }>("/api/ai/optimize", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    formContent.val = data.content;
  } catch (err) {
    formError.val = (err as Error).message;
  } finally {
    aiOptimizing.val = false;
  }
}

async function suggestTagsForContent(): Promise<void> {
  const content = formContent.val.trim();
  if (content.length < 20) {
    aiSuggestedTags.val = [];
    return;
  }

  aiSuggestingTags.val = true;
  try {
    const data = await api<{ tags: string[] }>("/api/ai/suggest-tags", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    aiSuggestedTags.val = data.tags || [];
  } catch {
    aiSuggestedTags.val = [];
  } finally {
    aiSuggestingTags.val = false;
  }
}

function debouncedSuggestTags(): void {
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => {
    suggestTagsForContent();
  }, 1000);
}

function openCreateForm(): void {
  formMode.val = { type: "create" };
  formContent.val = "";
  formIsPublic.val = true;
  formTag.val = "";
  formError.val = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openEditForm(memo: Memo): void {
  formMode.val = { type: "edit", id: memo.id };
  formContent.val = memo.content;
  formIsPublic.val = memo.is_public;
  formTag.val = memo.tag;
  formError.val = null;
  aiSuggestedTags.val = [];
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeForm(): void {
  formMode.val = { type: "closed" };
  formContent.val = "";
  formIsPublic.val = true;
  formTag.val = "";
  formError.val = null;
  aiSuggestedTags.val = [];
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = null;
}

// ====== SVG Helpers ======

function htmlNode(str: string): HTMLElement {
  const el = document.createElement("span");
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.innerHTML = str;
  return el;
}

function svgSparkle(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"/></svg>`,
  );
}

function svgSpinner(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  );
}

// ====== Helpers ======

// ====== Components ======

function LoginPage() {
  const keyInput = input({
    type: "password",
    id: "login-key",
    placeholder: "Secret key",
    autofocus: true,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === "Enter") login((keyInput as HTMLInputElement).value);
    },
  });
  return div(
    { class: "login-wrap" },
    div(
      { class: "login-card" },
      h1("Memos Admin"),
      div({ class: "sub" }, "Enter your secret key to continue"),
      keyInput,
      button(
        {
          id: "login-btn",
          onclick: () => login((keyInput as HTMLInputElement).value),
        },
        "Sign In",
      ),
      () => (globalError.val ? div({ class: "error" }, globalError.val) : ""),
    ),
  );
}

function FormCard() {
  const isEdit = formMode.val.type === "edit";
  const title = isEdit ? "Edit Memo" : "New Memo";
  return div(
    { class: "form-card" },
    h2(title),
    textarea({
      id: "form-content",
      placeholder: "What's on your mind?",
      disabled: () => formSaving.val,
      value: formContent,
      oninput: (e: Event) => {
        formContent.val = (e.target as HTMLTextAreaElement).value;
        // Debounced tag suggestion
        if (aiAvailable.val) debouncedSuggestTags();
      },
    }),
    // AI Optimize toolbar (between textarea and tag input)
    () =>
      aiAvailable.val
        ? div(
            { class: "ai-toolbar" },
            button(
              {
                class: () =>
                  "ai-optimize-btn" + (aiOptimizing.val ? " loading" : ""),
                disabled: () => aiOptimizing.val || formSaving.val,
                onclick: handleOptimize,
                title: "AI optimize content",
              },
              aiOptimizing.val ? svgSpinner() : svgSparkle(),
            ),
          )
        : "",
    input({
      type: "text",
      id: "form-tag",
      placeholder: "Tag (optional)",
      value: formTag,
      disabled: () => formSaving.val,
      oninput: (e: Event) =>
        (formTag.val = (e.target as HTMLInputElement).value),
    }),
    // AI Tag suggestions (below tag input)
    () =>
      aiSuggestedTags.val.length > 0
        ? div(
            { class: "ai-tag-suggestions" },
            ...aiSuggestedTags.val.map((tag) =>
              button(
                {
                  class: "tag-chip",
                  onclick: () => (formTag.val = tag),
                },
                tag,
              ),
            ),
          )
        : "",
    div(
      { class: "form-row" },
      label(
        { class: "form-check" },
        input({
          type: "checkbox",
          id: "form-is-public",
          checked: formIsPublic,
          disabled: () => formSaving.val,
          oninput: (e: Event) =>
            (formIsPublic.val = (e.target as HTMLInputElement).checked),
        }),
        "Public",
      ),
      div({ style: "flex:1" }),
      button({ class: "btn btn-outline btn-sm", onclick: closeForm }, "Cancel"),
      button(
        {
          class: "btn btn-primary btn-sm",
          id: "form-save-btn",
          onclick: saveForm,
          disabled: () => formSaving.val,
        },
        () => (formSaving.val ? "Saving..." : "Save"),
      ),
    ),
    () => (formError.val ? div({ class: "form-error" }, formError.val) : ""),
  );
}

function DeleteConfirm(id: number) {
  return div(
    { class: "delete-confirm" },
    span("Are you sure you want to delete this memo?"),
    button(
      {
        class: "btn btn-danger btn-sm",
        disabled: () => deleteDeleting.val,
        onclick: () => deleteMemo(id),
      },
      "Yes, delete",
    ),
    button(
      {
        class: "btn btn-outline btn-sm",
        onclick: () => (deleteConfirmId.val = null),
      },
      "Cancel",
    ),
  );
}

function MemoCard(memo: Memo) {
  const badgeClass = memo.is_public ? "badge-public" : "badge-private";
  const badgeText = memo.is_public ? "Public" : "Private";
  const toggleLabel = memo.is_public ? "Make Private" : "Make Public";

  return div(
    { class: "memo-card" },
    div({ class: "memo-content" }, memo.content),
    div(
      { class: "memo-meta" },
      span({ class: "memo-id" }, `#${memo.id}`),
      span({ class: `badge ${badgeClass}` }, badgeText),
      memo.tag ? span({ class: "badge badge-tag" }, memo.tag) : "",
      span(`Created: ${formatDate(memo.created_at)}`),
      memo.updated_at !== memo.created_at
        ? span(`Updated: ${formatDate(memo.updated_at)}`)
        : "",
    ),
    div(
      { class: "memo-actions" },
      button(
        {
          class: "btn btn-outline btn-sm",
          onclick: () => toggleVisibility(memo),
        },
        toggleLabel,
      ),
      button(
        { class: "btn btn-outline btn-sm", onclick: () => openEditForm(memo) },
        "Edit",
      ),
      button(
        {
          class: "btn btn-danger btn-sm",
          onclick: () => (deleteConfirmId.val = memo.id),
        },
        "Delete",
      ),
    ),
    () => (deleteConfirmId.val === memo.id ? DeleteConfirm(memo.id) : ""),
  );
}

function AdminPage() {
  return div(
    div(
      { class: "admin-topbar" },
      div(
        { class: "admin-topbar-inner" },
        span({ class: "title" }, "Memos Admin"),
        div(
          { class: "actions" },
          () =>
            activeTab.val === "memos"
              ? button(
                  { class: "btn btn-primary btn-sm", onclick: openCreateForm },
                  "+ New Memo",
                )
              : button(
                  {
                    class: "btn btn-primary btn-sm",
                    onclick: openPromptCreate,
                  },
                  "+ New Prompt",
                ),
          a({ href: "/", class: "btn btn-outline btn-sm" }, "View Site"),
          button(
            { class: "btn btn-outline btn-sm", onclick: logout },
            "Logout",
          ),
        ),
      ),
    ),
    div(
      { class: "admin-container" },
      // Tab bar
      div(
        { class: "tab-bar" },
        button(
          {
            class: () => "tab" + (activeTab.val === "memos" ? " active" : ""),
            onclick: () => (activeTab.val = "memos"),
          },
          "Memos",
        ),
        button(
          {
            class: () =>
              "tab" + (activeTab.val === "creative" ? " active" : ""),
            onclick: () => (activeTab.val = "creative"),
          },
          "Creative",
        ),
      ),
      // Global error banner
      () =>
        globalError.val
          ? div(
              { class: "error-banner" },
              globalError.val,
              button(
                {
                  class: "btn btn-sm btn-outline",
                  style: "margin-left:8px",
                  onclick: () => (globalError.val = null),
                },
                "Dismiss",
              ),
            )
          : "",
      // Tab content
      () =>
        activeTab.val === "memos"
          ? div(
              () => (formMode.val.type !== "closed" ? FormCard() : ""),
              () => {
                if (loading.val)
                  return div({ class: "status-msg" }, "Loading memos...");
                if (memos.val.length === 0 && formMode.val.type === "closed")
                  return div(
                    { class: "empty-state" },
                    "No memos yet. Create your first memo!",
                  );
                return div(memos.val.map(MemoCard));
              },
            )
          : CreativeTab(),
    ),
  );
}

// ====== Mount ======
const appEl = document.getElementById("app")!;
van.add(appEl, () =>
  authenticated.val === null
    ? div({ class: "status-msg", style: "padding:60px" }, "Checking...")
    : !authenticated.val
      ? LoginPage()
      : AdminPage(),
);

// ====== Init ======
checkAuth();
