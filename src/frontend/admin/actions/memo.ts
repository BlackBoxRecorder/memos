import { api, apiUrl } from "../../../helper/util";
import type { Memo } from "../../../model";
import {
  loading,
  globalError,
  memos,
  readMoreText,
  deleteConfirmId,
  deleteDeleting,
  formMode,
  formContent,
  formIsPublic,
  formTags,
  formTagInput,
  formError,
  formSaving,
  aiSuggestedTags,
  importExportOpen,
  exportLoading,
  importLoading,
  importResult,
  importError,
  dragOver,
  fileInputRef,
  importExportTab,
  formAiMenuOpen,
  formAiMenuPos,
  formAiLoading,
  formAiPendingAction,
  tagAutocompleteOpen,
  tagAutocompleteHighlight,
  aiMenuPos,
} from "../state";

// ====== Memo CRUD ======

export async function loadMemos(): Promise<void> {
  loading.val = true;
  try {
    const data = await api<{ memos: Memo[] }>("api/memos?all=true");
    memos.val = data.memos;
    globalError.val = null;
  } catch (err) {
    globalError.val = (err as Error).message;
  } finally {
    loading.val = false;
  }
}

export async function saveForm(): Promise<void> {
  if (!formContent.val.trim()) {
    formError.val = "内容不能为空";
    return;
  }
  formSaving.val = true;
  formError.val = null;
  try {
    const body = JSON.stringify({
      content: formContent.val.trim(),
      is_public: formIsPublic.val,
      tags: formTags.val,
    });
    if (formMode.val.type === "create") {
      await api("api/memos", { method: "POST", body });
    } else if (formMode.val.type === "edit") {
      await api(`api/memos/${formMode.val.id}`, { method: "PUT", body });
    }
    closeForm();
    await loadMemos();
  } catch (err) {
    formError.val = (err as Error).message;
  } finally {
    formSaving.val = false;
  }
}

export async function toggleVisibility(memo: Memo): Promise<void> {
  try {
    await api(`api/memos/${memo.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_public: !memo.is_public }),
    });
    await loadMemos();
  } catch (err) {
    globalError.val = (err as Error).message;
  }
}

export async function togglePin(memo: Memo): Promise<void> {
  try {
    await api(`api/memos/${memo.id}/pin`, {
      method: "PUT",
      body: JSON.stringify({ pinned: !memo.pinned_at }),
    });
    await loadMemos();
  } catch (err) {
    globalError.val = (err as Error).message;
  }
}

export async function deleteMemo(id: number): Promise<void> {
  deleteDeleting.val = true;
  try {
    await api(`api/memos/${id}`, { method: "DELETE" });
    deleteConfirmId.val = null;
    await loadMemos();
  } catch (err) {
    globalError.val = (err as Error).message;
  } finally {
    deleteDeleting.val = false;
  }
}

// ====== Form Lifecycle ======

export function addTag(tag: string): boolean {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return false;
  if (formTags.val.includes(trimmed)) return false;
  formTags.val = [...formTags.val, trimmed];
  return true;
}

export function removeTag(tag: string): void {
  formTags.val = formTags.val.filter((t) => t !== tag);
}

export function openCreateForm(): void {
  formMode.val = { type: "create" };
  formContent.val = "";
  formIsPublic.val = false;
  formTags.val = [];
  formTagInput.val = "";
  formError.val = null;
  formAiMenuOpen.val = false;
  formAiMenuPos.val = null;
  formAiLoading.val = false;
  formAiPendingAction.val = "";
  tagAutocompleteOpen.val = false;
  tagAutocompleteHighlight.val = -1;
  document.body.style.overflow = "hidden";
}

export function openEditForm(memo: Memo): void {
  formMode.val = { type: "edit", id: memo.id };
  formContent.val = memo.content;
  formIsPublic.val = memo.is_public;
  formTags.val = [...memo.tags];
  formTagInput.val = "";
  formError.val = null;
  aiSuggestedTags.val = [];
  formAiMenuOpen.val = false;
  formAiMenuPos.val = null;
  formAiLoading.val = false;
  formAiPendingAction.val = "";
  tagAutocompleteOpen.val = false;
  tagAutocompleteHighlight.val = -1;
  document.body.style.overflow = "hidden";
}

export function closeForm(): void {
  formMode.val = { type: "closed" };
  formContent.val = "";
  formIsPublic.val = false;
  formTags.val = [];
  formTagInput.val = "";
  formError.val = null;
  aiSuggestedTags.val = [];
  formAiMenuOpen.val = false;
  formAiMenuPos.val = null;
  formAiLoading.val = false;
  formAiPendingAction.val = "";
  tagAutocompleteOpen.val = false;
  tagAutocompleteHighlight.val = -1;
  aiMenuPos.val = null;
  document.body.style.overflow = "";
}

// ====== Read More ======

export function openReadMore(text: string): void {
  readMoreText.val = text;
  document.body.style.overflow = "hidden";
}

export function closeReadMore(): void {
  readMoreText.val = null;
  document.body.style.overflow = "";
}

// ====== Import/Export ======

export function openImportExport(): void {
  importExportTab.val = "export";
  importResult.val = null;
  importError.val = null;
  importExportOpen.val = true;
}

export function closeImportExport(): void {
  importExportOpen.val = false;
  importResult.val = null;
  importError.val = null;
}

export async function handleExport(): Promise<void> {
  exportLoading.val = true;
  try {
    const resp = await fetch(apiUrl("api/export"), {
      credentials: "same-origin",
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Export failed" }));
      throw new Error(err.error || `Export failed (${resp.status})`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "memos-export-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    importError.val = (err as Error).message;
  } finally {
    exportLoading.val = false;
  }
}

export async function handleImportFile(file: File): Promise<void> {
  importLoading.val = true;
  importResult.val = null;
  importError.val = null;
  try {
    const fileName = file.name.toLowerCase();
    const isFlomoHtml = fileName.endsWith(".html") || fileName.endsWith(".htm");
    const endpoint = isFlomoHtml ? "api/import-flomo" : "api/import";

    const formData = new FormData();
    formData.append("file", file);
    const resp = await fetch(apiUrl(endpoint), {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Import failed");
    }
    importResult.val = data.message || `Imported ${data.imported} record(s).`;
    await loadMemos();
  } catch (err) {
    importError.val = (err as Error).message;
  } finally {
    importLoading.val = false;
  }
}
