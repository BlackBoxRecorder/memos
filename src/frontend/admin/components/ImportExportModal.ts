import van from "vanjs-core";
import {
  importExportOpen,
  importExportTab,
  exportLoading,
  importLoading,
  importResult,
  importError,
  dragOver,
  fileInputRef,
} from "../state";
import {
  handleExport,
  handleImportFile,
  closeImportExport,
} from "../actions/memo";

const { div, span, button, input, h3 } = van.tags;

export function ImportExportModal() {
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragOver.val = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImportFile(file);
  };

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) handleImportFile(file);
    target.value = "";
  };

  return div(
    {
      class: "modal-overlay",
      style: () => (importExportOpen.val ? "display:flex" : "display:none"),
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeImportExport();
      },
    },
    div(
      { class: "modal" },
      // Header
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
        },
        h3({ style: "margin:0" }, "数据导入/导出"),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: closeImportExport,
          },
          "\u2715",
        ),
      ),
      // Tab bar
      div(
        { class: "tab-bar" },
        button(
          {
            class: () =>
              "tab" + (importExportTab.val === "export" ? " active" : ""),
            onclick: () => {
              importExportTab.val = "export";
              importResult.val = null;
              importError.val = null;
            },
          },
          "导出",
        ),
        button(
          {
            class: () =>
              "tab" + (importExportTab.val === "import" ? " active" : ""),
            onclick: () => {
              importExportTab.val = "import";
              importResult.val = null;
              importError.val = null;
            },
          },
          "导入",
        ),
      ),
      // Tab content
      () => {
        if (importExportTab.val === "export") {
          return div(
            { style: "padding:20px 0;text-align:center;" },
            span(
              {
                style:
                  "display:block;font-size:14px;color:#666;margin-bottom:20px;",
              },
              "将所有备忘录和创意内容导出为文本文件",
            ),
            button(
              {
                class: "btn btn-primary",
                disabled: () => exportLoading.val,
                onclick: handleExport,
              },
              () => (exportLoading.val ? "导出中..." : "导出所有数据"),
            ),
            () =>
              importError.val
                ? div(
                    {
                      class: "form-error",
                      style: "margin-top:12px;",
                    },
                    importError.val,
                  )
                : "",
          );
        }

        // Import tab
        return div(
          { style: "padding:20px 0;" },
          () =>
            importResult.val
              ? div(
                  {
                    class: "import-export-result success",
                    style:
                      "background:#dcfce7;color:#166534;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;",
                  },
                  importResult.val,
                )
              : "",
          () =>
            importError.val
              ? div(
                  {
                    class: "import-export-result error",
                    style:
                      "background:#fef2f2;color:#c00;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;",
                  },
                  importError.val,
                )
              : "",
          // Drag & drop area
          div(
            {
              class: () =>
                "import-export-area" +
                (dragOver.val ? " drag-over" : "") +
                (importLoading.val ? " loading" : ""),
              ondragover: (e: DragEvent) => {
                e.preventDefault();
                dragOver.val = true;
              },
              ondragleave: () => (dragOver.val = false),
              ondrop: handleDrop,
              onclick: () => fileInputRef.current?.click(),
            },
            () =>
              importLoading.val
                ? div(
                    {
                      style:
                        "display:flex;flex-direction:column;align-items:center;gap:8px;color:#888;",
                    },
                    "导入中...",
                  )
                : div(
                    {
                      style:
                        "display:flex;flex-direction:column;align-items:center;gap:8px;color:#888;",
                    },
                    span({ style: "font-size:28px;" }, "\u21E7"),
                    span(
                      { style: "font-size:14px;" },
                      "拖拽文件到此处，或点击选择文件",
                    ),
                    span(
                      { style: "font-size:12px;color:#bbb;" },
                      "支持 .txt 文本文件",
                    ),
                  ),
            input({
              type: "file",
              accept: ".txt",
              style: "display:none;",
              onchange: handleFileChange,
              oncreate: (el: HTMLInputElement) => {
                fileInputRef.current = el;
              },
            }),
          ),
        );
      },
    ),
  );
}
