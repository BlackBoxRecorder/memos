import van from "vanjs-core";
import { prepare, layout, type PreparedText } from "@chenglou/pretext";
import {
  svgSearchIcon,
  svgChevronDown,
  svgEyeIcon,
  svgCopy,
  svgCheck,
} from "../helper/svgHelper";
import { apiUrl } from "../helper/util";
import { renderMarkdown, stripHtmlTags, hasMarkdown } from "../helper/markdown";

// --- config ---
const font = '15px "Helvetica Neue", Helvetica, Arial, sans-serif';
const lineHeight = 22;
const cardPadding = 16;
const gap = 12;
const maxColWidth = 400;
const singleColumnMaxViewportWidth = 520;

// --- types ---
type Card = {
  id: number;
  text: string;
  prepared: PreparedText;
  updatedAt: string;
  pinnedAt: string | null;
};

type PositionedCard = {
  cardIndex: number;
  x: number;
  y: number;
  h: number;
};

type LayoutState = {
  colWidth: number;
  contentHeight: number;
  positionedCards: PositionedCard[];
};

type SimilarMemo = {
  id: number;
  content: string;
  tags: string[];
};

// --- VanJS tags ---
const { div, span, button, input, h1, h3, a } = van.tags;

// --- state ---
const cards = van.state<Card[]>([]);
const search = van.state("");
const tag = van.state("");
const page = van.state(0);
const hasMore = van.state(true);
const loading = van.state(false);
const loadingMore = van.state(false);
const error = van.state<string | null>(null);
const tags = van.state<string[]>([]);
const memoCount = van.state<number | null>(null);
const tagSelectOpen = van.state(false);
const similarMemoId = van.state<number | null>(null);
const similarMemos = van.state<SimilarMemo[]>([]);
const similarLoading = van.state(false);
const similarError = van.state<string | null>(null);
const readMoreText = van.state<string | null>(null);
const copiedCardId = van.state<number | null>(null);
const windowWidth = van.state(0);

// --- prepared text cache ---
const preparedCache = new Map<string, PreparedText>();

function getOrPrepare(text: string, f: string): PreparedText {
  const cached = preparedCache.get(text);
  if (cached) return cached;
  const p = prepare(text, f, { whiteSpace: "pre-wrap" });
  preparedCache.set(text, p);
  return p;
}

// --- utility ---
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateText(
  text: string,
  maxLen: number = 100,
): { displayText: string; isTruncated: boolean } {
  if (text.length <= maxLen) {
    return { displayText: text, isTruncated: false };
  }
  return { displayText: text.slice(0, maxLen) + "...", isTruncated: true };
}

// --- masonry layout ---
function computeLayout(cardsArr: Card[], winWidth: number): LayoutState {
  let colCount: number;
  let colWidth: number;
  if (winWidth <= singleColumnMaxViewportWidth) {
    colCount = 1;
    colWidth = Math.min(maxColWidth, winWidth - gap * 2);
  } else {
    const minColWidth = 100 + winWidth * 0.1;
    colCount = Math.max(2, Math.floor((winWidth + gap) / (minColWidth + gap)));
    colWidth = Math.min(
      maxColWidth,
      (winWidth - (colCount + 1) * gap) / colCount,
    );
  }
  const textWidth = colWidth - cardPadding * 2;
  const contentWidth = colCount * colWidth + (colCount - 1) * gap;
  const offsetLeft = (winWidth - contentWidth) / 2;

  const colHeights = new Float64Array(colCount);
  for (let c = 0; c < colCount; c++) colHeights[c] = gap;

  const positionedCards: PositionedCard[] = [];
  for (let i = 0; i < cardsArr.length; i++) {
    let shortest = 0;
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c]! < colHeights[shortest]!) shortest = c;
    }

    const { height } = layout(cardsArr[i]!.prepared, textWidth, lineHeight);
    const pinBadgeHeight = cardsArr[i]!.pinnedAt ? 18 : 0;
    const buttonAreaHeight = 28;
    const totalH = height + cardPadding * 2 + buttonAreaHeight + pinBadgeHeight;

    positionedCards.push({
      cardIndex: i,
      x: offsetLeft + shortest * (colWidth + gap),
      y: colHeights[shortest]!,
      h: totalH,
    });

    colHeights[shortest]! += totalH + gap;
  }

  let contentHeight = 0;
  for (let c = 0; c < colCount; c++) {
    if (colHeights[c]! > contentHeight) contentHeight = colHeights[c]!;
  }

  return { colWidth, contentHeight, positionedCards };
}

// --- layout cache ---
let _layoutCards: Card[] | null = null;
let _layoutWidth = 0;
let _layoutResult: LayoutState | null = null;

