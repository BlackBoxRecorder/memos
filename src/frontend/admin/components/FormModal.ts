import van from "vanjs-core";
import { svgSparkle, svgSpinner } from "../../../helper/svgHelper";
import {
  formMode,
  formContent,
  formIsPublic,
  formTags,
  formTagInput,
  formError,
  formSaving,
  aiAvailable,
  aiSuggestedTags,
  formAiMenuOpen,
  formAiLoading,
  formAiPendingAction,
} from "../state";
import { saveForm, closeForm, addTag, removeTag } from "../actions/memo";
import { suggestTagsForContent, executeFormAiAction } from "../actions/ai";

const { div, span, button, input, textarea, h3, label } = van.tags;

export function FormModal() {
  const isEdit = () => formMode.val.type === "edit";
  const title = () => (isEdit() ? "编辑备忘录" : "新建备忘录");
  return div(
    {
      class: "modal-overlay",
      style: () =>
        formMode.val.type !== "closed" ? "display:flex" : "display:none",
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeForm();
      },
    },
    div(
      { class: "modal modal-wide" },
      h3(title),
      textarea({
        id: "form-content",
        placeholder: "在想些什么？",
        disabled: () => formSaving.val,
        value: formContent,
        style: "height: 240px; resize: none;",
        oninput: (e: Event) => {
          formContent.val = (e.target as HTMLTextAreaElement).value;
        },
        onblur: () => {
          if (aiAvailable.val) suggestTagsForContent();
        },
      }),
      // Current tags display area
      div(
        { class: "tag-display-area" },
        span(
          { class: "tag-count-label" },
          () => `标签 (${formTags.val.length})`,
        ),
        () =>
          formTags.val.length > 0
            ? div(
                { class: "tag-chips" },
                ...formTags.val.map((tag) =>
                  button(
                    {
                      class: "tag-chip active",
                      disabled: () => formSaving.val,
                      onclick: () => removeTag(tag),
                      title: "点击移除",
                    },
                    tag + " \u00D7",
                  ),
                ),
              )
            : span(
                { class: "tag-placeholder" },
                "暂无标签，在下方输入后按回车添加",
              ),
      ),
      // Tag input + AI toolbox button
      div(
        { class: "tag-input-row" },
        input({
          type: "text",
          id: "form-tag",
          placeholder: "输入标签名称，按回车添加",
          value: formTagInput,
          style: "height: 28px; resize: none; font-size: 12px;",
          disabled: () => formSaving.val,
          oninput: (e: Event) => {
            formTagInput.val = (e.target as HTMLInputElement).value;
          },
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const added = addTag(formTagInput.val);
              if (added) formTagInput.val = "";
            }
          },
          onfocus: () => {
            if (aiAvailable.val && formContent.val.trim()) {
              suggestTagsForContent();
            }
          },
        }),
        () =>
          aiAvailable.val
            ? div(
                {
                  class: "ai-toolbox-trigger",
                  style: "position:relative;display:inline-flex;",
                },
                button(
                  {
                    class: () =>
                      "ai-optimize-btn" + (formAiLoading.val ? " loading" : ""),
                    disabled: () => formAiLoading.val || formSaving.val,
                    title: "AI 工具箱",
                    onclick: (e: Event) => {
                      e.stopPropagation();
                      formAiMenuOpen.val = !formAiMenuOpen.val;
                    },
                  },
                  formAiLoading.val ? svgSpinner() : svgSparkle(),
                ),
                () =>
                  formAiMenuOpen.val
                    ? div(
                        {
                          class: "ai-toolbox-menu",
                          style:
                            "position:absolute;bottom:100%;right:0;" +
                            "background:#fff;border:1px solid #e5e5e5;" +
                            "border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" +
                            "padding:4px 0;z-index:10;min-width:120px;",
                        },
                        ...[
                          ["summarize", "摘要"],
                          ["rewrite", "改写"],
                          ["expand", "扩写"],
                          ["extract-keypoints", "要点提炼"],
                          ["polish", "润色"],
                        ].map(([action, label]) =>
                          button(
                            {
                              class: "ai-toolbox-item",
                              style:
                                "display:block;width:100%;padding:6px 14px;" +
                                "border:none;background:none;" +
                                "font-size:13px;color:#333;cursor:pointer;" +
                                "text-align:left;white-space:nowrap;",
                              onclick: (e: Event) => {
                                e.stopPropagation();
                                if (action === "rewrite") {
                                  formAiPendingAction.val = action!;
                                  return;
                                }
                                executeFormAiAction(action!);
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
                        () =>
                          formAiPendingAction.val === "rewrite"
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
                                  "风格：",
                                ),
                                ...[
                                  ["professional", "专业"],
                                  ["casual", "口语"],
                                  ["minimal", "极简"],
                                  ["academic", "学术"],
                                ].map(([style, styleLabel]) =>
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
                                        formAiPendingAction.val = "";
                                        executeFormAiAction("rewrite", style);
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
                                    styleLabel,
                                  ),
                                ),
                              )
                            : "",
                      )
                    : "",
              )
            : "",
      ),
      // AI Tag suggestions
      () =>
        aiSuggestedTags.val.length > 0
          ? div(
              { class: "ai-tag-suggestions" },
              span(
                {
                  style:
                    "font-size:11px;color:#999;margin-right:4px;line-height:24px;",
                },
                "AI\u5EFA\u8BAE:",
              ),
              ...aiSuggestedTags.val
                .filter((tag) => !formTags.val.includes(tag))
                .map((tag) =>
                  button(
                    {
                      class: "tag-chip",
                      onclick: () => {
                        addTag(tag);
                      },
                    },
                    "+" + tag,
                  ),
                ),
            )
          : "",
      div(
        { class: "form-row" },
        label(
          { class: "form-check" },
          input({
            type: "checkbox",
            id: "form-is-public",
            checked: formIsPublic,
            disabled: () => formSaving.val,
            oninput: (e: Event) =>
              (formIsPublic.val = (e.target as HTMLInputElement).checked),
          }),
          "公开",
        ),
        div({ style: "flex:1" }),
        button({ class: "btn btn-outline btn-sm", onclick: closeForm }, "取消"),
        button(
          {
            class: "btn btn-primary btn-sm",
            id: "form-save-btn",
            onclick: saveForm,
            disabled: () => formSaving.val,
          },
          () => (formSaving.val ? "保存中..." : "保存"),
        ),
      ),
      () => (formError.val ? div({ class: "form-error" }, formError.val) : ""),
    ),
  );
}
