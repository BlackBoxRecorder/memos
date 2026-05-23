import van from "vanjs-core";
import { CreativeTab, openPromptCreate } from "./creative";
import { countWords } from "../helper/util";
import { renderMarkdown } from "../helper/markdown";
import {
  svgPlus,
  svgExternalLink,
  svgLogout,
  svgUpload,
} from "../helper/svgHelper";
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
  creativeItems,
} from "./state";
import { checkAuth, login, logout } from "./actions/auth";
import {
  openCreateForm,
  openImportExport,
  closeReadMore,
} from "./actions/memo";
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

// ====== ReadMore Modal ======

function ReadMoreModal() {
  return div(
    {
      class: "modal-overlay",
      style: () => (readMoreText.val != null ? "display:flex" : "display:none"),
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) closeReadMore();
      },
    },
    div(
      { class: "modal" },
      div(
        {
          style:
            "display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;",
        },
        h3({ style: "margin:0" }, "Memo"),
        button(
          {
            class: "btn btn-outline btn-sm",
            onclick: closeReadMore,
          },
          "\u2715",
        ),
      ),
      div({ class: "read-more-content" }, () =>
        span({
          class: "md-content",
          innerHTML: renderMarkdown(readMoreText.val || ""),
        }),
      ),
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
                    class: "btn btn-primary btn-sm",
                    title: "New Prompt",
                    onclick: openPromptCreate,
                  },
                  svgPlus(),
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
        if (activeTab.val === "memos" && memos.val.length > 0) {
          return TimelineSidebar();
        }
        if (activeTab.val === "creative" && creativeItems.val.length > 0) {
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
    () => (readMoreText.val != null ? ReadMoreModal() : ""),
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
checkAuth();
