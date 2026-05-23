import { api } from "../../helper/util";
import {
  authenticated,
  globalError,
  memos,
  formMode,
  deleteConfirmId,
} from "../state";
import { loadMemos } from "./memo";
import { checkAiStatus, loadAiModels } from "./ai";

export async function checkAuth(): Promise<void> {
  try {
    const data = await api<{ authenticated: boolean }>("api/auth/check");
    authenticated.val = data.authenticated;
    if (data.authenticated) {
      await loadMemos();
      // Fire-and-forget: AI availability is non-blocking for the main UI
      checkAiStatus();
      loadAiModels();
    }
  } catch {
    authenticated.val = false;
  }
}

export async function login(key: string): Promise<void> {
  try {
    await api("api/auth/login", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
    authenticated.val = true;
    globalError.val = null;
    await loadMemos();
    // Fire-and-forget: AI availability is non-blocking for the main UI
    checkAiStatus();
    loadAiModels();
  } catch (err) {
    globalError.val = (err as Error).message;
  }
}

export async function logout(): Promise<void> {
  await api("api/auth/logout", { method: "POST" });
  authenticated.val = false;
  memos.val = [];
  formMode.val = { type: "closed" };
  deleteConfirmId.val = null;
}
