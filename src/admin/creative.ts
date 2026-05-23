import van from "vanjs-core";
import { formatDate, truncate } from "../helper/util";
import { svgTrash } from "../helper/svgHelper";
import type { Prompt, CreativeItem } from "../model";
import {
  prompts,
  selectedPromptId,
  creativeItems,
  creativeLoading,
  creativeDeleteId,
  creativeDeleting,
  readMoreItem,
  promptFormMode,
  promptFormTitle,
  promptFormContent,
  promptFormError,
  promptFormSaving,
  generateModalOpen,
  creativeView,
} from "./state";
import {
  loadPrompts,
  openPromptCreate,
  openPromptEdit,
  closePromptForm,
  savePromptForm,
  deletePrompt,
  selectPrompt,
  deleteCreativeItem,
} from "./actions/creative-core";
import { GenerateModal } from "./components/GenerateModal";
import { ChatPanel } from "./components/ChatPanel";

const { div, span, button, input, textarea, h3 } = van.tags;

// Re-export for app.ts
export { openPromptCreate };

// ====== PromptForm ======

function PromptForm() {
  const isEdit = promptFormMode.val.type === "edit";
  const title = isEdit ? "Edit Prompt" : "New Prompt";
  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closePromptForm();
      },
    },
    div(
      { class: "modal" },
      div(
        { class: "form-card", style: "margin-bottom:0;box-shadow:none;" },
        h3(title),

        input({
          type: "text",
          placeholder: "提示词标题",
          value: promptFormTitle,
          disabled: () => promptFormSaving.val,
          oninput: (e: Event) =>
            (promptFormTitle.val = (e.target as HTMLInputElement).value),
        }),
        textarea({
          placeholder: "提示词内容（AI 指令）",
          style: "margin-top:10px;",
          value: promptFormContent,
          disabled: () => promptFormSaving.val,
          oninput: (e: Event) =>
            (promptFormContent.val = (e.target as HTMLTextAreaElement).value),
        }),
        div(
          { class: "form-row" },
          div({ style: "flex:1" }),
          button(
            { class: "btn btn-outline btn-sm", onclick: closePromptForm },
            "取消",
          ),
          button(
            {
              class: "btn btn-primary btn-sm",
              disabled: () => promptFormSaving.val,
              onclick: savePromptForm,
            },
            () => (promptFormSaving.val ? "保存中..." : "保存"),
          ),
        ),
        () =>
          promptFormError.val
            ? div({ class: "form-error" }, promptFormError.val)
            : "",
      ),
    ),
  );
}

// ====== TagCloud ======

function TagCloud() {
  return div(
    { class: "tag-cloud" },
    ...prompts.val.map((prompt) => {
      return button(
        {
          class: () =>
            "tag-cloud-item" +
            (selectedPromptId.val === prompt.id ? " active" : ""),
          onclick: () => selectPrompt(prompt.id),
        },
        prompt.title,
        span(
          { class: "tag-actions" },
          button(
            {
              class: "tag-action-btn",
              title: "编辑",
              onclick: (e: Event) => {
                e.stopPropagation();
                openPromptEdit(prompt);
              },
            },
            "\u270E",
          ),
          button(
            {
              class: "tag-action-btn",
              title: "删除",
              onclick: (e: Event) => {
                e.stopPropagation();
                if (confirm(`确定要删除提示词「${prompt.title}」吗？`)) {
                  deletePrompt(prompt.id);
                }
              },
            },
            "\u00D7",
          ),
        ),
      );
    }),
  );
}

// ====== CreativeCard ======

function CreativeCard(item: CreativeItem) {
  const prompt = prompts.val.find((p) => p.id === item.prompt_id);
  const isLong = item.content.length > 200;
  const displayContent = isLong
    ? item.content.slice(0, 200) + "..."
    : item.content;

  return div(
    { class: "creative-card", "data-creative-id": String(item.id) },
    div(
      { class: "creative-content" },
      displayContent,
      isLong
        ? button(
            {
              class: "read-more-btn",
              onclick: () => (readMoreItem.val = item),
            },
            " 更多",
          )
        : "",
    ),
    div(
      { class: "creative-meta" },
      prompt ? span({ class: "badge badge-tag" }, prompt.title) : "",
      item.extra_prompt
        ? span({ class: "badge" }, "附加：" + truncate(item.extra_prompt, 40))
        : "",
      span(formatDate(item.created_at)),
      span(
        { class: "creative-meta-icons" },
        button(
          {
            class: "creative-icon-btn delete",
            title: "删除",
            onclick: () => (creativeDeleteId.val = item.id),
          },
          svgTrash(),
        ),
      ),
    ),
    () =>
      creativeDeleteId.val === item.id
        ? div(
            { class: "delete-confirm" },
            span("确定要删除这条创意内容吗？"),
            button(
              {
                class: "btn btn-danger btn-sm",
                disabled: () => creativeDeleting.val,
                onclick: () => deleteCreativeItem(item.id),
              },
              "删除",
            ),
            button(
              {
                class: "btn btn-outline btn-sm",
                onclick: () => (creativeDeleteId.val = null),
              },
              "取消",
            ),
          )
        : "",
  );
}

