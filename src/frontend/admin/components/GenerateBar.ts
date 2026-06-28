import van from "vanjs-core";
import { truncate } from "../../../helper/util";
import {
  availableTags,
  prompts,
  selectedPromptId,
  selectedTagFilter,
  extraPromptInput,
  generating,
  generateError,
} from "../state";
import { handleGenerate, selectPrompt } from "../actions/creative-core";

const { div, span, button, textarea } = van.tags;

// ====== Tag Selector ======

function TagSelector() {
  return div(
    {
      style: "display:flex;flex-wrap:wrap;gap:6px;",
    },
    () => {
      if (availableTags.val.length === 0) {
        return span(
          { style: "font-size:12px;color:var(--text-muted);" },
          "暂无标签",
        );
      }
      return div(
        { style: "display:flex;flex-wrap:wrap;gap:6px;" },
        ...availableTags.val.map((tag) =>
          button(
            {
              class: () =>
                "mode-btn" + (selectedTagFilter.val === tag ? " active" : ""),
              style:
                "font-size:12px;padding:3px 10px;border-radius:12px;" +
                "white-space:nowrap;",
              disabled: () => generating.val,
              onclick: () => {
                selectedTagFilter.val =
                  selectedTagFilter.val === tag ? "" : tag;
              },
            },
            tag,
          ),
        ),
      );
    },
  );
}

// ====== Prompt Selector ======

function PromptSelector() {
  return div(
    {
      style: "display:flex;flex-wrap:wrap;gap:6px;",
    },
    () => {
      if (prompts.val.length === 0) {
        return span(
          { style: "font-size:12px;color:var(--text-muted);" },
          "暂无提示词",
        );
      }
      return div(
        { style: "display:flex;flex-wrap:wrap;gap:6px;" },
        ...prompts.val.map((p) =>
          button(
            {
              class: () =>
                "mode-btn" + (selectedPromptId.val === p.id ? " active" : ""),
              style:
                "font-size:12px;padding:3px 10px;border-radius:12px;" +
                "white-space:nowrap;",
              disabled: () => generating.val,
              onclick: () => selectPrompt(p.id),
            },
            p.title,
          ),
        ),
      );
    },
  );
}

// ====== Loading Bar ======

const loadingBarStyle = `
@keyframes loading-37 {
    100% {
        background-position: right -25% top 0;
    }
}
`;

function LoadingBar() {
  // Inject keyframes once
  van.derive(() => {
    if (!document.getElementById("loading-bar-keyframes")) {
      const style = document.createElement("style");
      style.id = "loading-bar-keyframes";
      style.textContent = loadingBarStyle;
      document.head.appendChild(style);
    }
  });

  return div({
    style: () =>
      generating.val
        ? "width:80px;height:20px;margin:10px auto 0;" +
          "-webkit-mask:linear-gradient(90deg,#000 70%,#0000 0) left/20% 100%;" +
          "background:linear-gradient(var(--primary-color) 0 0) left -25% top 0/20% 100% no-repeat var(--bg-hover);" +
          "animation:loading-37 1s infinite steps(6);"
        : "display:none;",
  });
}

// ====== GenerateBar ======

export function GenerateBar() {
  return div(
    { style: "margin-bottom:16px;" },
    // Section divider + Prompt selector
    div(
      {
        style: "display:flex;align-items:center;gap:10px;margin-bottom:8px;",
      },
      div({
        style: "flex:1;height:1px;background:var(--border-color);",
      }),
      span(
        {
          style: "font-size:12px;color:var(--text-muted);white-space:nowrap;",
        },
        "提示词",
      ),
      div({
        style: "flex:1;height:1px;background:var(--border-color);",
      }),
    ),
    div({ style: "margin-bottom:12px;" }, PromptSelector()),
    // Section divider + Tag selector
    div(
      {
        style: "display:flex;align-items:center;gap:10px;margin-bottom:8px;",
      },
      div({
        style: "flex:1;height:1px;background:var(--border-color);",
      }),
      span(
        {
          style: "font-size:12px;color:var(--text-muted);white-space:nowrap;",
        },
        "标签",
      ),
      div({
        style: "flex:1;height:1px;background:var(--border-color);",
      }),
    ),
    div(
      {
        style: "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;",
      },
      TagSelector(),
    ),
    // Input row: textarea + generate button
    div(
      { style: "display:flex;gap:8px;align-items:flex-end;" },
      div(
        {
          style: () =>
            "flex:1;min-width:0;border-radius:8px;" +
            (generating.val
              ? "animation:gen-border-pulse 1.5s ease-in-out infinite;"
              : ""),
        },
        textarea({
          class: "form-input",
          placeholder: "AI 生成的附加指令...",
          value: extraPromptInput,
          disabled: () => generating.val,
          oninput: (e: Event) => {
            extraPromptInput.val = (e.target as HTMLTextAreaElement).value;
          },
          rows: 2,
          style:
            "width:100%;box-sizing:border-box;resize:none;padding:8px;" +
            "border-radius:6px;font-size:14px;min-height:44px;" +
            "border:1px solid var(--border-color);" +
            "background:var(--bg-primary);color:var(--text-primary);" +
            "overflow-x:hidden;word-wrap:break-word;white-space:pre-wrap;",
        }),
      ),
      button(
        {
          class: "btn btn-primary btn-sm",
          disabled: () =>
            generating.val ||
            selectedPromptId.val === null ||
            !selectedTagFilter.val.trim(),
          onclick: handleGenerate,
          style: "flex-shrink:0;align-self:flex-end;",
          title: () => {
            if (selectedPromptId.val === null) return "请先选择提示词";
            if (!selectedTagFilter.val.trim()) return "请先选择标签";
            return "生成创意内容";
          },
        },
        () => (generating.val ? "生成中..." : "生成"),
      ),
    ),
    // Loading bar animation
    LoadingBar(),
    // Error display
    () =>
      generateError.val
        ? div(
            {
              class: "form-error",
              style: "margin-top:8px;",
            },
            generateError.val,
          )
        : "",
  );
}
