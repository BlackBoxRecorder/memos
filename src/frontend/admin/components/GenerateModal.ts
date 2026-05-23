import van from "vanjs-core";
import { truncate, formatDate } from "../../../helper/util";
import {
  generateModalOpen,
  extraPromptInput,
  generating,
  generateError,
  streamContent,
  streamDone,
  generationMode,
  manualMemoIds,
  selectedPromptId,
  prompts,
  previewOpen,
  previewMemos,
  previewLoading,
  previewError,
  previewFetched,
} from "../state";
import {
  handleGenerate,
  closeGenerateModal,
  loadPreviewContext,
  resetPreview,
} from "../actions/creative-core";

const { div, span, button, input, textarea, h3 } = van.tags;

// ====== Preview Panel ======

function renderPreviewBody() {
  if (previewError.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#c0392b;" },
      previewError.val,
    );
  }
  if (previewLoading.val && !previewFetched.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "正在加载上下文...",
    );
  }
  if (!previewFetched.val) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "点击「预览」查看将用作上下文的 Memos。",
    );
  }
  if (previewMemos.val.length === 0) {
    return div(
      { style: "margin-top:8px;font-size:12px;color:#888;" },
      "未找到相关 Memos。",
    );
  }
  return div(
    {
      class: "modal-scroll-area",
      style:
        "margin-top:8px;display:flex;flex-direction:column;gap:6px;" +
        "max-height:180px;overflow-y:auto;",
    },
    ...previewMemos.val.map((m) =>
      div(
        {
          style:
            "padding:8px;background:#fff;border:1px solid #e5e5e5;" +
            "border-radius:4px;font-size:12px;color:#333;",
        },
        div(
          { class: "creative-meta", style: "margin-bottom:4px;" },
          span({ class: "badge" }, "#" + String(m.id)),
          ...m.tags.map((tag) => span({ class: "badge badge-tag" }, tag)),
          span(formatDate(m.created_at)),
        ),
        div(
          {
            style:
              "line-height:18px;white-space:pre-wrap;word-break:break-word;",
          },
          truncate(m.content, 120),
        ),
      ),
    ),
  );
}

function PreviewPanel() {
  return div(
    {},
    div(
      {
        class: "context-preview-bar",
        onclick: () => (previewOpen.val = !previewOpen.val),
      },
      () => (previewOpen.val ? "\u25BC" : "\u25B6"),
      "Memos 预览",
      () => {
        const hasData = previewFetched.val && !previewError.val;
        const memoCount = previewMemos.val.length;
        return hasData
          ? span(
              {
                class:
                  "context-preview-count" + (memoCount === 0 ? " empty" : ""),
              },
              memoCount === 0 ? "无结果" : memoCount + " 条 Memos",
            )
          : "";
      },
      span(
        { style: "margin-left:auto;" },
        button(
          {
            class: "btn btn-outline btn-sm",
            disabled: () => previewLoading.val || generating.val,
            onclick: (e: Event) => {
              e.stopPropagation();
              previewOpen.val = true;
              loadPreviewContext();
            },
          },
          () =>
            previewLoading.val
              ? "加载中..."
              : previewFetched.val
                ? "刷新"
                : "预览",
        ),
      ),
    ),
    () => (previewOpen.val ? renderPreviewBody() : ""),
  );
}

// ====== Generate Modal ======

