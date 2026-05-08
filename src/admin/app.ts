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
  | {
      type: "edit";
      id: number;
      content: string;
      isPublic: boolean;
      tag: string;
    };

interface State {
  authenticated: boolean | null; // null = checking
  memos: Memo[];
  formMode: FormMode;
  formContent: string;
  formIsPublic: boolean;
  formTag: string;
  formError: string | null;
  formSaving: boolean;
  deleteConfirmId: number | null;
  deleteDeleting: boolean;
  globalError: string | null;
  loading: boolean;
}

let state: State = {
  authenticated: null,
  memos: [],
  formMode: { type: "closed" },
  formContent: "",
  formIsPublic: true,
  formTag: "",
  formError: null,
  formSaving: false,
  deleteConfirmId: null,
  deleteDeleting: false,
  globalError: null,
  loading: false,
};

const appEl = document.getElementById("app")!;

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

function setState(patch: Partial<State>): void {
  Object.assign(state, patch);
  render();
}

async function checkAuth(): Promise<void> {
  try {
    const data = await api<{ authenticated: boolean }>("/api/auth/check");
    setState({ authenticated: data.authenticated });
    if (data.authenticated) {
      await loadMemos();
    }
  } catch {
    setState({ authenticated: false });
  }
}

async function login(key: string): Promise<void> {
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    setState({ authenticated: true, globalError: null });
    await loadMemos();
  } catch (err) {
    setState({ globalError: (err as Error).message });
  }
}

async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  setState({
    authenticated: false,
    memos: [],
    formMode: { type: "closed" },
    deleteConfirmId: null,
  });
}

async function loadMemos(): Promise<void> {
  setState({ loading: true });
  try {
    const data = await api<{ memos: Memo[] }>("/api/memos?all=true");
    setState({ memos: data.memos, loading: false, globalError: null });
  } catch (err) {
    setState({ loading: false, globalError: (err as Error).message });
  }
}

async function createMemo(): Promise<void> {
  if (!state.formContent.trim()) {
    setState({ formError: "Content is required" });
    return;
  }
  setState({ formSaving: true, formError: null });
  try {
    await api("/api/memos", {
      method: "POST",
      body: JSON.stringify({
        content: state.formContent.trim(),
        is_public: state.formIsPublic,
        tag: state.formTag.trim(),
      }),
    });
    setState({
      formMode: { type: "closed" },
      formContent: "",
      formIsPublic: true,
      formTag: "",
      formSaving: false,
    });
    await loadMemos();
  } catch (err) {
    setState({ formSaving: false, formError: (err as Error).message });
  }
}

