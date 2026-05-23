import van from "vanjs-core";
import { formatDate, truncate } from "../../helper/util";
import { renderMarkdown } from "../../helper/markdown";
import {
  svgLock,
  svgUnlock,
  svgEdit,
  svgTrash,
  svgSparkle,
  svgPin,
} from "../../helper/svgHelper";
import type { Memo } from "../../model";
import {
  deleteConfirmId,
  deleteDeleting,
  aiAvailable,
  aiPanelMemoId,
  aiPanelLoading,
  aiPanelResult,
  aiPanelError,
  aiPanelAction,
} from "../state";
import {
  toggleVisibility,
  togglePin,
  deleteMemo,
  openEditForm,
  openReadMore,
} from "../actions/memo";
import {
  executeAiAction,
  closeAiPanel,
  replaceMemoWithResult,
  newMemoFromResult,
} from "../actions/ai";

const { div, span, button } = van.tags;

function DeleteConfirm(id: number) {
  return div(
    { class: "delete-confirm" },
    span("确定要删除这条 Memo 吗？"),
    button(
      {
        class: "btn btn-danger btn-sm",
        disabled: () => deleteDeleting.val,
        onclick: () => deleteMemo(id),
      },
      "删除",
    ),
    button(
      {
        class: "btn btn-outline btn-sm",
        onclick: () => (deleteConfirmId.val = null),
      },
      "取消",
    ),
  );
}

