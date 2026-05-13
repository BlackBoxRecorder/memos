import van from "vanjs-core";
import { CreativeTab, openPromptCreate, creativeItems } from "./creative";
import { selectedProvider, selectedModel } from "./ai-state";
import { api, formatDate, truncate, countWords } from "../util";
import type { Memo, CreativeItem } from "../model";

type FormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

const { div, span, button, input, textarea, a, h1, h2, h3, label } = van.tags;

// ====== State ======
const authenticated = van.state<boolean | null>(null);
const memos = van.state<Memo[]>([]);
const formMode = van.state<FormMode>({ type: "closed" });
const formContent = van.state("");
const formIsPublic = van.state(false);
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
let tagSuggestAbort: AbortController | null = null;
const readMoreText = van.state<string | null>(null);

// Timeline state
const selectedMonth = van.state<string | null>(null);
const collapsedYears = van.state<Set<number>>(new Set());
let cachedTimelineMemos: Memo[] | null = null;
let cachedTimelineData: YearGroup[] | null = null;

// Creative timeline state
const selectedCreativeMonth = van.state<string | null>(null);
const collapsedCreativeYears = van.state<Set<number>>(new Set());
let cachedTimelineCreative: CreativeItem[] | null = null;
let cachedTimelineCreativeData: YearGroup[] | null = null;

// AI model selector state
const aiModelsOpen = van.state(false);
const aiModels = van.state<
  Array<{ id: string; name: string; models: string[] }>
>([]);

// --- localStorage helpers for model selection ---
const LS_KEY = "memos-ai-model";

function saveModelSelection(provider: string, model: string): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ provider, model }));
  } catch {
    // localStorage unavailable
  }
}

function loadModelSelection(): { provider: string; model: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.provider === "string" &&
      typeof parsed.model === "string"
    ) {
      return { provider: parsed.provider, model: parsed.model };
    }
  } catch {
    // corrupted or unavailable
  }
  return null;
}

// ====== API ======