function getLayout(): LayoutState {
  if (
    _layoutCards === cards.val &&
    _layoutWidth === windowWidth.val &&
    _layoutResult
  ) {
    return _layoutResult;
  }
  _layoutResult = computeLayout(cards.val, windowWidth.val);
  _layoutCards = cards.val;
  _layoutWidth = windowWidth.val;
  return _layoutResult;
}

// --- data loading ---
async function loadTags(): Promise<void> {
  try {
    const resp = await fetch(apiUrl("api/memos/tags"));
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { tags: string[] } = await resp.json();
    tags.val = data.tags;
  } catch (err) {
    console.error("Failed to load tags:", err);
  }
}

async function loadCount(): Promise<void> {
  try {
    const resp = await fetch(apiUrl("api/memos/count"));
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { count: number } = await resp.json();
    memoCount.val = data.count;
  } catch (err) {
    console.error("Failed to load count:", err);
  }
}

async function fetchAndRender(pageNum: number = 0): Promise<void> {
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

async function copyToClipboard(card: Card): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(card.text);
    } else {
      // Fallback for older browsers or non-secure contexts
      const textarea = document.createElement("textarea");
      textarea.value = card.text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copiedCardId.val = card.id;
    setTimeout(() => {
      copiedCardId.val = null;
    }, 1500);
  } catch {
    // Silently fail — clipboard may be unavailable
  }
}

// --- debounced search ---
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchAndRender(0);
  }, 1000);
}

// --- similar modal helpers ---
async function openSimilarModal(memoId: number): Promise<void> {
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

function closeSimilarModal(): void {
  similarMemoId.val = null;
  document.body.style.overflow = "";
}

function openReadMore(text: string): void {
  readMoreText.val = text;
  document.body.style.overflow = "hidden";
}

function closeReadMore(): void {
  readMoreText.val = null;
  document.body.style.overflow = "";
}

// --- components ---

function SiteHeader() {
  return div({ id: "site-header" }, h1({ class: "site-title" }, "Memos"), () =>
    memoCount.val != null
      ? span({ class: "memo-count" }, `${memoCount.val} items`)
      : "",
  );
}

function SearchInput() {
  return input({
    id: "search-input",
    type: "search",
    placeholder: "Search memos...",
    value: search.val,
    oninput: (e: Event) => {
      search.val = (e.target as HTMLInputElement).value;
      debouncedSearch();
    },
  });
}

function TagSelect() {
  return div(
    {
      id: "tag-select",
      class: () => "custom-select" + (tagSelectOpen.val ? " open" : ""),
      tabindex: "0",
      onblur: (e: FocusEvent) => {
        const tgt = e.relatedTarget as HTMLElement | null;
        const el = e.currentTarget as HTMLElement;
        if ((!tgt || !el.contains(tgt)) && tagSelectOpen.val) {
          tagSelectOpen.val = false;
        }
      },
    },
    div(
      {
        class: "select-trigger",
        onclick: (e: Event) => {
          e.stopPropagation();
          tagSelectOpen.val = !tagSelectOpen.val;
        },
      },
      span({ class: "select-label" }, () => tag.val || "All tags"),
      span({ class: "select-arrow" }, svgChevronDown()),
    ),
    div({ class: "select-dropdown" }, () =>
      div(
        div(
          {
            class: () => "select-option" + (tag.val === "" ? " selected" : ""),
            "data-value": "",
            onclick: () => {
              tag.val = "";
              tagSelectOpen.val = false;
              fetchAndRender(0);
            },
          },
          "All tags",
        ),
        tags.val.map((t) =>
          div(
            {
              class: () => "select-option" + (tag.val === t ? " selected" : ""),
              "data-value": t,
              onclick: () => {
                tag.val = t;
                tagSelectOpen.val = false;
                fetchAndRender(0);
              },
            },
            t,
          ),
        ),
      ),
    ),
  );
}

function FilterBar() {
  return div(
    { id: "filter-bar" },
    SiteHeader(),
    div({ class: "filter-center" }, SearchInput(), TagSelect()),
    a({ href: "admin/", id: "admin-btn" }, "Admin"),
  );
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return isoStr.slice(0, 10);
  }
}

