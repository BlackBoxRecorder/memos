import van from "vanjs-core";
import { renderMarkdown } from "../../../helper/markdown";
import {
  chatMessages,
  chatInput,
  chatStreaming,
  chatContextCount,
  chatTagFilter,
  prompts,
  availableTags,
} from "../state";
import { sendChatMessage, saveChatAsCreative, newChat } from "../actions/chat";

const { div, span, button, textarea, form } = van.tags;

export function ChatPanel() {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    sendChatMessage();
  };

  return div(
    {
      style:
        "display:flex;flex-direction:column;" +
        "height:calc(100vh - 195px);" +
        "background:var(--bg-primary);",
    },
    // Conversation area
    div(
      {
        style:
          "flex:1;overflow-y:auto;min-height:0;" +
          "margin-bottom:12px;padding:12px;" +
          "background:var(--bg-secondary);border-radius:8px;" +
          "border:1px solid var(--border-color);",
      },
      () =>
        chatMessages.val.length === 0
          ? div(
            {
              style:
                "text-align:center;color:var(--text-muted);padding:40px 20px;",
            },
            "开始与 AI 对话，探索你的笔记库。",
          )
          : div(
            chatMessages.val.map((msg, i) =>
              div(
                {
                  style: () => {
                    const isUser = chatMessages.val[i]?.role === "user";
                    return (
                      "margin-bottom:12px;padding:8px 12px;" +
                      "border-radius:8px;max-width:85%;" +
                      (isUser
                        ? "margin-left:auto;background:var(--primary-light);color:var(--primary-text);"
                        : "margin-right:auto;background:var(--bg-primary);border:1px solid var(--border-color);")
                    );
                  },
                },
                div(
                  {
                    style:
                      "font-size:11px;font-weight:600;margin-bottom:4px;color:var(--text-muted);",
                  },
                  msg.role === "user" ? "你" : "AI 助手",
                ),
                div(
                  {
                    style: () => {
                      const isStreaming =
                        chatStreaming.val &&
                        i === chatMessages.val.length - 1;
                      return (
                        (isStreaming ? "white-space:pre-wrap;" : "") +
                        "word-break:break-word;" +
                        "font-size:14px;line-height:1.6;"
                      );
                    },
                  },
                  () => {
                    const isStreaming =
                      chatStreaming.val && i === chatMessages.val.length - 1;
                    const content = chatMessages.val[i]?.content || "";
                    if (isStreaming) {
                      return (
                        content ||
                        span(
                          { style: "color:var(--text-muted);" },
                          "思考中...",
                        )
                      );
                    }
                    return span({
                      class: "md-content",
                      innerHTML: renderMarkdown(content),
                    });
                  },
                ),
              ),
            ),
          ),
    ),
    // Bottom section (fixed at bottom)
    div(
      { style: "flex-shrink:0;" },
      // Status bar
      () =>
        chatContextCount.val > 0
          ? div(
            {
              style:
                "font-size:12px;color:var(--text-muted);margin-bottom:8px;",
            },
            `已检索 ${chatContextCount.val} 条相关备忘录作为上下文`,
          )
          : "",
      // Tag filter for chat context
      () =>
        availableTags.val.length > 0
          ? div(
            {
              style:
                "margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;",
            },
            span(
              { style: "font-size:12px;color:var(--text-muted);flex-shrink:0;" },
              "上下文标签：",
            ),
            button(
              {
                class: () =>
                  "mode-btn" + (!chatTagFilter.val ? " active" : ""),
                style: "font-size:11px;padding:2px 8px;border-radius:10px;",
                onclick: () => {
                  chatTagFilter.val = "";
                },
              },
              "自动",
            ),
            ...availableTags.val.map((tag) =>
              button(
                {
                  class: () =>
                    "mode-btn" +
                    (chatTagFilter.val === tag ? " active" : ""),
                  style: "font-size:11px;padding:2px 8px;border-radius:10px;",
                  onclick: () => {
                    chatTagFilter.val =
                      chatTagFilter.val === tag ? "" : tag;
                  },
                },
                tag,
              ),
            ),
          )
          : "",
      // Input area
      form(
        {
          onsubmit: handleSubmit,
          style: "display:flex;gap:8px;align-items:flex-end;",
        },
        textarea({
          class: "form-input",
          placeholder: "输入消息探索你的笔记...",
          disabled: () => chatStreaming.val,
          oninput: (e: InputEvent) =>
            (chatInput.val = (e.target as HTMLTextAreaElement).value),
          onkeydown: handleKeydown,
          value: chatInput,
          rows: 2,
          style:
            "flex:1;resize:none;min-height:44px;padding:8px;" +
            "border-radius:8px;border:1px solid var(--border-color);" +
            "font-size:14px;background:var(--bg-primary);color:var(--text-primary);",
        }),
        button(
          {
            class: () =>
              "btn btn-sm " + (chatStreaming.val ? "btn-outline" : "btn-primary"),
            disabled: () => chatStreaming.val || !chatInput.val.trim(),
            type: "submit",
            style: "flex-shrink:0;",
          },
          () => (chatStreaming.val ? "..." : "发送"),
        ),
      ),
      // Action buttons
      div(
        { style: "margin-top:12px;display:flex;gap:8px;" },
        button(
          {
            class: "btn btn-sm",
            disabled: () => chatMessages.val.length === 0,
            onclick: saveChatAsCreative,
            style: "font-size:12px;",
          },
          "保存对话",
        ),
        button(
          {
            class: "btn btn-sm btn-outline",
            disabled: () => chatMessages.val.length === 0,
            onclick: newChat,
            style: "font-size:12px;",
          },
          "新对话",
        ),
        () =>
          prompts.val.length > 0
            ? div(
              {
                style: "display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;",
              },
              prompts.val.slice(0, 5).map((p) =>
                button(
                  {
                    class: "tag-btn",
                    style: "font-size:11px;padding:2px 8px;",
                    title: p.content,
                    onclick: () => {
                      chatMessages.val = [
                        ...chatMessages.val,
                        {
                          role: "user",
                          content: `使用提示词「${p.title}」：\n${p.content}`,
                        },
                      ];
                      setTimeout(() => sendChatMessage(), 100);
                    },
                  },
                  p.title,
                ),
              ),
            )
            : "",
      ),
    ),
  );
}
