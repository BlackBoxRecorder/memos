import van from "vanjs-core";
import type { Memo, CreativeItem, Prompt } from "../../model";

// ====== Shared Types ======

export type FormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

export type PromptFormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export type PreviewMemo = Pick<Memo, "id" | "content" | "tags" | "created_at">;

export interface MonthGroup {
  month: number;
  name: string;
  count: number;
  firstMemoId: number;
}

export interface YearGroup {
  year: number;
  months: MonthGroup[];
}

// ====== Auth & Global State ======

export const authenticated = van.state<boolean | null>(null);
export const globalError = van.state<string | null>(null);
export const loading = van.state(false);
export const activeTab = van.state<"memos" | "creative">("memos");

// ====== Memo List State ======

export const memos = van.state<Memo[]>([]);
export const readMoreText = van.state<string | null>(null);
export const deleteConfirmId = van.state<number | null>(null);
export const deleteDeleting = van.state(false);

// ====== Memo Form State ======

export const formMode = van.state<FormMode>({ type: "closed" });
export const formContent = van.state("");
export const formIsPublic = van.state(false);
export const formTags = van.state<string[]>([]);
export const formTagInput = van.state("");
export const formError = van.state<string | null>(null);
export const formSaving = van.state(false);

// ====== AI Common State ======

export const aiAvailable = van.state(false);
export const aiModels = van.state<
  Array<{ id: string; name: string; models: string[] }>
>([]);
export const aiModelsOpen = van.state(false);

// ====== AI Tag Suggestions ======

export const aiSuggestedTags = van.state<string[]>([]);
export const aiSuggestingTags = van.state(false);
export const tagSuggestAbort: { current: AbortController | null } = {
  current: null,
};

// ====== AI Toolbox (Card) State ======

export const aiPanelMemoId = van.state<number | null>(null);
export const aiPanelLoading = van.state(false);
export const aiPanelResult = van.state<string | null>(null);
export const aiPanelError = van.state<string | null>(null);
export const aiPanelAction = van.state("");
export const aiPanelStyle = van.state<
  "professional" | "casual" | "minimal" | "academic"
>("professional");

// ====== Form AI Toolbox State ======

export const formAiMenuOpen = van.state(false);
export const formAiLoading = van.state(false);
export const formAiPendingAction = van.state("");

// ====== Import/Export State ======

export const importExportOpen = van.state(false);
export const importExportTab = van.state<"export" | "import">("export");
export const exportLoading = van.state(false);
export const importLoading = van.state(false);
export const importResult = van.state<string | null>(null);
export const importError = van.state<string | null>(null);
export const dragOver = van.state(false);
export const fileInputRef: { current: HTMLInputElement | null } = {
  current: null,
};

// ====== Memo Timeline State ======

export const selectedMonth = van.state<string | null>(null);
export const collapsedYears = van.state<Set<number>>(new Set());
export const timelineCache: { memos: Memo[] | null; data: YearGroup[] | null } =
  { memos: null, data: null };

// ====== Creative General State ======

export const creativeItems = van.state<CreativeItem[]>([]);
export const prompts = van.state<Prompt[]>([]);
export const creativeLoading = van.state(false);
export const creativeDeleteId = van.state<number | null>(null);
export const creativeDeleting = van.state(false);
export const readMoreItem = van.state<CreativeItem | null>(null);

// ====== Creative Prompt Form State ======

export const promptFormMode = van.state<PromptFormMode>({ type: "closed" });
export const promptFormTitle = van.state("");
export const promptFormContent = van.state("");
export const promptFormError = van.state<string | null>(null);
export const promptFormSaving = van.state(false);

// ====== Creative Generation State ======

export const selectedPromptId = van.state<number | null>(null);
export const generateModalOpen = van.state(false);
export const extraPromptInput = van.state("");
export const generationMode = van.state<"auto" | "manual" | "tag">("auto");
export const manualMemoIds = van.state("");
export const generateTagFilter = van.state("");
export const generating = van.state(false);
export const generateError = van.state<string | null>(null);

// ====== Creative Streaming State ======

export const streamContent = van.state("");
export const streamDone = van.state(false);
export const streamAbort: { current: AbortController | null } = {
  current: null,
};

// ====== Creative Timeline State ======

export const selectedCreativeMonth = van.state<string | null>(null);
export const collapsedCreativeYears = van.state<Set<number>>(new Set());
export const creativeTimelineCache: {
  items: CreativeItem[] | null;
  data: YearGroup[] | null;
} = { items: null, data: null };

// ====== Chat State ======

export const creativeView = van.state<"list" | "chat">("list");
export const chatMessages = van.state<ChatMsg[]>([]);
export const chatInput = van.state("");
export const chatStreaming = van.state(false);
export const chatContextCount = van.state(0);
export const chatTagFilter = van.state("");
export const chatAbort: { current: AbortController | null } = { current: null };

// ====== Tags State ======

export const availableTags = van.state<string[]>([]);

// ====== Context Preview State ======

export const previewOpen = van.state(false);
export const previewMemos = van.state<PreviewMemo[]>([]);
export const previewLoading = van.state(false);
export const previewError = van.state<string | null>(null);
export const previewFetched = van.state(false);
