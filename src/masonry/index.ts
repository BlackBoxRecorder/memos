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
    const data: { tags: string[] } = await resp.json();
    const select = document.getElementById("tag-select") as HTMLSelectElement;
    if (!select) return;
    for (const tag of data.tags) {
      const opt = document.createElement("option");
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load tags:", err);
  }
}

// --- fetch and render with filters ---
async function fetchAndRender(search: string, tag: string): Promise<void> {
  showStatus("Loading...");
  try {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tag) params.set("tag", tag);
    const url = `/api/memos${params.toString() ? "?" + params.toString() : ""}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data: { memos: { content: string }[] } = await resp.json();

    hideStatus();

    if (data.memos.length === 0) {
      st = { cards: [], currentSearch: search, currentTag: tag };
      clearAllCards();
      domCache.container.style.height = "0px";
      showStatus("No memos found.");
      return;
    }

    st = {
      cards: data.memos.map((m) => ({
        text: m.content,
        prepared: getOrPrepare(m.content, font),
      })),
      currentSearch: search,
      currentTag: tag,
    };

    clearAllCards();
    scheduleRender();

    // Update URL for bookmarkability
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    history.replaceState(null, "", newUrl);
  } catch (err) {
    console.error("Failed to load memos:", err);
    showStatus("Failed to load memos. Please try again later.", true);
  }
}

// --- debounced search + tag change ---
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement;
  const tagSelect = document.getElementById("tag-select") as HTMLSelectElement;

  searchInput?.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchAndRender(searchInput.value.trim(), tagSelect?.value || "");
    }, 250);
  });

  tagSelect?.addEventListener("change", () => {
    fetchAndRender(searchInput?.value.trim() || "", tagSelect.value);
  });
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

  const tagSelect = document.getElementById("tag-select") as HTMLSelectElement;
  if (tagSelect && initialTag) tagSelect.value = initialTag;

  await fetchAndRender(initialSearch, initialTag);
}

init();