function MasonryCard(card: Card, index: number, layoutState: LayoutState) {
  const pos = layoutState.positionedCards[index]!;
  const { displayText, isTruncated } = truncateText(card.text);

  return div(
    {
      class: "card",
      "data-memo-id": String(card.id),
      style: `left:${pos.x}px;top:${pos.y}px;width:${layoutState.colWidth}px;height:${pos.h}px`,
    },
    () =>
      card.pinnedAt
        ? div(
            {
              style:
                "font-size:12px;color:#e67e22;padding:0 0 4px 0;display:flex;align-items:center;gap:2px;",
            },
            "📌 已置顶",
          )
        : "",
    div({ class: "card-text" }, escapeHtml(displayText)),
    div(
      { class: "card-info" },
      span({}, `#${card.id}`),
      span({}, formatDate(card.updatedAt)),
    ),
    div(
      { class: "card-btn-group" },
      () =>
        isTruncated
          ? button(
              {
                class: "card-readmore-btn",
                title: "Read more",
                onclick: () => openReadMore(card.text),
              },
              svgEyeIcon(),
            )
          : "",
      button(
        {
          class: "card-similar-btn",
          title: "Find similar memos",
          onclick: (e: Event) => {
            e.stopPropagation();
            openSimilarModal(card.id);
          },
        },
        svgSearchIcon(),
      ),
      button(
        {
          class: () =>
            "card-copy-btn" + (copiedCardId.val === card.id ? " copied" : ""),
          title: "Copy full text",
          onclick: (e: Event) => {
            e.stopPropagation();
            copyToClipboard(card);
          },
        },
        () => (copiedCardId.val === card.id ? svgCheck() : svgCopy()),
      ),
    ),
  );
}

function MasonryContainer() {
  return div(
    {
      style: () => {
        const l = getLayout();
        return `position:relative;height:${l.contentHeight}px`;
      },
    },
    () =>
      div(
        cards.val.map((c, i) => {
          const l = getLayout();
          return MasonryCard(c, i, l);
        }),
      ),
  );
}

function SimilarModal() {
  return div(
    {
      class: "modal-overlay",
      style: () =>
        similarMemoId.val != null ? "display:flex" : "display:none",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeSimilarModal();
      },
    },
    div(
      { class: "modal" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
        },
        h3({ style: "margin:0" }, () => {
          const count = similarMemos.val.length;
          return count > 0 ? `Similar Memos (${count})` : "Similar Memos";
        }),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: closeSimilarModal,
          },
          "\u2715",
        ),
      ),
      div({ class: "similar-modal-body" }, () => {
        if (similarLoading.val)
          return div(
            { class: "similar-status" },
            "Searching for similar memos...",
          );
        if (similarError.val)
          return div(
            { class: "similar-status similar-error" },
            escapeHtml(similarError.val),
          );
        if (similarMemos.val.length === 0 && !similarLoading.val)
          return div({ class: "similar-status" }, "No similar memos found.");
        return div(
          similarMemos.val.map((m) =>
            div(
              { class: "similar-memo-item" },
              div(
                { class: "similar-memo-meta" },
                span({ class: "similar-memo-id" }, `#${m.id}`),
                ...m.tags.map((t) =>
                  span({ class: "similar-memo-tag" }, escapeHtml(t)),
                ),
              ),
              div({ class: "similar-memo-text" }, escapeHtml(m.content)),
            ),
          ),
        );
      }),
    ),
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
      div(
        { class: "readmore-modal-body" },
        div({ class: "readmore-modal-text md-content" }, () =>
          span({ innerHTML: renderMarkdown(readMoreText.val || "") }),
        ),
      ),
    ),
  );
}

function App() {
  // Resize handler
  window.addEventListener("resize", () => {
    windowWidth.val = document.documentElement.clientWidth;
  });

  // Scroll handler (infinite scroll)
  window.addEventListener("scroll", () => {
    if (loadingMore.val || !hasMore.val) return;
    const scrolledNearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 400;
    if (scrolledNearBottom) {
      fetchAndRender(page.val + 1);
    }
  });

  return div(
    FilterBar(),
    () => {
      if (loading.val && cards.val.length === 0)
        return div(
          {
            style:
              "text-align:center;padding:60px 20px;font-size:15px;color:#666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif",
          },
          "Loading...",
        );
      if (error.val && cards.val.length === 0)
        return div(
          {
            style:
              "text-align:center;padding:60px 20px;font-size:15px;color:#c00;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif",
          },
          error.val,
        );
      if (!loading.val && cards.val.length === 0 && !error.val)
        return div(
          {
            style:
              "text-align:center;padding:60px 20px;font-size:15px;color:#666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif",
          },
          "No memos found.",
        );
      return MasonryContainer();
    },
    () => (similarMemoId.val != null ? SimilarModal() : ""),
    () => (readMoreText.val != null ? ReadMoreModal() : ""),
  );
}

// --- initialisation ---
const urlParams = new URLSearchParams(window.location.search);
const initialSearch = urlParams.get("search") || "";
const initialTag = urlParams.get("tag") || "";

search.val = initialSearch;
tag.val = initialTag;

const appEl = document.getElementById("app")!;
const root = App();
van.add(appEl, root);

// Load data
loadTags();
loadCount();
windowWidth.val = document.documentElement.clientWidth;
fetchAndRender(0);