async function updateMemo(id: number): Promise<void> {
  if (!state.formContent.trim()) {
    setState({ formError: "Content is required" });
    return;
  }
  setState({ formSaving: true, formError: null });
  try {
    await api(`/api/memos/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        content: state.formContent.trim(),
        is_public: state.formIsPublic,
        tag: state.formTag.trim(),
      }),
    });
    setState({
      formMode: { type: "closed" },
      formContent: "",
      formIsPublic: true,
      formTag: "",
      formSaving: false,
    });
    await loadMemos();
  } catch (err) {
    setState({ formSaving: false, formError: (err as Error).message });
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
    setState({ globalError: (err as Error).message });
  }
}

async function deleteMemo(id: number): Promise<void> {
  setState({ deleteDeleting: true });
  try {
    await api(`/api/memos/${id}`, { method: "DELETE" });
    setState({ deleteConfirmId: null, deleteDeleting: false });
    await loadMemos();
  } catch (err) {
    setState({ deleteDeleting: false, globalError: (err as Error).message });
  }
}

function openCreateForm(): void {
  setState({
    formMode: { type: "create" },
    formContent: "",
    formIsPublic: true,
    formTag: "",
    formError: null,
  });
}

function openEditForm(memo: Memo): void {
  setState({
    formMode: {
      type: "edit",
      id: memo.id,
      content: memo.content,
      isPublic: memo.is_public,
      tag: memo.tag,
    },
    formContent: memo.content,
    formIsPublic: memo.is_public,
    formTag: memo.tag,
    formError: null,
  });
}

function closeForm(): void {
  setState({
    formMode: { type: "closed" },
    formContent: "",
    formIsPublic: true,
    formTag: "",
    formError: null,
  });
}

// ====== Render ======

function h(
  tag: string,
  attrs: Record<string, string> = {},
  children: string = "",
): string {
  let attrStr = "";
  for (const [k, v] of Object.entries(attrs)) {
    attrStr += ` ${k}="${v.replace(/"/g, "&quot;")}"`;
  }
  return `<${tag}${attrStr}>${children}</${tag}>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d: string): string {
  try {
    const date = new Date(d + "Z");
    return date.toLocaleDateString("en-US", {
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

function renderLogin(): string {
  const errorHtml = state.globalError
    ? `<div class="error">${escape(state.globalError)}</div>`
    : "";

  return `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Memos Admin</h1>
        <div class="sub">Enter your secret key to continue</div>
        <input type="password" id="login-key" placeholder="Secret key" autofocus
          onkeydown="if(event.key==='Enter')document.getElementById('login-btn').click()" />
        <button id="login-btn" onclick="window._adminLogin()">Sign In</button>
        ${errorHtml}
      </div>
    </div>`;
}

function renderForm(): string {
  if (state.formMode.type === "closed") return "";

  const isEdit = state.formMode.type === "edit";
  const title = isEdit ? "Edit Memo" : "New Memo";
  const saveLabel = state.formSaving ? "Saving..." : "Save";
  const disabled = state.formSaving ? "disabled" : "";
  const errorHtml = state.formError
    ? `<div class="form-error">${escape(state.formError)}</div>`
    : "";

  return `
    <div class="form-card">
      <h2>${title}</h2>
      <textarea id="form-content" placeholder="What's on your mind?"
        ${disabled}>${escape(state.formContent)}</textarea>
      <input type="text" id="form-tag" placeholder="Tag (optional)"
        value="${escape(state.formTag)}" ${disabled} />
      <div class="form-row">
        <label class="form-check">
          <input type="checkbox" id="form-is-public"
            ${state.formIsPublic ? "checked" : ""} ${disabled} />
          Public
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-outline btn-sm" onclick="window._adminCloseForm()">Cancel</button>
        <button class="btn btn-primary btn-sm" id="form-save-btn"
          onclick="window._adminSaveForm()" ${disabled}>${saveLabel}</button>
      </div>
      ${errorHtml}
    </div>`;
}

function renderMemoCard(memo: Memo): string {
  const badgeClass = memo.is_public ? "badge-public" : "badge-private";
  const badgeText = memo.is_public ? "Public" : "Private";
  const toggleLabel = memo.is_public ? "Make Private" : "Make Public";

  let extraHtml = "";
  if (state.deleteConfirmId === memo.id) {
    const delDisabled = state.deleteDeleting ? "disabled" : "";
    extraHtml = `
      <div class="delete-confirm">
        <span>Are you sure you want to delete this memo?</span>
        <button class="btn btn-danger btn-sm" onclick="window._adminConfirmDelete(${memo.id})"
          ${delDisabled}>Yes, delete</button>
        <button class="btn btn-outline btn-sm"
          onclick="window._adminCancelDelete()">Cancel</button>
      </div>`;
  }

  return `
    <div class="memo-card">
      <div class="memo-content">${escape(memo.content)}</div>
      <div class="memo-meta">
        <span class="badge ${badgeClass}">${badgeText}</span>
        ${memo.tag ? `<span class="badge badge-tag">${escape(memo.tag)}</span>` : ""}
        <span>Created: ${formatDate(memo.created_at)}</span>
        ${memo.updated_at !== memo.created_at ? `<span>Updated: ${formatDate(memo.updated_at)}</span>` : ""}
      </div>
      <div class="memo-actions">
        <button class="btn btn-outline btn-sm"
          onclick="window._adminToggle(${memo.id})">${toggleLabel}</button>
        <button class="btn btn-outline btn-sm"
          onclick="window._adminEdit(${memo.id})">Edit</button>
        <button class="btn btn-danger btn-sm"
          onclick="window._adminRequestDelete(${memo.id})">Delete</button>
      </div>
      ${extraHtml}
    </div>`;
}

function renderAdmin(): string {
  const formHtml = renderForm();
  const globalErrorHtml = state.globalError
    ? `<div class="error-banner">${escape(state.globalError)}<button class="btn btn-sm btn-outline" style="margin-left:8px" onclick="window._adminDismissError()">Dismiss</button></div>`
    : "";

  let contentHtml = "";
  if (state.loading) {
    contentHtml = `<div class="status-msg">Loading memos...</div>`;
  } else if (state.memos.length === 0 && state.formMode.type === "closed") {
    contentHtml = `<div class="empty-state">No memos yet. Create your first memo!</div>`;
  } else {
    contentHtml = state.memos.map(renderMemoCard).join("");
  }

  return `
    <div class="admin-topbar">
      <span class="title">Memos Admin</span>
      <div class="actions">
        <button class="btn btn-primary btn-sm"
          onclick="window._adminOpenCreate()">+ New Memo</button>
        <a href="/" class="btn btn-outline btn-sm">View Site</a>
        <button class="btn btn-outline btn-sm"
          onclick="window._adminLogout()">Logout</button>
      </div>
    </div>
    <div class="admin-container">
      ${globalErrorHtml}
      ${formHtml}
      ${contentHtml}
    </div>`;
}

function render(): void {
  if (state.authenticated === null) {
    appEl.innerHTML = `<div class="status-msg" style="padding:60px">Checking...</div>`;
    return;
  }

  if (!state.authenticated) {
    appEl.innerHTML = renderLogin();
    return;
  }

  appEl.innerHTML = renderAdmin();
}

// ====== Global event handlers ======

// These are called from onclick attributes in the HTML
Object.assign(window, {
  _adminLogin() {
    const input = document.getElementById("login-key") as HTMLInputElement;
    login(input.value);
  },
  _adminLogout() {
    logout();
  },
  _adminOpenCreate() {
    openCreateForm();
  },
  _adminCloseForm() {
    closeForm();
  },
  _adminSaveForm() {
    const textarea = document.getElementById(
      "form-content",
    ) as HTMLTextAreaElement;
    const checkbox = document.getElementById(
      "form-is-public",
    ) as HTMLInputElement;
    const tagInput = document.getElementById("form-tag") as HTMLInputElement;
    state.formContent = textarea.value;
    state.formIsPublic = checkbox.checked;
    state.formTag = tagInput.value;

    if (state.formMode.type === "create") {
      createMemo();
    } else if (state.formMode.type === "edit") {
      updateMemo(state.formMode.id);
    }
  },
  _adminEdit(id: number) {
    const memo = state.memos.find((m) => m.id === id);
    if (memo) openEditForm(memo);
  },
  _adminToggle(id: number) {
    const memo = state.memos.find((m) => m.id === id);
    if (memo) toggleVisibility(memo);
  },
  _adminRequestDelete(id: number) {
    setState({ deleteConfirmId: id });
  },
  _adminCancelDelete() {
    setState({ deleteConfirmId: null });
  },
  _adminConfirmDelete(id: number) {
    deleteMemo(id);
  },
  _adminDismissError() {
    setState({ globalError: null });
  },
});

// ====== Init ======
checkAuth();
