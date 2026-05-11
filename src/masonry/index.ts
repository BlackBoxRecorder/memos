import { prepare, layout, type PreparedText } from "@chenglou/pretext";

// --- config ---
const font = '15px "Helvetica Neue", Helvetica, Arial, sans-serif';
const lineHeight = 22;
const cardPadding = 16;
const gap = 12;
const maxColWidth = 400;
const singleColumnMaxViewportWidth = 520;

type Card = {
  text: string;
  prepared: PreparedText;
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

type State = {
  cards: Card[];
  currentSearch: string;
  currentTag: string;
};

let st: State = { cards: [], currentSearch: "", currentTag: "" };

// --- pagination state ---
let currentPage = 0;
let hasMore = true;
let loadingMore = false;

type DomCache = {
  container: HTMLDivElement;
  cards: Array<HTMLDivElement | undefined>;
  statusEl: HTMLDivElement | null;
};

const domCache: DomCache = {
  container: document.createElement("div"),
  cards: [],
  statusEl: null,
};

domCache.container.style.position = "relative";
document.body.appendChild(domCache.container);

// --- prepared text cache ---
const preparedCache = new Map<string, PreparedText>();

function getOrPrepare(text: string, f: string): PreparedText {
  const cached = preparedCache.get(text);
  if (cached) return cached;
  const p = prepare(text, f);
  preparedCache.set(text, p);
  return p;
}

// --- status messages ---
function showStatus(message: string, isError = false): void {
  if (!domCache.statusEl) {
    domCache.statusEl = document.createElement("div");
    domCache.statusEl.style.cssText =
      "text-align:center;padding:60px 20px;font-size:15px;color:#666;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";
    document.body.insertBefore(domCache.statusEl, domCache.container);
  }
  domCache.statusEl.style.color = isError ? "#c00" : "#666";
  domCache.statusEl.textContent = message;
}

function hideStatus(): void {
  if (domCache.statusEl) {
    domCache.statusEl.remove();
    domCache.statusEl = null;
  }
}

// --- custom select helpers ---
function getCustomSelectValue(): string {
  const selected = document.querySelector(
    "#tag-select .select-option.selected",
  ) as HTMLElement | null;
  return selected?.dataset.value || "";
}

function setCustomSelectValue(value: string): void {
  const select = document.getElementById("tag-select");
  if (!select) return;

  const options = select.querySelectorAll(".select-option");
  let selectedText = "";
  for (let i = 0; i < options.length; i++) {
    const el = options[i] as HTMLElement;
    const isMatch = el.dataset.value === value;
    el.classList.toggle("selected", isMatch);
    if (isMatch) selectedText = el.textContent || "";
  }

  const triggerLabel = select.querySelector(
    ".select-label",
  ) as HTMLElement | null;
  if (triggerLabel) {
    triggerLabel.textContent = selectedText || value || "All tags";
  }
}

function initCustomSelect(): void {
  const select = document.getElementById("tag-select");
  if (!select) return;

  const trigger = select.querySelector(".select-trigger") as HTMLElement;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = select.classList.contains("open");
    document.querySelectorAll(".custom-select.open").forEach((el) => {
      if (el !== select) el.classList.remove("open");
    });
    select.classList.toggle("open", !isOpen);
  });

  select.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("select-option")) return;

    const value = target.dataset.value || "";
    setCustomSelectValue(value);
    select.classList.remove("open");

    const searchInput = document.getElementById(
      "search-input",
    ) as HTMLInputElement | null;
    fetchAndRender(searchInput?.value.trim() || "", value);
  });

  document.addEventListener("click", () => {
    select.classList.remove("open");
  });
}

// --- masonry layout ---
function computeLayout(windowWidth: number): LayoutState {
  let colCount: number;
  let colWidth: number;
  if (windowWidth <= singleColumnMaxViewportWidth) {
    colCount = 1;
    colWidth = Math.min(maxColWidth, windowWidth - gap * 2);
  } else {
    const minColWidth = 100 + windowWidth * 0.1;
    colCount = Math.max(
      2,
      Math.floor((windowWidth + gap) / (minColWidth + gap)),
    );
    colWidth = Math.min(
      maxColWidth,
      (windowWidth - (colCount + 1) * gap) / colCount,
    );
  }
  const textWidth = colWidth - cardPadding * 2;
  const contentWidth = colCount * colWidth + (colCount - 1) * gap;
  const offsetLeft = (windowWidth - contentWidth) / 2;

  const colHeights = new Float64Array(colCount);
  for (let c = 0; c < colCount; c++) colHeights[c] = gap;

  const positionedCards: PositionedCard[] = [];
  for (let i = 0; i < st.cards.length; i++) {
    let shortest = 0;
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c]! < colHeights[shortest]!) shortest = c;
    }

    const { height } = layout(st.cards[i]!.prepared, textWidth, lineHeight);
    const totalH = height + cardPadding * 2;

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

function getOrCreateCardNode(cardIndex: number): HTMLDivElement {
  const existingNode = domCache.cards[cardIndex];
  if (existingNode) return existingNode;

  const node = document.createElement("div");
  node.className = "card";
  node.textContent = st.cards[cardIndex]!.text;
  domCache.container.appendChild(node);
  domCache.cards[cardIndex] = node;
  return node;
}

