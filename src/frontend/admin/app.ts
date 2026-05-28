import van from "vanjs-core";
import { CreativeTab } from "./creative";
import { countWords } from "../../helper/util";
import { renderMarkdown } from "../../helper/markdown";
import {
  svgPlus,
  svgExternalLink,
  svgLogout,
  svgUpload,
  svgSun,
  svgMoon,
} from "../../helper/svgHelper";
import {
  authenticated,
  globalError,
  loading,
  memos,
  formMode,
  readMoreText,
  importExportOpen,
  activeTab,
  aiModels,
  aiPanelMemoId,
  aiPanelResult,
  aiPanelLoading,
  aiPanelError,
  formAiMenuOpen,
  theme,
  promptDrawerOpen,
} from "./state";
import { checkAuth, login, logout } from "./actions/auth";
import {
  openCreateForm,
  openImportExport,
  closeReadMore,
} from "./actions/memo";
import { ReadMoreModal } from "../shared/components/ReadMoreModal";
import { closeAiPanel, closeAiMenu, closeFormAiMenu } from "./actions/ai";
import { ModelSelector } from "./components/ModelSelector";
import { FormModal } from "./components/FormModal";
import { MemoCard } from "./components/MemoCard";
import { ImportExportModal } from "./components/ImportExportModal";
import {
  TimelineSidebar,
  CreativeTimelineSidebar,
} from "./components/TimelineSidebar";

const { div, span, button, input, a, h1, h3 } = van.tags;

const siteUrl = "/";

// ====== Theme ======
const THEME_KEY = "memos-theme";

function initTheme(): void {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") {
    theme.val = saved as "light" | "dark";
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    theme.val = "dark";
  }
  applyTheme();
}

function applyTheme(): void {
  document.documentElement.dataset.theme = theme.val;
  localStorage.setItem(THEME_KEY, theme.val);
}

function toggleTheme(): void {
  theme.val = theme.val === "dark" ? "light" : "dark";
  applyTheme();
}

// 跨标签页实时同步主题
window.addEventListener("storage", (e) => {
  if (e.key === THEME_KEY && (e.newValue === "dark" || e.newValue === "light")) {
    theme.val = e.newValue as "light" | "dark";
    document.documentElement.dataset.theme = theme.val;
  }
});

// ====== LoginPage ======

function LoginPage() {
  const keyInput = input({
    type: "password",
    id: "login-key",
    placeholder: "密钥",
    autofocus: true,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === "Enter") login((keyInput as HTMLInputElement).value);
    },
  });
  return div(
    { class: "login-wrap" },
    div(
      { class: "login-card" },
      h1("Memos Admin"),
      div({ class: "sub" }, "请输入密钥以继续"),
      keyInput,
      button(
        {
          id: "login-btn",
          onclick: () => login((keyInput as HTMLInputElement).value),
        },
        "登录",
      ),
      () => (globalError.val ? div({ class: "error" }, globalError.val) : ""),
    ),
  );
}

// ====== AdminPage ======

function AdminPage() {
  return div(
    div(
      { class: "admin-topbar" },
      div(
        { class: "admin-topbar-inner" },
        div(
          { class: "topbar-left" },
          span({ class: "title" }, "Memos Admin"),
          () => {
            const total = memos.val.length;
            const totalWords = memos.val.reduce(
              (sum, m) => sum + countWords(m.content),
              0,
            );
            return span(
              { class: "admin-stats" },
              `${total} memos · ${totalWords.toLocaleString()} words`,
            );
          },
        ),
        div(
          { class: "actions" },
          () => (aiModels.val.length > 0 ? ModelSelector() : ""),
          () =>
            activeTab.val === "memos"
              ? button(
                {
                  class: "btn btn-primary btn-sm",
                  title: "New Memo",
                  onclick: openCreateForm,
                },
                svgPlus(),
              )
              : button(
                {
                  class: "btn btn-outline btn-sm",
                  title: "管理提示词",
                  style: "font-size:16px;line-height:1;",
                  onclick: () => (promptDrawerOpen.val = !promptDrawerOpen.val),
                },
                "\u2699",
              ),
          button(
            {
              class: "btn btn-outline btn-sm",
              title: "导入/导出",
              onclick: openImportExport,
            },
            svgUpload(),
          ),
          a(
            {
              href: siteUrl,
              class: "btn btn-outline btn-sm",
              title: "查看网站",
            },
            svgExternalLink(),
          ),
          button(
            {
              class: "btn btn-outline btn-sm",
              title: () =>
                theme.val === "dark" ? "切换到亮色模式" : "切换到暗色模式",
              onclick: toggleTheme,
            },
            () => (theme.val === "dark" ? svgSun() : svgMoon()),
          ),
          button(
            {
              class: "btn btn-outline btn-sm",
              title: "退出登录",
              onclick: logout,
            },
            svgLogout(),
          ),
        ),
      ),
    ),
    div(
      { class: "admin-layout" },
      () => {
        if (activeTab.val === "memos") {
          return TimelineSidebar();
        }
        if (activeTab.val === "creative") {
          return CreativeTimelineSidebar();
        }
        return "";
      },
      div(
        { class: "admin-container" },
        // Tab bar
        div(
          { class: "tab-bar" },
          button(
            {
              class: () => "tab" + (activeTab.val === "memos" ? " active" : ""),
              onclick: () => (activeTab.val = "memos"),
            },
            "Memo",
          ),
          button(
            {
              class: () =>
                "tab" + (activeTab.val === "creative" ? " active" : ""),
              onclick: () => (activeTab.val = "creative"),
            },
            "Creative",
          ),
        ),
        // Global error banner
        () =>
          globalError.val
            ? div(
              { class: "error-banner" },
              globalError.val,
              button(
                {
                  class: "btn btn-sm btn-outline",
                  style: "margin-left:8px",
                  onclick: () => (globalError.val = null),
                },
                "关闭",
              ),
            )
            : "",
        // Tab content
        () =>
          activeTab.val === "memos"
            ? div(() => {
              if (loading.val)
                return div({ class: "status-msg" }, "Loading memos...");
              if (memos.val.length === 0 && formMode.val.type === "closed")
                return div(
                  { class: "empty-state" },
                  "还没有 Memos，创建第一条吧！",
                );
              return div(memos.val.map(MemoCard));
            })
            : CreativeTab(),
      ),
    ),
    () => (formMode.val.type !== "closed" ? FormModal() : ""),
    () =>
      ReadMoreModal({
        text: readMoreText,
        onClose: closeReadMore,
      }),
    () => (importExportOpen.val ? ImportExportModal() : ""),
  );
}

// ====== Mount ======
const appEl = document.getElementById("app")!;
van.add(appEl, () =>
  authenticated.val === null
    ? div({ class: "status-msg", style: "padding:60px" }, "Checking...")
    : !authenticated.val
      ? LoginPage()
      : AdminPage(),
);

// ====== Init ======
initTheme();
checkAuth();

// Close AI toolbox dropdown when clicking outside
document.addEventListener("click", (e: Event) => {
  const target = e.target as HTMLElement;
  // Close MemoCard AI menu
  if (
    aiPanelMemoId.val !== null &&
    !aiPanelResult.val &&
    !aiPanelLoading.val &&
    !aiPanelError.val
  ) {
    if (!target.closest(".ai-toolbox-trigger")) {
      closeAiMenu();
      closeAiPanel();
    }
  }
  // Close FormModal AI menu
  if (formAiMenuOpen.val) {
    if (!target.closest(".ai-toolbox-trigger")) {
      closeFormAiMenu();
      formAiMenuOpen.val = false;
    }
  }
});
