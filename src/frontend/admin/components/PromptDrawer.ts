import van from "vanjs-core";
import { truncate } from "../../../helper/util";
import type { Prompt } from "../../../model";
import {
    prompts,
    promptDrawerOpen,
    promptModalSelectedId,
    promptFormMode,
    promptFormTitle,
    promptFormContent,
    promptFormError,
    promptFormSaving,
} from "../state";
import {
    openPromptCreate,
    openPromptEdit,
    closePromptForm,
    savePromptForm,
    deletePrompt,
} from "../actions/creative-core";

const { div, span, button, h3, input, textarea } = van.tags;

// ====== Scroll Lock Helpers ======

function closeModal() {
    promptDrawerOpen.val = false;
    closePromptForm();
    document.body.style.overflow = "";
}

// ====== PromptList (Left Panel) ======

function PromptList() {
    return div(
        {
            style:
                "width:260px;min-width:260px;border-right:1px solid var(--border-color);" +
                "display:flex;flex-direction:column;overflow:hidden;",
        },
        // New prompt button
        div(
            { style: "padding:12px 16px;" },
            button(
                {
                    class: "btn btn-primary btn-sm",
                    style: "width:100%;",
                    onclick: () => openPromptCreate(),
                },
                "+ 新建提示词",
            ),
        ),
        // Prompt list
        div(
            {
                class: "hide-scrollbar",
                style: "flex:1;overflow-y:auto;padding:0 16px 16px;",
            },
            () =>
                prompts.val.length === 0
                    ? div(
                        {
                            style:
                                "text-align:center;color:var(--text-muted);padding:40px 0;",
                        },
                        "还没有提示词",
                    )
                    : div(
                        { style: "display:flex;flex-direction:column;gap:8px;" },
                        ...prompts.val.map((prompt: Prompt) => {
                            const isSelected =
                                promptModalSelectedId.val === prompt.id;
                            return div(
                                {
                                    style:
                                        "padding:12px;background:var(--bg-secondary);border-radius:8px;" +
                                        "border:1px solid var(--border-color);cursor:pointer;" +
                                        (isSelected
                                            ? "border-color:var(--color-primary);background:color-mix(in srgb, var(--color-primary) 10%, var(--bg-secondary));"
                                            : ""),
                                    onclick: () => openPromptEdit(prompt),
                                },
                                div(
                                    {
                                        style:
                                            "font-weight:500;font-size:14px;color:var(--text-primary);" +
                                            "margin-bottom:4px;",
                                    },
                                    prompt.title,
                                ),
                                div(
                                    {
                                        style:
                                            "font-size:12px;color:var(--text-muted);line-height:1.4;",
                                    },
                                    truncate(prompt.content, 60),
                                ),
                            );
                        }),
                    ),
        ),
    );
}

// ====== PromptEditor (Right Panel) ======

function PromptEditor() {
    return div(
        {
            style:
                "flex:1;display:flex;flex-direction:column;overflow:hidden;padding:20px;",
        },
        () => {
            const mode = promptFormMode.val;
            if (mode.type === "closed" && promptModalSelectedId.val === null) {
                // Empty state
                return div(
                    {
                        style:
                            "flex:1;display:flex;align-items:center;justify-content:center;" +
                            "color:var(--text-muted);font-size:14px;",
                    },
                    "选择一个提示词进行编辑，或点击左侧「新建提示词」",
                );
            }

            const isEdit = mode.type === "edit";
            const formTitle = isEdit ? "编辑提示词" : "新建提示词";

            return div(
                { style: "flex:1;display:flex;flex-direction:column;gap:12px;" },
                // Form header
                div(
                    {
                        style:
                            "display:flex;align-items:center;justify-content:space-between;",
                    },
                    h3({ style: "margin:0;font-size:15px;" }, formTitle),
                    isEdit
                        ? button(
                            {
                                class: "btn btn-outline btn-sm",
                                style:
                                    "font-size:11px;padding:2px 8px;color:var(--danger-color);border-color:var(--danger-color);",
                                onclick: () => {
                                    if (
                                        promptModalSelectedId.val !== null &&
                                        confirm(
                                            `确定要删除提示词吗？`,
                                        )
                                    ) {
                                        deletePrompt(promptModalSelectedId.val);
                                    }
                                },
                            },
                            "删除",
                        )
                        : "",
                ),
                // Title input
                input({
                    type: "text",
                    class: "form-input",
                    placeholder: "提示词标题",
                    value: promptFormTitle,
                    disabled: () => promptFormSaving.val,
                    oninput: (e: Event) =>
                        (promptFormTitle.val = (e.target as HTMLInputElement).value),
                }),
                // Content textarea
                textarea({
                    class: "form-input",
                    placeholder: "提示词内容（AI 指令）",
                    style: "flex:1;min-height:180px;resize:none;",
                    value: promptFormContent,
                    disabled: () => promptFormSaving.val,
                    oninput: (e: Event) =>
                    (promptFormContent.val = (
                        e.target as HTMLTextAreaElement
                    ).value),
                }),
                // Error message
                () =>
                    promptFormError.val
                        ? div(
                            {
                                style:
                                    "color:var(--danger-color);font-size:12px;padding:4px 0;",
                            },
                            promptFormError.val,
                        )
                        : "",
                // Action buttons
                div(
                    {
                        style:
                            "display:flex;justify-content:flex-end;gap:8px;padding-top:4px;",
                    },
                    button(
                        {
                            class: "btn btn-outline btn-sm",
                            disabled: () => promptFormSaving.val,
                            onclick: () => {
                                closePromptForm();
                            },
                        },
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
            );
        },
    );
}

// ====== PromptModal ======

export function PromptModal() {
    // Lock body scroll when modal opens, unlock when closed
    document.body.style.overflow = "hidden";
    van.derive(() => {
        if (!promptDrawerOpen.val) document.body.style.overflow = "";
    });
    return div(
        {
            class: "modal-overlay",
            onclick: (e: Event) => {
                if (e.target === e.currentTarget) closeModal();
            },
        },
        div(
            {
                style:
                    "width:720px;max-width:90vw;height:70vh;max-height:600px;" +
                    "background:var(--bg-primary);border-radius:12px;" +
                    "box-shadow:0 8px 32px rgba(0,0,0,0.12);" +
                    "display:flex;flex-direction:column;overflow:hidden;" +
                    "animation:fadeIn 0.15s ease-out;",
            },
            // Header
            div(
                {
                    style:
                        "display:flex;align-items:center;justify-content:space-between;" +
                        "padding:16px 20px;border-bottom:1px solid var(--border-color);",
                },
                h3({ style: "margin:0;font-size:16px;" }, "提示词管理"),
                button(
                    {
                        class: "btn btn-outline btn-sm",
                        style: "padding:4px 8px;",
                        onclick: closeModal,
                    },
                    "\u2715",
                ),
            ),
            // Body: left-right split
            div(
                {
                    style:
                        "flex:1;display:flex;overflow:hidden;",
                },
                PromptList(),
                PromptEditor(),
            ),
        ),
    );
}