// ====== ReadMoreModal ======

function ReadMoreModal() {
  const item = readMoreItem.val;
  if (!item) return "";
  const prompt = prompts.val.find((p) => p.id === item.prompt_id);
  return div(
    {
      class: "modal-overlay",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) readMoreItem.val = null;
      },
    },
    div(
      { class: "modal modal-wide" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;",
        },
        h3(prompt ? prompt.title : "Creative Content"),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: () => (readMoreItem.val = null),
          },
          "\u2715",
        ),
      ),
      div(
        { class: "read-more-content", style: "padding-right:16px;" },
        item.content,
      ),
      item.extra_prompt
        ? div(
            { style: "margin-top:12px;font-size:12px;color:#999;" },
            "附加指令：",
            item.extra_prompt,
          )
        : "",
      div(
        { style: "margin-top:4px;font-size:12px;color:#999;" },
        "创建于：",
        formatDate(item.created_at),
      ),
    ),
  );
}

// ====== CreativeTab ======

export function CreativeTab() {
  // Load data on first render
  if (prompts.val.length === 0) {
    loadPrompts();
  }

  return div(
    // Sub-tab bar
    div(
      {
        style:
          "display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border-color);",
      },
      button(
        {
          class: () =>
            "tab-btn " + (creativeView.val === "list" ? "active" : ""),
          style: () =>
            "padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid " +
            (creativeView.val === "list"
              ? "var(--primary-color)"
              : "transparent") +
            ";color:" +
            (creativeView.val === "list"
              ? "var(--primary-color)"
              : "var(--text-muted)") +
            ";margin-bottom:-2px;",
          onclick: () => {
            creativeView.val = "list";
          },
        },
        "列表视图",
      ),
      button(
        {
          class: () =>
            "tab-btn " + (creativeView.val === "chat" ? "active" : ""),
          style: () =>
            "padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid " +
            (creativeView.val === "chat"
              ? "var(--primary-color)"
              : "transparent") +
            ";color:" +
            (creativeView.val === "chat"
              ? "var(--primary-color)"
              : "var(--text-muted)") +
            ";margin-bottom:-2px;",
          onclick: () => {
            creativeView.val = "chat";
          },
        },
        "对话模式",
      ),
    ),
    () =>
      creativeView.val === "chat"
        ? ChatPanel()
        : div(
            // Tag cloud (list view only)
            () => (prompts.val.length > 0 ? TagCloud() : ""),
            // Generate button (below tag cloud)
            div(
              { style: "margin-bottom:16px;" },
              button(
                {
                  class: "btn btn-primary btn-sm",
                  disabled: () => selectedPromptId.val === null,
                  onclick: () => (generateModalOpen.val = true),
                  title:
                    selectedPromptId.val === null
                      ? "请先选择提示词"
                      : "生成创意内容",
                },
                "生成",
              ),
            ),
            // Generate modal
            () => (generateModalOpen.val ? GenerateModal() : ""),
            // Prompt form modal
            () => (promptFormMode.val.type !== "closed" ? PromptForm() : ""),
            // Creative content list
            () => {
              if (prompts.val.length === 0) {
                return div(
                  { class: "empty-state" },
                  "还没有提示词，创建一个开始吧！",
                );
              }
              if (creativeLoading.val) {
                return div({ class: "status-msg" }, "加载中...");
              }
              if (creativeItems.val.length === 0) {
                return div(
                  { class: "empty-state" },
                  "还没有创意内容。请在上方选择提示词并点击生成。",
                );
              }
              return div(creativeItems.val.map(CreativeCard));
            },
            // Read more modal
            () => (readMoreItem.val ? ReadMoreModal() : ""),
          ),
  );
}
