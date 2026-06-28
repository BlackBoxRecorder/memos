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
  streamContent,
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
                "mode-btn" +
                (selectedTagFilter.val === tag.name ? " active" : ""),
              style:
                "font-size:12px;padding:3px 10px;border-radius:12px;" +
                "white-space:nowrap;",
              disabled: () => generating.val,
              onclick: () => {
                selectedTagFilter.val =
                  selectedTagFilter.val === tag.name ? "" : tag.name;
              },
            },
            tag.name + " (" + tag.count + ")",
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
    // Prompt content preview
    () => {
      const id = selectedPromptId.val;
      if (id === null) return "";
      const prompt = prompts.val.find((p) => p.id === id);
      if (!prompt) return "";
      return div(
        {
          style:
            "margin-top:8px;border:1px solid var(--border-color);" +
            "border-radius:8px;overflow:hidden;width:100%;",
        },
        textarea({
          readonly: true,
          value: prompt.content,
          style:
            "width:100%;height:180px;box-sizing:border-box;" +
            "padding:10px;font-size:13px;line-height:1.5;" +
            "border:none;resize:none;outline:none;" +
            "background:var(--bg-secondary);color:var(--text-primary);" +
            "overflow-y:auto;overflow-x:hidden;" +
            "word-wrap:break-word;white-space:pre-wrap;font-family:inherit;",
        }),
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

// ====== Stream Output ======

function StreamOutput() {
  const textareaRef: { current: HTMLTextAreaElement | null } = {
    current: null,
  };

  // Smart scroll: auto-follow bottom unless user has scrolled up
  van.derive(() => {
    const el = textareaRef.current;
    const content = streamContent.val;
    if (!el || !content) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 20) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  return () =>
    generating.val
      ? textarea({
          readonly: true,
          value: () => streamContent.val,
          style:
            "width:100%;height:180px;box-sizing:border-box;" +
            "padding:10px;font-size:13px;font-family:monospace;" +
            "line-height:1.5;border:1px solid var(--border-color);" +
            "border-radius:6px;resize:none;outline:none;" +
            "background:var(--bg-secondary);color:var(--text-primary);" +
            "overflow-y:auto;overflow-x:hidden;" +
            "word-wrap:break-word;white-space:pre-wrap;" +
            "margin-top:8px;",
          oncreate: (el: HTMLTextAreaElement) => {
            textareaRef.current = el;
          },
          onremove: () => {
            textareaRef.current = null;
          },
        })
      : "";
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
    // Stream output display (only during generation)
    StreamOutput(),
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