// ====== Actions ======
async function checkAuth(): Promise<void> {
  try {
    const data = await api<{ authenticated: boolean }>("/api/auth/check");
    authenticated.val = data.authenticated;
    if (data.authenticated) {
      await loadMemos();
      checkAiStatus();
      loadAiModels();
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
    loadAiModels();
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

async function loadAiModels(): Promise<void> {
  try {
    const data = await api<{
      providers: Array<{ id: string; name: string; models: string[] }>;
      default: { provider: string; model: string };
    }>("/api/ai/models");
    aiModels.val = data.providers;

    // Try to restore saved selection
    const saved = loadModelSelection();
    if (saved) {
      const prov = data.providers.find((p) => p.id === saved.provider);
      if (prov && prov.models.includes(saved.model)) {
        selectedProvider.val = saved.provider;
        selectedModel.val = saved.model;
        return;
      }
    }

    // Fall back to default
    if (data.default.provider && data.default.model) {
      selectedProvider.val = data.default.provider;
      selectedModel.val = data.default.model;
    } else if (data.providers.length > 0) {
      const first = data.providers[0];
      if (first) {
        selectedProvider.val = first.id;
        selectedModel.val = first.models[0] || "";
      }
    }
  } catch {
    aiModels.val = [];
  }
}

async function handleOptimize(): Promise<void> {
  const content = formContent.val.trim();
  if (!content || aiOptimizing.val) return;

  if (content.length < 10) {
    formError.val = "Content too short to optimize (minimum 10 characters)";
    return;
  }
  if (content.length > 2000) {
    if (
      !confirm(
        "Content is very long (>2000 chars). Optimization may take longer. Continue?",
      )
    ) {
      return;
    }
  }

  aiOptimizing.val = true;
  formError.val = null;
  try {
    const data = await api<{ content: string }>("/api/ai/optimize", {
      method: "POST",
      body: JSON.stringify({
        content,
        provider: selectedProvider.val,
        model: selectedModel.val,
      }),
    });
    formContent.val = data.content;
  } catch (err) {
    formError.val = (err as Error).message;
  } finally {
    aiOptimizing.val = false;
  }
}

async function suggestTagsForContent(): Promise<void> {
  // 取消前一个未完成的请求
  if (tagSuggestAbort) tagSuggestAbort.abort();
  tagSuggestAbort = new AbortController();

  const content = formContent.val.trim();
  if (!content) {
    aiSuggestedTags.val = [];
    return;
  }

  aiSuggestingTags.val = true;
  try {
    const data = await api<{ tags: string[] }>("/api/ai/suggest-tags", {
      method: "POST",
      body: JSON.stringify({
        content,
        provider: selectedProvider.val,
        model: selectedModel.val,
      }),
      signal: tagSuggestAbort.signal,
    });
    aiSuggestedTags.val = data.tags || [];
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      aiSuggestedTags.val = [];
    }
  } finally {
    tagSuggestAbort = null;
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
  document.body.style.overflow = "hidden";
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
  document.body.style.overflow = "hidden";
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
  document.body.style.overflow = "";
}

// ====== Read More Modal ======

function openReadMore(text: string): void {
  readMoreText.val = text;
  document.body.style.overflow = "hidden";
}

function closeReadMore(): void {
  readMoreText.val = null;
  document.body.style.overflow = "";
}

// ====== Timeline Helpers ======

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthGroup {
  month: number;
  name: string;
  count: number;
  firstMemoId: number;
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
}

function computeTimelineData(
  items: Array<{ id: number; created_at: string }>,
): YearGroup[] {
  const yearMap = new Map<
    number,
    Map<number, { count: number; firstMemoId: number }>
  >();

  for (const item of items) {
    const date = new Date(item.created_at + "Z");
    const year = date.getFullYear();
    const month = date.getMonth();

    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;

    if (!monthMap.has(month)) {
      monthMap.set(month, { count: 1, firstMemoId: item.id });
    } else {
      monthMap.get(month)!.count++;
    }
  }

  const result: YearGroup[] = [];
  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a);

  for (const year of sortedYears) {
    const monthMap = yearMap.get(year)!;
    const months: MonthGroup[] = [...monthMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([m, data]) => ({
        month: m,
        name: MONTH_NAMES[m] ?? String(m + 1),
        count: data.count,
        firstMemoId: data.firstMemoId,
      }));
    result.push({ year, months });
  }

  return result;
}

function scrollToMonth(memoId: number): void {
  const el = document.querySelector(`[data-memo-id="${memoId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function scrollToCreativeItem(itemId: number): void {
  const el = document.querySelector(`[data-creative-id="${itemId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function toggleCreativeYear(year: number): void {
  const current = new Set(collapsedCreativeYears.val);
  if (current.has(year)) {
    current.delete(year);
  } else {
    current.add(year);
  }
  collapsedCreativeYears.val = current;
}

function toggleYear(year: number): void {
  const current = new Set(collapsedYears.val);
  if (current.has(year)) {
    current.delete(year);
  } else {
    current.add(year);
  }
  collapsedYears.val = current;
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

function svgChevronDown(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>`,
  );
}

function svgLock(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  );
}

function svgUnlock(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  );
}

function svgEdit(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  );
}

function svgTrash(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  );
}

function svgPlus(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  );
}

function svgExternalLink(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  );
}

function svgLogout(): HTMLElement {
  return htmlNode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  );
}

// ====== Helpers ======

// ====== Components ======

function ModelSelector() {
  return div(
    {
      class: () => "model-select" + (aiModelsOpen.val ? " open" : ""),
      tabindex: "0",
      onblur: (e: FocusEvent) => {
        // Close on blur if the new focus target is not inside this element
        const tgt = e.relatedTarget as HTMLElement | null;
        const el = e.currentTarget as HTMLElement;
        if (!tgt || !el.contains(tgt)) {
          aiModelsOpen.val = false;
        }
      },
    },
    div(
      {
        class: "model-select-trigger",
        onclick: () => (aiModelsOpen.val = !aiModelsOpen.val),
      },
      span({ class: "model-select-label" }, () => {
        const prov = aiModels.val.find((p) => p.id === selectedProvider.val);
        const name = prov ? `${prov.name}/${selectedModel.val}` : "No models";
        return name;
      }),
      span(
        {
          class: () => "model-select-arrow" + (aiModelsOpen.val ? " open" : ""),
        },
        svgChevronDown(),
      ),
    ),
    div(
      { class: "model-select-dropdown" },
      aiModels.val.flatMap((prov) => [
        div({ class: "model-select-group" }, prov.name),
        ...prov.models.map((m) =>
          div(
            {
              class: () =>
                "model-select-option" +
                (selectedProvider.val === prov.id && selectedModel.val === m
                  ? " active"
                  : ""),
              onclick: () => {
                selectedProvider.val = prov.id;
                selectedModel.val = m;
                saveModelSelection(prov.id, m);
                aiModelsOpen.val = false;
              },
            },
            m,
          ),
        ),
      ]),
    ),
  );
}

function TimelineSidebar() {
  const { aside } = van.tags;
  return aside({ class: "timeline-sidebar" }, () => {
    const currentMemos = memos.val;
    if (cachedTimelineMemos !== currentMemos) {
      cachedTimelineData = computeTimelineData(currentMemos);
      cachedTimelineMemos = currentMemos;
    }
    const groups = cachedTimelineData || [];
    if (groups.length === 0) return div();
    return div(
      ...groups.map((group) => {
        const isCollapsed = collapsedYears.val.has(group.year);
        return div(
          div(
            {
              class: "timeline-year",
              onclick: () => toggleYear(group.year),
            },
            span(String(group.year)),
            span({ class: "arrow" }, isCollapsed ? "\u25B8" : "\u25BE"),
          ),
          isCollapsed
            ? ""
            : div(
                { class: "timeline-months" },
                ...group.months.map((m) => {
                  const key = `${group.year}-${String(m.month + 1).padStart(2, "0")}`;
                  return div(
                    {
                      class: () =>
                        "timeline-month" +
                        (selectedMonth.val === key ? " active" : ""),
                      onclick: () => {
                        selectedMonth.val = key;
                        scrollToMonth(m.firstMemoId);
                      },
                    },
                    span(m.name),
                    span({ class: "count" }, String(m.count)),
                  );
                }),
              ),
        );
      }),
    );
  });
}

function CreativeTimelineSidebar() {
  const { aside } = van.tags;
  return aside({ class: "timeline-sidebar" }, () => {
    const currentItems = creativeItems.val;
    if (cachedTimelineCreative !== currentItems) {
      cachedTimelineCreativeData = computeTimelineData(currentItems);
      cachedTimelineCreative = currentItems;
    }
    const groups = cachedTimelineCreativeData || [];
    if (groups.length === 0) return div();
    return div(
      ...groups.map((group) => {
        const isCollapsed = collapsedCreativeYears.val.has(group.year);
        return div(
          div(
            {
              class: "timeline-year",
              onclick: () => toggleCreativeYear(group.year),
            },
            span(String(group.year)),
            span({ class: "arrow" }, isCollapsed ? "\u25B8" : "\u25BE"),
          ),
          isCollapsed
            ? ""
            : div(
                { class: "timeline-months" },
                ...group.months.map((m) => {
                  const key = `${group.year}-${String(m.month + 1).padStart(2, "0")}`;
                  return div(
                    {
                      class: () =>
                        "timeline-month" +
                        (selectedCreativeMonth.val === key ? " active" : ""),
                      onclick: () => {
                        selectedCreativeMonth.val = key;
                        scrollToCreativeItem(m.firstMemoId);
                      },
                    },
                    span(m.name),
                    span({ class: "count" }, String(m.count)),
                  );
                }),
              ),
        );
      }),
    );
  });
}

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

function FormModal() {
  const isEdit = () => formMode.val.type === "edit";
  const title = () => (isEdit() ? "Edit Memo" : "New Memo");
  return div(
    {
      class: "modal-overlay",
      style: () =>
        formMode.val.type !== "closed" ? "display:flex" : "display:none",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeForm();
      },
    },
    div(
      { class: "modal modal-wide" },
      h3(title),
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
        button(
          { class: "btn btn-outline btn-sm", onclick: closeForm },
          "Cancel",
        ),
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
    ),
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

  return div(
    { class: "memo-card", "data-memo-id": String(memo.id) },
    div({ class: "memo-content" }, truncate(memo.content, 200), () =>
      memo.content.length > 200
        ? button(
            {
              class: "read-more-btn",
              onclick: () => openReadMore(memo.content),
            },
            "Read more",
          )
        : "",
    ),
    div(
      { class: "memo-meta" },
      span({ class: "memo-id" }, `#${memo.id}`),
      span({ class: `badge ${badgeClass}` }, badgeText),
      memo.tag ? span({ class: "badge badge-tag" }, memo.tag) : "",
      span(`Created: ${formatDate(memo.created_at)}`),
      memo.updated_at !== memo.created_at
        ? span(`Updated: ${formatDate(memo.updated_at)}`)
        : "",
      span(
        { class: "memo-meta-icons" },
        button(
          {
            class: "memo-icon-btn",
            title: memo.is_public ? "Make Private" : "Make Public",
            onclick: () => toggleVisibility(memo),
          },
          memo.is_public ? svgUnlock() : svgLock(),
        ),
        button(
          {
            class: "memo-icon-btn",
            title: "Edit",
            onclick: () => openEditForm(memo),
          },
          svgEdit(),
        ),
        button(
          {
            class: "memo-icon-btn delete",
            title: "Delete",
            onclick: () => (deleteConfirmId.val = memo.id),
          },
          svgTrash(),
        ),
      ),
    ),
    () => (deleteConfirmId.val === memo.id ? DeleteConfirm(memo.id) : ""),
  );
}

function ReadMoreModal() {
  return div(
    {
      class: "modal-overlay",
      style: () => (readMoreText.val != null ? "display:flex" : "display:none"),
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeReadMore();
      },
    },
    div(
      { class: "modal" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
        },
        h3({ style: "margin:0" }, "Memo"),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: closeReadMore,
          },
          "\u2715",
        ),
      ),
      div({ class: "read-more-content" }, () => readMoreText.val || ""),
    ),
  );
}

