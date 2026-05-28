import van from "vanjs-core";
import { formatDate, truncate } from "../../helper/util";
import { renderMarkdown, truncateRendered } from "../../helper/markdown";
import { svgTrash } from "../../helper/svgHelper";
import type { CreativeItem } from "../../model";
import {
  prompts,
  promptsLoaded,
  creativeItems,
  creativeLoading,
  creativeDeleteId,
  creativeDeleting,
  readMoreItem,
  promptDrawerOpen,
  tagsLoaded,
} from "./state";
import {
  loadPrompts,
  loadTags,
  deleteCreativeItem,
} from "./actions/creative-core";
import { GenerateBar } from "./components/GenerateBar";
import { PromptModal } from "./components/PromptDrawer";
import { ReadMoreModal } from "../shared/components/ReadMoreModal";


const { div, span, button } = van.tags;

// ====== CreativeCard ======

function CreativeCard(item: CreativeItem) {
  const prompt = prompts.val.find((p) => p.id === item.prompt_id);
  const fullHtml = renderMarkdown(item.content);
  const { html: truncatedHtml, truncated: isTruncated } = truncateRendered(
    fullHtml,
    200,
  );

  return div(
    { class: "creative-card", "data-creative-id": String(item.id) },
    div(
      { class: "creative-content" },
      span({ class: "md-content", innerHTML: truncatedHtml }),
      () =>
        isTruncated
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
        ? span({ class: "creative-meta-extra" }, "附加：" + truncate(item.extra_prompt, 40))
        : "",
      span({ style: "flex-shrink:0" }, formatDate(item.created_at)),
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

// ====== CreativeTab ======

export function CreativeTab() {
  // Load data on first render
  if (!promptsLoaded.val) {
    promptsLoaded.val = true;
    loadPrompts();
  }
  if (!tagsLoaded.val) {
    tagsLoaded.val = true;
    loadTags();
  }

  return div(
    // Generate bar (inline)
    GenerateBar(),
    // Prompt modal
    () => (promptDrawerOpen.val ? PromptModal() : ""),
    // Creative content list
    () => {
      if (creativeLoading.val) {
        return div({ class: "status-msg" }, "加载中...");
      }
      if (creativeItems.val.length === 0) {
        return div(
          { class: "empty-state" },
          "还没有创意内容。请在上方选择标签和提示词并点击生成。",
        );
      }
      return div(creativeItems.val.map(CreativeCard));
    },
    // Read more modal
    () => {
      const item = readMoreItem.val;
      if (!item) return "";
      const prompt = prompts.val.find((p) => p.id === item.prompt_id);
      return ReadMoreModal({
        text: van.state(item.content),
        onClose: () => (readMoreItem.val = null),
        title: prompt ? prompt.title : "Creative Content",
        footer: () =>
          div(
            {},
            item.extra_prompt
              ? div(
                {
                  style: "margin-top:12px;font-size:12px;color:var(--text-muted);",
                },
                "附加指令：",
                item.extra_prompt,
              )
              : "",
            div(
              { style: "margin-top:4px;font-size:12px;color:var(--text-muted);" },
              "创建于：",
              formatDate(item.created_at),
            ),
          ),
      });
    },
  );
}
