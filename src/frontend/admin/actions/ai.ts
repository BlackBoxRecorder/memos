import { api } from "../../../helper/util";
import type { Memo } from "../../../model";
import {
  getSelectedAiModel,
  selectedProvider,
  selectedModel,
} from "../ai-state";
import {
  aiAvailable,
  aiModels,
  aiModelsOpen,
  aiSuggestedTags,
  aiSuggestingTags,
  tagSuggestAbort,
  aiPanelMemoId,
  aiPanelLoading,
  aiPanelResult,
  aiPanelError,
  aiPanelAction,
  aiMenuPos,
  formAiMenuOpen,
  formAiMenuPos,
  formAiLoading,
  formContent,
  formError,
  formSaving,
} from "../state";
import { loadMemos } from "./memo";

// ====== localStorage helpers ======

const LS_KEY = "memos-ai-model";

/** Persists AI model selection to localStorage. Key: "memos-ai-model". */
export function saveModelSelection(provider: string, model: string): void {
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

// ====== AI Status & Models ======

export async function checkAiStatus(): Promise<void> {
  try {
    const data = await api<{ optimize: boolean }>("api/ai/status");
    aiAvailable.val = data.optimize || false;
  } catch {
    aiAvailable.val = false;
  }
}

export async function loadAiModels(): Promise<void> {
  try {
    const data = await api<{
      providers: Array<{ id: string; name: string; models: string[] }>;
      default: { provider: string; model: string };
    }>("api/ai/models");
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

// ====== Tag Suggestions ======

export async function suggestTagsForContent(): Promise<void> {
  if (tagSuggestAbort.current) tagSuggestAbort.current.abort();
  tagSuggestAbort.current = new AbortController();

  const content = formContent.val.trim();
  if (!content) {
    aiSuggestedTags.val = [];
    return;
  }

  aiSuggestingTags.val = true;
  try {
    const data = await api<{ tags: string[] }>("api/ai/suggest-tags", {
      method: "POST",
      body: JSON.stringify({
        content,
        provider: selectedProvider.val,
        model: selectedModel.val,
      }),
      signal: tagSuggestAbort.current.signal,
    });
    aiSuggestedTags.val = data.tags || [];
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      aiSuggestedTags.val = [];
    }
  } finally {
    tagSuggestAbort.current = null;
    aiSuggestingTags.val = false;
  }
}

// ====== AI Toolbox (Card) ======

export async function executeAiAction(
  memoId: number,
  content: string,
  action: string,
  style?: string,
): Promise<void> {
  aiPanelMemoId.val = memoId;
  aiPanelAction.val = action;
  aiPanelLoading.val = true;
  aiPanelResult.val = null;
  aiPanelError.val = null;

  try {
    const body: Record<string, unknown> = { content, action };
    if (style) body.style = style;
    const data = await api<{ result: string }>("api/ai/action", {
      method: "POST",
      body: JSON.stringify(body),
    });
    aiPanelResult.val = data.result;
  } catch (err) {
    aiPanelError.val = (err as Error).message;
  } finally {
    aiPanelLoading.val = false;
  }
}

export function closeAiPanel(): void {
  aiPanelMemoId.val = null;
  aiPanelResult.val = null;
  aiPanelError.val = null;
  aiPanelAction.val = "";
}

// ====== AI Menu Positioning ======

const ESTIMATED_MENU_H = 230;
const ESTIMATED_MENU_W = 140;

export function openAiMenu(buttonEl: HTMLElement): void {
  const rect = buttonEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceRight = window.innerWidth - rect.right;

  aiMenuPos.val = {
    top:
      spaceBelow >= ESTIMATED_MENU_H
        ? rect.bottom + 4
        : rect.top - ESTIMATED_MENU_H - 4,
    left:
      spaceRight >= ESTIMATED_MENU_W
        ? rect.left
        : rect.right - ESTIMATED_MENU_W,
  };
}

export function closeAiMenu(): void {
  aiMenuPos.val = null;
  aiPanelAction.val = "";
}

export function openFormAiMenu(buttonEl: HTMLElement): void {
  const rect = buttonEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceRight = window.innerWidth - rect.right;

  formAiMenuPos.val = {
    top:
      spaceBelow >= ESTIMATED_MENU_H
        ? rect.bottom + 4
        : rect.top - ESTIMATED_MENU_H - 4,
    left:
      spaceRight >= ESTIMATED_MENU_W
        ? rect.left
        : rect.right - ESTIMATED_MENU_W,
  };
}

export function closeFormAiMenu(): void {
  formAiMenuPos.val = null;
}

export async function replaceMemoWithResult(memoId: number): Promise<void> {
  const result = aiPanelResult.val;
  if (!result) return;
  try {
    await api(`api/memos/${memoId}`, {
      method: "PUT",
      body: JSON.stringify({ content: result }),
    });
    closeAiPanel();
    await loadMemos();
  } catch (err) {
    aiPanelError.val = (err as Error).message;
  }
}

export async function newMemoFromResult(
  sourceMemo: Pick<Memo, "id" | "is_public" | "tags">,
): Promise<void> {
  const result = aiPanelResult.val;
  if (!result) return;
  const actionLabel = aiPanelAction.val;
  try {
    const sourceTag = `#${sourceMemo.id}-${actionLabel}`;
    const tags = [...sourceMemo.tags, sourceTag];
    await api("api/memos", {
      method: "POST",
      body: JSON.stringify({
        content: result,
        is_public: sourceMemo.is_public,
        tags,
      }),
    });
    closeAiPanel();
    await loadMemos();
  } catch (err) {
    aiPanelError.val = (err as Error).message;
  }
}

// ====== Form AI Toolbox ======

export async function executeFormAiAction(
  action: string,
  style?: string,
): Promise<void> {
  const content = formContent.val.trim();
  if (!content) return;
  formAiLoading.val = true;
  formAiMenuOpen.val = false;
  try {
    const body: Record<string, unknown> = { content, action };
    if (style) body.style = style;
    const data = await api<{ result: string }>("api/ai/action", {
      method: "POST",
      body: JSON.stringify(body),
    });
    formContent.val = data.result;
  } catch (err) {
    formError.val = (err as Error).message;
  } finally {
    formAiLoading.val = false;
  }
}
