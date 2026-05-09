import van from "vanjs-core";

interface Memo {
  id: number;
  content: string;
  tag: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

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

// ====== Actions ======
async function checkAuth(): Promise<void> {
  try {
    const data = await api<{ authenticated: boolean }>("/api/auth/check");
    authenticated.val = data.authenticated;
    if (data.authenticated) await loadMemos();
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeForm(): void {
  formMode.val = { type: "closed" };
  formContent.val = "";
  formIsPublic.val = true;
  formTag.val = "";
  formError.val = null;
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
      oninput: (e: Event) =>
        (formContent.val = (e.target as HTMLTextAreaElement).value),
    }),
    input({
      type: "text",
      id: "form-tag",
      placeholder: "Tag (optional)",
      value: formTag,
      disabled: () => formSaving.val,
      oninput: (e: Event) =>
        (formTag.val = (e.target as HTMLInputElement).value),
    }),
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
          button(
            { class: "btn btn-primary btn-sm", onclick: openCreateForm },
            "+ New Memo",
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
