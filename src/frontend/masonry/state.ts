import van from "vanjs-core";
import { prepare, layout, type PreparedText } from "@chenglou/pretext";

// --- config ---
export const font = '15px "Helvetica Neue", Helvetica, Arial, sans-serif';
export const lineHeight = 22;
export const cardPadding = 16;
export const gap = 12;
export const maxColWidth = 400;
export const singleColumnMaxViewportWidth = 520;

// --- types ---
export type Card = {
  id: number;
  text: string;
  prepared: PreparedText;
  updatedAt: string;
  pinnedAt: string | null;
  rawText: string;
};

export type PositionedCard = {
  cardIndex: number;
  x: number;
  y: number;
  h: number;
};

export type LayoutState = {
  colWidth: number;
  contentHeight: number;
  positionedCards: PositionedCard[];
};

export type SimilarMemo = {
  id: number;
  content: string;
  tags: string[];
};

// --- state ---
export const cards = van.state<Card[]>([]);
export const search = van.state("");
export const tag = van.state("");
export const page = van.state(0);
export const hasMore = van.state(true);
export const loading = van.state(false);
export const loadingMore = van.state(false);
export const error = van.state<string | null>(null);
export const tags = van.state<string[]>([]);
export const memoCount = van.state<number | null>(null);
export const tagSelectOpen = van.state(false);
export const similarMemoId = van.state<number | null>(null);
export const similarMemos = van.state<SimilarMemo[]>([]);
export const similarLoading = van.state(false);
export const similarError = van.state<string | null>(null);
export const readMoreText = van.state<string | null>(null);
export const copiedCardId = van.state<number | null>(null);
export const windowWidth = van.state(0);

// --- prepared text cache ---
const preparedCache = new Map<string, PreparedText>();

export function getOrPrepare(text: string, f: string): PreparedText {
  const cached = preparedCache.get(text);
  if (cached) return cached;
  const p = prepare(text, f, { whiteSpace: "pre-wrap" });
  preparedCache.set(text, p);
  return p;
}

// --- utility ---
export function truncateText(
  text: string,
  maxLen: number = 100,
): { displayText: string; isTruncated: boolean } {
  if (text.length <= maxLen) {
    return { displayText: text, isTruncated: false };
  }
  return { displayText: text.slice(0, maxLen) + "...", isTruncated: true };
}

// --- masonry layout ---
export function computeLayout(cardsArr: Card[], winWidth: number): LayoutState {
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

export function getLayout(): LayoutState {
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

export function formatDate(isoStr: string): string {
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

// --- modal state helpers ---
export function closeSimilarModal(): void {
  similarMemoId.val = null;
  document.body.style.overflow = "";
}

export function openReadMore(text: string): void {
  readMoreText.val = text;
  document.body.style.overflow = "hidden";
}

export function closeReadMore(): void {
  readMoreText.val = null;
  document.body.style.overflow = "";
}
