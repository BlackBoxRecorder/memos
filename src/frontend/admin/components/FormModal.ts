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
  formAiMenuPos,
  formAiLoading,
  availableTags,
  tagsLoaded,
  tagAutocompleteOpen,
  tagAutocompleteHighlight,
} from "../state";
import { saveForm, closeForm, addTag, removeTag } from "../actions/memo";
import {
  suggestTagsForContent,
  executeFormAiAction,
  openFormAiMenu,
  closeFormAiMenu,
} from "../actions/ai";
import { loadTags } from "../actions/creative-core";

const { div, span, button, input, textarea, h3, label } = van.tags;

export function FormModal() {
  // Load available tags for autocomplete
  if (!tagsLoaded.val) {
    tagsLoaded.val = true;
    loadTags();
  }

  const isEdit = () => formMode.val.type === "edit";
  const title = () => (isEdit() ? "编辑备忘录" : "新建备忘录");
  // Helper: compute filtered tag suggestions
  function getSuggestions(): string[] {
    const input = formTagInput.val.trim().toLowerCase();
    if (!input) return [];
    return availableTags.val
      .filter(
        (t) => !formTags.val.includes(t) && t.toLowerCase().includes(input),
      )
      .slice(0, 8);
  }

  // Helper: add tag from suggestion or input
  function selectSuggestion(tag: string): void {
    const added = addTag(tag);
    if (added) {
      formTagInput.val = "";
    }
    tagAutocompleteOpen.val = false;
    tagAutocompleteHighlight.val = -1;
  }

  // Blur timer for delayed close
  let blurTimer: ReturnType<typeof setTimeout> | null = null;

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
        div(
          { style: "position:relative;flex:1;" },
          input({
            type: "text",
            id: "form-tag",
            placeholder: "输入标签名称，按回车添加",
            value: formTagInput,
            style: "height: 28px; resize: none; font-size: 12px;width:100%;",
            disabled: () => formSaving.val,
            oninput: (e: Event) => {
              formTagInput.val = (e.target as HTMLInputElement).value;
              const suggestions = getSuggestions();
              tagAutocompleteOpen.val = suggestions.length > 0;
              tagAutocompleteHighlight.val = -1;
            },
            onkeydown: (e: KeyboardEvent) => {
              const suggestions = getSuggestions();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (suggestions.length > 0) {
                  tagAutocompleteOpen.val = true;
                  tagAutocompleteHighlight.val = Math.min(
                    tagAutocompleteHighlight.val + 1,
                    suggestions.length - 1,
                  );
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                tagAutocompleteHighlight.val = Math.max(
                  tagAutocompleteHighlight.val - 1,
                  -1,
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (
                  tagAutocompleteOpen.val &&
                  tagAutocompleteHighlight.val >= 0 &&
                  tagAutocompleteHighlight.val < suggestions.length
                ) {
                  selectSuggestion(suggestions[tagAutocompleteHighlight.val]!);
                } else {
                  const added = addTag(formTagInput.val);
                  if (added) formTagInput.val = "";
                  tagAutocompleteOpen.val = false;
                  tagAutocompleteHighlight.val = -1;
                }
              } else if (e.key === "Escape") {
                tagAutocompleteOpen.val = false;
                tagAutocompleteHighlight.val = -1;
              } else if (e.key === "Tab") {
                if (tagAutocompleteOpen.val && suggestions.length > 0) {
                  e.preventDefault();
                  const idx =
                    tagAutocompleteHighlight.val >= 0
                      ? tagAutocompleteHighlight.val
                      : 0;
                  selectSuggestion(suggestions[idx]!);
                }
              }
            },
            onfocus: () => {
              if (blurTimer) {
                clearTimeout(blurTimer);
                blurTimer = null;
              }
              if (aiAvailable.val && formContent.val.trim()) {
                suggestTagsForContent();
              }
              const suggestions = getSuggestions();
              if (suggestions.length > 0) {
                tagAutocompleteOpen.val = true;
              }
            },
            onblur: () => {
              blurTimer = setTimeout(() => {
                tagAutocompleteOpen.val = false;
                tagAutocompleteHighlight.val = -1;
              }, 200);
            },
          }),
          // Autocomplete dropdown
          () =>
            tagAutocompleteOpen.val
              ? div(
                  {
                    class: "tag-autocomplete",
                    style:
                      "position:absolute;top:100%;left:0;right:0;" +
                      "background:var(--bg-primary);border:1px solid var(--border-color);" +
                      "border-radius:6px;box-shadow:var(--dropdown-shadow);" +
                      "max-height:200px;overflow-y:auto;z-index:50;",
                  },
                  () => {
                    const suggestions = getSuggestions();
                    if (suggestions.length === 0) {
                      tagAutocompleteOpen.val = false;
                      return div({});
                    }
                    return div(
                      {},
                      ...suggestions.map((t, i) =>
                        div(
                          {
                            class: () =>
                              "tag-autocomplete-item" +
                              (i === tagAutocompleteHighlight.val
                                ? " highlighted"
                                : ""),
                            style: () =>
                              "padding:6px 12px;font-size:13px;color:var(--text-primary);" +
                              "cursor:pointer;" +
                              "background:" +
                              (i === tagAutocompleteHighlight.val
                                ? "var(--bg-hover)"
                                : "transparent") +
                              ";",
                            onmousedown: (e: Event) => {
                              e.preventDefault();
                              selectSuggestion(t);
                            },
                          },
                          t,
                        ),
                      ),
                    );
                  },
                )
              : "",
        ),
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
                      if (formAiMenuOpen.val) {
                        closeFormAiMenu();
                        formAiMenuOpen.val = false;
                      } else {
                        openFormAiMenu(e.currentTarget as HTMLElement);
                        formAiMenuOpen.val = true;
                      }
                    },
                  },
                  formAiLoading.val ? svgSpinner() : svgSparkle(),
                ),
                () =>
                  formAiMenuOpen.val && formAiMenuPos.val
                    ? div(
                        {
                          class: "ai-toolbox-menu",
                          style: () =>
                            "position:fixed;top:" +
                            formAiMenuPos.val!.top +
                            "px;left:" +
                            formAiMenuPos.val!.left +
                            "px;" +
                            "background:var(--bg-primary);border:1px solid var(--border-color);" +
                            "border-radius:6px;box-shadow:var(--dropdown-shadow);" +
                            "padding:4px 0;z-index:101;min-width:120px;",
                        },
                        ...[
                          ["summarize", "\u6458\u8981"],
                          ["expand", "\u6269\u5199"],
                          ["extract-keypoints", "\u8981\u70B9\u63D0\u70BC"],
                          ["polish", "\u6DA6\u8272"],
                        ].map(([action, label]) =>
                          button(
                            {
                              class: "ai-toolbox-item",
                              style:
                                "display:block;width:100%;padding:6px 14px;" +
                                "border:none;background:none;" +
                                "font-size:13px;color:var(--text-primary);cursor:pointer;" +
                                "text-align:left;white-space:nowrap;",
                              onclick: (e: Event) => {
                                e.stopPropagation();
                                executeFormAiAction(action!);
                              },
                              onmouseenter: (e: Event) => {
                                (e.target as HTMLElement).style.background =
                                  "var(--bg-hover)";
                              },
                              onmouseleave: (e: Event) => {
                                (e.target as HTMLElement).style.background =
                                  "none";
                              },
                            },
                            label,
                          ),
                        ),
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
                    "font-size:11px;color:var(--text-muted);margin-right:4px;line-height:24px;",
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
