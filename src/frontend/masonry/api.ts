import { apiUrl } from "../../helper/util";
import {
  renderMarkdown,
  stripHtmlTags,
  hasMarkdown,
} from "../../helper/markdown";
import {
  search,
  tag,
  page,
  hasMore,
  loading,
  loadingMore,
  error,
  cards,
  tags,
  memoCount,
  similarMemoId,
  similarMemos,
  similarLoading,
  similarError,
  getOrPrepare,
  truncateText,
  font,
  type Card,
  type SimilarMemo,
} from "./state";

export async function loadTags(): Promise<void> {
  try {
    const resp = await fetch(apiUrl("api/memos/tags"));
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { tags: string[] } = await resp.json();
    tags.val = data.tags;
  } catch (err) {
    console.error("Failed to load tags:", err);
  }
}

export async function loadCount(): Promise<void> {
  try {
    const resp = await fetch(apiUrl("api/memos/count"));
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { count: number } = await resp.json();
    memoCount.val = data.count;
  } catch (err) {
    console.error("Failed to load count:", err);
  }
}

export async function fetchAndRender(pageNum: number = 0): Promise<void> {
  const currentSearch = search.val.trim();
  const currentTag = tag.val;

  if (pageNum === 0) {
    loading.val = true;
    error.val = null;
    cards.val = [];
  }
  loadingMore.val = true;

  try {
    const params = new URLSearchParams();
    if (currentSearch) params.set("search", currentSearch);
    if (currentTag) params.set("tag", currentTag);
    params.set("page", String(pageNum));
    params.set("limit", "50");
    const url = apiUrl(`api/memos?${params.toString()}`);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: {
      memos: {
        id: number;
        content: string;
        updated_at: string;
        pinned_at: string | null;
      }[];
      hasMore: boolean;
    } = await resp.json();

    loading.val = false;
    hasMore.val = data.hasMore;
    page.val = pageNum;
    error.val = null;

    if (data.memos.length === 0 && pageNum === 0) {
      return;
    }

    const newCards: Card[] = data.memos.map((m) => {
      const plainText = hasMarkdown(m.content)
        ? stripHtmlTags(renderMarkdown(m.content))
        : m.content;
      return {
        id: m.id,
        text: plainText,
        rawText: m.content,
        updatedAt: m.updated_at,
        pinnedAt: m.pinned_at || null,
        prepared: getOrPrepare(truncateText(plainText).displayText, font),
      };
    });

    if (pageNum === 0) {
      cards.val = newCards;
    } else {
      cards.val = [...cards.val, ...newCards];
    }

    // Update URL for bookmarkability (only on first page)
    if (pageNum === 0) {
      const urlParams = new URLSearchParams();
      if (currentSearch) urlParams.set("search", currentSearch);
      if (currentTag) urlParams.set("tag", currentTag);
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      history.replaceState(null, "", newUrl);
    }
  } catch (err) {
    console.error("Failed to load memos:", err);
    loading.val = false;
    if (pageNum === 0) {
      error.val = (err as Error).message || "Failed to load memos.";
    }
  } finally {
    loadingMore.val = false;
  }
}

// --- debounced search ---
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSearch(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchAndRender(0);
  }, 1000);
}

// --- similar modal ---
export async function openSimilarModal(memoId: number): Promise<void> {
  similarMemoId.val = memoId;
  similarMemos.val = [];
  similarLoading.val = true;
  similarError.val = null;
  document.body.style.overflow = "hidden";

  try {
    const resp = await fetch(apiUrl(`api/memos/${memoId}/similar`));
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { memos: SimilarMemo[] } = await resp.json();
    similarMemos.val = data.memos.filter((m) => m.id !== memoId);
  } catch (err) {
    similarError.val =
      err instanceof Error ? err.message : "Failed to load similar memos";
  } finally {
    similarLoading.val = false;
  }
}