function clearAllCards(): void {
  for (const node of domCache.cards) {
    if (node) node.remove();
  }
  domCache.cards = [];
}

// --- events ---
window.addEventListener("resize", () => scheduleRender());
window.addEventListener("scroll", () => scheduleRender(), true);

// --- infinite scroll ---
window.addEventListener("scroll", () => {
  if (loadingMore || !hasMore) return;
  const scrolledNearBottom =
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 400;
  if (scrolledNearBottom) {
    fetchAndRender(st.currentSearch, st.currentTag, currentPage + 1);
  }
});

let scheduledRaf: number | null = null;
function scheduleRender() {
  if (scheduledRaf != null) return;
  scheduledRaf = requestAnimationFrame(
    function renderAndMaybeScheduleAnotherRender() {
      scheduledRaf = null;
      render();
    },
  );
}

function render() {
  if (st.cards.length === 0) return;

  const windowWidth = document.documentElement.clientWidth;
  const windowHeight = document.documentElement.clientHeight;
  const scrollTop = window.scrollY;

  const layoutState = computeLayout(windowWidth);
  domCache.container.style.height = `${layoutState.contentHeight}px`;

  const viewTop = scrollTop - 200;
  const viewBottom = scrollTop + windowHeight + 200;
  const visibleFlags = new Uint8Array(st.cards.length);

  for (let i = 0; i < layoutState.positionedCards.length; i++) {
    const positionedCard = layoutState.positionedCards[i]!;
    if (
      positionedCard.y > viewBottom ||
      positionedCard.y + positionedCard.h < viewTop
    )
      continue;

    visibleFlags[positionedCard.cardIndex] = 1;
    const node = getOrCreateCardNode(positionedCard.cardIndex);
    node.style.left = `${positionedCard.x}px`;
    node.style.top = `${positionedCard.y}px`;
    node.style.width = `${layoutState.colWidth}px`;
    node.style.height = `${positionedCard.h}px`;
  }

  for (let cardIndex = 0; cardIndex < domCache.cards.length; cardIndex++) {
    const node = domCache.cards[cardIndex];
    if (node && visibleFlags[cardIndex] === 0) {
      node.remove();
      domCache.cards[cardIndex] = undefined;
    }
  }
}

// --- tag loading ---
async function loadTags(): Promise<void> {
  try {
    const resp = await fetch("/api/memos/tags");
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { tags: string[] } = await resp.json();
    const dropdown = document.querySelector("#tag-select .select-dropdown");
    if (!dropdown) return;
    for (let i = 0; i < data.tags.length; i++) {
      const tag = data.tags[i]!;
      const opt = document.createElement("div");
      opt.className = "select-option";
      opt.dataset.value = tag;
      opt.textContent = tag;
      dropdown.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load tags:", err);
  }
}

// --- memo count ---
async function loadCount(): Promise<void> {
  try {
    const resp = await fetch("/api/memos/count");
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { count: number } = await resp.json();
    const countEl = document.getElementById("memo-count");
    if (countEl) {
      countEl.textContent = `${data.count} items`;
    }
  } catch (err) {
    console.error("Failed to load count:", err);
  }
}

// --- fetch and render with filters ---
async function fetchAndRender(
  search: string,
  tag: string,
  page: number = 0,
): Promise<void> {
  if (page === 0) {
    showStatus("Loading...");
  }
  loadingMore = true;
  try {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tag) params.set("tag", tag);
    params.set("page", String(page));
    params.set("limit", "50");
    const url = `/api/memos?${params.toString()}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { memos: { content: string }[]; hasMore: boolean } =
      await resp.json();

    hideStatus();
    hasMore = data.hasMore;
    currentPage = page;

    if (data.memos.length === 0 && page === 0) {
      st = { cards: [], currentSearch: search, currentTag: tag };
      clearAllCards();
      domCache.container.style.height = "0px";
      showStatus("No memos found.");
      return;
    }

    const newCards = data.memos.map((m) => ({
      text: m.content,
      prepared: getOrPrepare(m.content, font),
    }));

    if (page === 0) {
      st = { cards: newCards, currentSearch: search, currentTag: tag };
      clearAllCards();
    } else {
      st.cards = [...st.cards, ...newCards];
    }

    scheduleRender();

    // Update URL for bookmarkability (only on first page)
    if (page === 0) {
      const urlParams = new URLSearchParams();
      if (search) urlParams.set("search", search);
      if (tag) urlParams.set("tag", tag);
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      history.replaceState(null, "", newUrl);
    }
  } catch (err) {
    console.error("Failed to load memos:", err);
    if (page === 0) {
      showStatus("Failed to load memos. Please try again later.", true);
    }
  } finally {
    loadingMore = false;
  }
}

// --- debounced search + tag change ---
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement;

  searchInput?.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchAndRender(searchInput.value.trim(), getCustomSelectValue());
    }, 250);
  });

  initCustomSelect();
});

// --- init: load tags and initial state from URL ---
async function init(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const initialSearch = urlParams.get("search") || "";
  const initialTag = urlParams.get("tag") || "";

  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement;
  if (searchInput) searchInput.value = initialSearch;

  await loadTags();
  await loadCount();

  if (initialTag) setCustomSelectValue(initialTag);

  await fetchAndRender(initialSearch, initialTag);
}

init();