export function GenerateModal() {
  const selectedPrompt = prompts.val.find((p) => p.id === selectedPromptId.val);
  const hasStarted = generating.val || !!streamContent.val || streamDone.val;

  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) {
          closeGenerateModal();
        }
      },
    },
    div(
      { class: "modal modal-flex", style: "max-width:600px;" },

      // HEADER
      div(
        { class: "modal-header" },
        div(
          {
            style:
              "display:flex;align-items:center;justify-content:space-between;",
          },
          h3({ style: "margin-bottom:0;" }, "Generate Creative Content"),
          () =>
            hasStarted
              ? button(
                  {
                    class: "btn btn-outline btn-sm",
                    onclick: closeGenerateModal,
                  },
                  "\u2715",
                )
              : "",
        ),
        () =>
          hasStarted
            ? div(
                { class: "generation-summary" },
                selectedPrompt ? selectedPrompt.title + " \u00B7 " : "",
                truncate(extraPromptInput.val, 60),
                generationMode.val === "manual" && manualMemoIds.val
                  ? " \u00B7 ID\uFF1A" + manualMemoIds.val
                  : "",
              )
            : "",
      ),

      // BODY
      div(
        { class: "modal-body" },
        // Setup phase
        div(
          {
            style: () => (hasStarted ? "display:none" : ""),
          },
          div(
            { class: "modal-section" },
            () =>
              selectedPrompt
                ? div(
                    { class: "selected-prompt-label" },
                    "已选提示词：",
                    span(
                      {
                        style: "font-weight:500;color:#333",
                      },
                      selectedPrompt.title,
                    ),
                  )
                : "",
            textarea({
              placeholder: "AI 生成的附加指令...",
              value: extraPromptInput,
              disabled: () => generating.val,
              oninput: (e: Event) => {
                const ta = e.target as HTMLTextAreaElement;
                extraPromptInput.val = ta.value;
                resetPreview();
              },
              onfocus: () => {},
              onblur: () => {},
            }),
            // Context mode toggle
            div(
              { class: "context-mode-toggle" },
              span(
                {
                  style: "font-size:13px;color:#666;margin-right:8px;",
                },
                "上下文：",
              ),
              button(
                {
                  class: () =>
                    "mode-btn" +
                    (generationMode.val === "auto" ? " active" : ""),
                  disabled: () => generating.val,
                  onclick: () => {
                    generationMode.val = "auto";
                    resetPreview();
                  },
                },
                "自动匹配",
              ),
              button(
                {
                  class: () =>
                    "mode-btn" +
                    (generationMode.val === "manual" ? " active" : ""),
                  disabled: () => generating.val,
                  onclick: () => {
                    generationMode.val = "manual";
                    resetPreview();
                  },
                },
                "手动选择",
              ),
            ),
            // Manual memo ID input
            () =>
              generationMode.val === "manual"
                ? div(
                    { style: "margin-top:8px;" },
                    input({
                      type: "text",
                      placeholder: "Memo ID（例如 1,3,5）",
                      value: manualMemoIds,
                      disabled: () => generating.val,
                      oninput: (e: Event) => {
                        const inp = e.target as HTMLInputElement;
                        manualMemoIds.val = inp.value;
                        resetPreview();
                      },
                      onfocus: () => {},
                      onblur: () => {},
                    }),
                    div(
                      {
                        style: "font-size:11px;color:#999;margin-top:4px;",
                      },
                      "输入 Memo ID，用逗号分隔。在备忘录标签页查看 ID（#编号）。",
                    ),
                  )
                : "",
          ),
          // Context preview section
          div(
            { class: "modal-section" },
            div({ class: "modal-section-title" }, "Memos 预览"),
            PreviewPanel(),
          ),
        ),
        // Generation phase
        () =>
          hasStarted
            ? (() => {
                if (!streamContent.val && !generating.val) return "";
                const done = streamDone.val;
                const active = generating.val;
                return div(
                  {
                    class: "hide-scrollbar",
                    style:
                      "background:#f8f9fb;border-radius:6px;" +
                      "border:1px solid #e5e5e5;padding:14px;" +
                      "min-height:200px;display:flex;flex-direction:column;",
                  },
                  div(
                    {
                      style: "font-size:13px;color:#888;margin-bottom:8px;",
                    },
                    done ? "生成的内容：" : "生成中...",
                  ),
                  div(
                    {
                      style:
                        "font-size:14px;line-height:22px;" +
                        "white-space:pre-wrap;word-break:break-word;" +
                        "color:#333;flex:1;",
                    },
                    streamContent,
                    () =>
                      active
                        ? span(
                            {
                              style:
                                "animation:blink 0.8s infinite;color:#3b82f6;",
                            },
                            "\u258B",
                          )
                        : "",
                  ),
                );
              })()
            : "",
      ),

      // FOOTER
      div(
        { class: "modal-footer" },
        () =>
          generateError.val
            ? div(
                {
                  class: "form-error",
                  style: "margin-bottom:8px;",
                },
                generateError.val,
              )
            : "",
        () =>
          hasStarted
            ? div(
                {
                  class: "modal-actions",
                  style: "margin-top:0;",
                },
                button(
                  {
                    class: () =>
                      "btn btn-sm " +
                      (streamDone.val ? "btn-primary" : "btn-outline"),
                    onclick: closeGenerateModal,
                  },
                  () => (streamDone.val ? "关闭" : "取消"),
                ),
              )
            : div(
                {
                  class: "modal-actions",
                  style: "margin-top:0;",
                },
                button(
                  {
                    class: "btn btn-outline btn-sm",
                    onclick: closeGenerateModal,
                  },
                  "取消",
                ),
                button(
                  {
                    class: "btn btn-primary btn-sm",
                    disabled: () => generating.val || streamDone.val,
                    onclick: handleGenerate,
                  },
                  "生成",
                ),
              ),
      ),
    ),
  );
}
