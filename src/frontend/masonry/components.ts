import van from "vanjs-core";
import {
  svgSearchIcon,
  svgChevronDown,
  svgEyeIcon,
  svgCopy,
  svgCheck,
} from "../../helper/svgHelper";
import { escapeHtml } from "../shared/utils/text";
import { copyToClipboard } from "../shared/utils/clipboard";
import { ReadMoreModal } from "../shared/components/ReadMoreModal";
import {
  cards,
  search,
  tag,
  tags,
  memoCount,
  tagSelectOpen,
  page,
  hasMore,
  loading,
  loadingMore,
  error,
  similarMemoId,
  similarMemos,
  similarLoading,
  similarError,
  readMoreText,
  copiedCardId,
  windowWidth,
  getLayout,
  truncateText,
  formatDate,
  closeSimilarModal,
  openReadMore,
  closeReadMore,
  type Card,
  type LayoutState,
} from "./state";
import { fetchAndRender, openSimilarModal, debouncedSearch } from "./api";

const { div, span, button, input, h1, h3, a } = van.tags;

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
    value: search,
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
            "\uD83D\uDCCC \u5DF2\u7F6E\u9876",
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
            copyToClipboard(card.text).then(() => {
              copiedCardId.val = card.id;
              setTimeout(() => {
                copiedCardId.val = null;
              }, 1500);
            });
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

export function App() {
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
    () =>
      ReadMoreModal({
        text: readMoreText,
        onClose: closeReadMore,
      }),
  );
}