function AdminPage() {
  return div(
    div(
      { class: "admin-topbar" },
      div(
        { class: "admin-topbar-inner" },
        div(
          { class: "topbar-left" },
          span({ class: "title" }, "Memos Admin"),
          () => {
            const total = memos.val.length;
            const totalWords = memos.val.reduce(
              (sum, m) => sum + countWords(m.content),
              0,
            );
            return span(
              { class: "admin-stats" },
              `${total} memos · ${totalWords.toLocaleString()} words`,
            );
          },
        ),
        div(
          { class: "actions" },
          () => (aiModels.val.length > 0 ? ModelSelector() : ""),
          () =>
            activeTab.val === "memos"
              ? button(
                  {
                    class: "btn btn-primary btn-sm",
                    title: "New Memo",
                    onclick: openCreateForm,
                  },
                  svgPlus(),
                )
              : button(
                  {
                    class: "btn btn-primary btn-sm",
                    title: "New Prompt",
                    onclick: openPromptCreate,
                  },
                  svgPlus(),
                ),
          a(
            { href: "/", class: "btn btn-outline btn-sm", title: "View Site" },
            svgExternalLink(),
          ),
          button(
            {
              class: "btn btn-outline btn-sm",
              title: "Logout",
              onclick: logout,
            },
            svgLogout(),
          ),
        ),
      ),
    ),
    div(
      { class: "admin-layout" },
      () => {
        if (activeTab.val === "memos" && memos.val.length > 0) {
          return TimelineSidebar();
        }
        if (activeTab.val === "creative" && creativeItems.val.length > 0) {
          return CreativeTimelineSidebar();
        }
        return "";
      },
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
            ? div(() => {
                if (loading.val)
                  return div({ class: "status-msg" }, "Loading memos...");
                if (memos.val.length === 0 && formMode.val.type === "closed")
                  return div(
                    { class: "empty-state" },
                    "No memos yet. Create your first memo!",
                  );
                return div(memos.val.map(MemoCard));
              })
            : CreativeTab(),
      ),
    ),
    () => (formMode.val.type !== "closed" ? FormModal() : ""),
    () => (readMoreText.val != null ? ReadMoreModal() : ""),
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
