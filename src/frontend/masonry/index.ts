import van from "vanjs-core";
import { App } from "./components";
import { search, tag, windowWidth } from "./state";
import { loadTags, loadCount, fetchAndRender } from "./api";

// --- initialisation ---
const urlParams = new URLSearchParams(window.location.search);
const initialSearch = urlParams.get("search") || "";
const initialTag = urlParams.get("tag") || "";

search.val = initialSearch;
tag.val = initialTag;

const appEl = document.getElementById("app")!;
const root = App();
van.add(appEl, root);

// Load data
loadTags();
loadCount();
windowWidth.val = document.documentElement.clientWidth;
fetchAndRender(0);
