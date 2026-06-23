import van from "vanjs-core";
import { App, initTheme } from "./components";
import { search, tag, windowWidth, authenticated } from "./state";
import { loadTags, loadCount, fetchAndRender } from "./api";
import { apiUrl } from "../../helper/util";

// --- auth check ---
async function checkAuth(): Promise<void> {
  try {
    const resp = await fetch(apiUrl("api/auth/check"), {
      credentials: "same-origin",
    });
    if (resp.ok) {
      const data: { authenticated: boolean } = await resp.json();
      authenticated.val = data.authenticated;
    } else {
      authenticated.val = false;
    }
  } catch {
    authenticated.val = false;
  }
}

// --- initialisation ---
const urlParams = new URLSearchParams(window.location.search);
const initialSearch = urlParams.get("search") || "";
const initialTag = urlParams.get("tag") || "";

search.val = initialSearch;
tag.val = initialTag;

initTheme();

const appEl = document.getElementById("app")!;
const root = App();
van.add(appEl, root);

// Load data — wait for auth check first to avoid duplicate requests
(async () => {
  const authPromise = checkAuth();
  windowWidth.val = document.documentElement.clientWidth;
  await authPromise;
  loadTags();
  loadCount();
  fetchAndRender(0);
})();