export function MemoCard(memo: Memo) {
  const badgeClass = memo.is_public ? "badge-public" : "badge-private";
  const badgeText = memo.is_public ? "公开" : "私密";

  const ACTION_LABELS: Record<string, string> = {
    summarize: "\u6458\u8981",
    rewrite: "\u6539\u5199",
    expand: "\u6269\u5199",
    "extract-keypoints": "\u8981\u70B9\u63D0\u70BC",
    polish: "\u6DA6\u8272",
  };

  const isPanelOpen = () => aiPanelMemoId.val === memo.id;

  return div(
    { class: "memo-card", "data-memo-id": String(memo.id) },
    () =>
      memo.pinned_at
        ? div(
            {
              style:
                "font-size:12px;color:#e67e22;padding:0 0 4px 0;display:flex;align-items:center;gap:2px;",
            },
            "📌 已置顶",
          )
        : "",
    div({ class: "memo-content" }, truncate(memo.content, 200), () =>
      memo.content.length > 200
        ? button(
            {
              class: "read-more-btn",
              onclick: () => openReadMore(memo.content),
            },
            "\u66F4\u591A",
          )
        : "",
    ),
    div(
      { class: "memo-meta" },
      span({ class: "memo-id" }, `#${memo.id}`),
      span({ class: `badge ${badgeClass}` }, badgeText),
      ...memo.tags.map((tag) => span({ class: "badge badge-tag" }, tag)),
      memo.updated_at !== memo.created_at
        ? span(`\u66F4\u65B0\u4E8E\uFF1A${formatDate(memo.updated_at)}`)
        : span(`\u521B\u5EFA\u4E8E\uFF1A${formatDate(memo.created_at)}`),
      span(
        { class: "memo-meta-icons" },
        button(
          {
            class: () => "memo-icon-btn" + (memo.pinned_at ? " pinned" : ""),
            title: memo.pinned_at ? "\u53D6\u6D88\u7F6E\u9876" : "\u7F6E\u9876",
            onclick: () => togglePin(memo),
          },
          svgPin(),
        ),
        button(
          {
            class: "memo-icon-btn",
            title: memo.is_public
              ? "\u8BBE\u4E3A\u79C1\u5BC6"
              : "\u8BBE\u4E3A\u516C\u5F00",
            onclick: () => toggleVisibility(memo),
          },
          memo.is_public ? svgUnlock() : svgLock(),
        ),
        button(
          {
            class: "memo-icon-btn",
            title: "\u7F16\u8F91",
            onclick: () => openEditForm(memo),
          },
          svgEdit(),
        ),
        button(
          {
            class: "memo-icon-btn delete",
            title: "\u5220\u9664",
            onclick: () => (deleteConfirmId.val = memo.id),
          },
          svgTrash(),
        ),
        () =>
          aiAvailable.val
            ? div(
                {
                  class: "ai-toolbox-trigger",
                  style: "display:inline-flex;position:relative;",
                },
                button(
                  {
                    class: "memo-icon-btn ai-toolbox-btn",
                    title: "AI \u5199\u4F5C\u5DE5\u5177\u7BB1",
                    onclick: (e: Event) => {
                      e.stopPropagation();
                      aiPanelMemoId.val = isPanelOpen() ? null : memo.id;
                    },
                  },
                  svgSparkle(),
                ),
                () =>
                  isPanelOpen() && !aiPanelResult.val && !aiPanelLoading.val
                    ? div(
                        {
                          class: "ai-toolbox-menu",
                          style:
                            "position:absolute;bottom:100%;right:0;" +
                            "background:#fff;border:1px solid #e5e5e5;" +
                            "border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" +
                            "padding:4px 0;z-index:10;min-width:120px;",
                        },
                        ...Object.entries(ACTION_LABELS).map(
                          ([action, label]) =>
                            button(
                              {
                                class: "ai-toolbox-item",
                                style:
                                  "display:block;width:100%;padding:6px 14px;" +
                                  "border:none;background:none;" +
                                  "font-size:13px;color:#333;cursor:pointer;" +
                                  "text-align:left;" +
                                  "white-space:nowrap;",
                                onclick: (e: Event) => {
                                  e.stopPropagation();
                                  if (action === "rewrite") {
                                    aiPanelAction.val = action;
                                    aiPanelResult.val = null;
                                    return;
                                  }
                                  executeAiAction(
                                    memo.id,
                                    memo.content,
                                    action,
                                  );
                                },
                                onmouseenter: (e: Event) => {
                                  (e.target as HTMLElement).style.background =
                                    "#f5f5f5";
                                },
                                onmouseleave: (e: Event) => {
                                  (e.target as HTMLElement).style.background =
                                    "none";
                                },
                              },
                              label,
                            ),
                        ),
                        // Style selector for rewrite
                        () =>
                          aiPanelAction.val === "rewrite" &&
                          !aiPanelLoading.val &&
                          !aiPanelResult.val
                            ? div(
                                {
                                  style:
                                    "border-top:1px solid #eee;padding:4px 0;",
                                },
                                div(
                                  {
                                    style:
                                      "padding:2px 14px;font-size:11px;color:#999;",
                                  },
                                  "\u98CE\u683C\uFF1A",
                                ),
                                ...[
                                  ["professional", "\u4E13\u4E1A"],
                                  ["casual", "\u53E3\u8BED"],
                                  ["minimal", "\u6781\u7B80"],
                                  ["academic", "\u5B66\u672F"],
                                ].map(([style, label]) =>
                                  button(
                                    {
                                      class: "ai-toolbox-item",
                                      style:
                                        "display:block;width:100%;padding:4px 14px;" +
                                        "border:none;background:none;" +
                                        "font-size:12px;color:#555;cursor:pointer;" +
                                        "text-align:left;",
                                      onclick: (e: Event) => {
                                        e.stopPropagation();
                                        executeAiAction(
                                          memo.id,
                                          memo.content,
                                          "rewrite",
                                          style,
                                        );
                                      },
                                      onmouseenter: (e: Event) => {
                                        (
                                          e.target as HTMLElement
                                        ).style.background = "#f5f5f5";
                                      },
                                      onmouseleave: (e: Event) => {
                                        (
                                          e.target as HTMLElement
                                        ).style.background = "none";
                                      },
                                    },
                                    label,
                                  ),
                                ),
                              )
                            : "",
                      )
                    : "",
              )
            : "",
      ),
    ),
    // AI result panel
    () =>
      isPanelOpen() &&
      (aiPanelResult.val || aiPanelLoading.val || aiPanelError.val)
        ? div(
            {
              class: "ai-result-panel",
              style:
                "margin-top:12px;padding:12px;" +
                "background:#f8f9fb;border:1px solid #e5e5e5;" +
                "border-radius:6px;",
            },
            () =>
              aiPanelLoading.val
                ? div(
                    { style: "font-size:13px;color:#888;" },
                    "\u6B63\u5728\u751F\u6210\u4E2D...",
                  )
                : aiPanelError.val
                  ? div(
                      { style: "font-size:13px;color:#c00;" },
                      aiPanelError.val,
                    )
                  : div(
                      {},
                      div(
                        {
                          style:
                            "font-size:13px;line-height:20px;" +
                            "word-break:break-word;" +
                            "color:#333;margin-bottom:12px;",
                        },
                        () =>
                          span({
                            class: "md-content",
                            style: "white-space:pre-wrap;",
                            innerHTML: renderMarkdown(aiPanelResult.val || ""),
                          }),
                      ),
                      div(
                        {
                          class: "ai-result-actions",
                          style: "display:flex;gap:6px;",
                        },
                        button(
                          {
                            class: "btn btn-primary btn-sm",
                            onclick: () => replaceMemoWithResult(memo.id),
                          },
                          "\u66FF\u6362\u539F\u6587",
                        ),
                        button(
                          {
                            class: "btn btn-outline btn-sm",
                            onclick: () =>
                              newMemoFromResult({
                                id: memo.id,
                                is_public: memo.is_public,
                                tags: memo.tags,
                              }),
                          },
                          "\u65B0\u5EFA memo",
                        ),
                        button(
                          {
                            class: "btn btn-outline btn-sm",
                            onclick: closeAiPanel,
                          },
                          "\u4E22\u5F03",
                        ),
                      ),
                    ),
          )
        : "",
    () => (deleteConfirmId.val === memo.id ? DeleteConfirm(memo.id) : ""),
  );
}
