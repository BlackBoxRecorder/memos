import { Hono } from "hono";
import { initDb } from "./db";
import { authApp } from "./api/auth";
import { memosApp } from "./api/memos";
import { aiApp } from "./api/ai";
import { creativeApp } from "./api/creative";
import { exportImportApp } from "./api/export-import";
import { initEmbeddingCache } from "./ai/embeddings";
import { initSeedData } from "./init/seed";

const PORT = parseInt(process.env.PORT || "3020");
const STATIC_BASE = import.meta.dir;
const DIST_BASE = `${import.meta.dir}/../dist`;

async function serveHtml(
  filePath: string,
  urlDir: string = "/",
): Promise<Response> {
  try {
    const file = Bun.file(`${STATIC_BASE}${filePath}`);
    let html = await file.text();
    // 注入 base 标签确保深层路径下脚本 src 解析正确
    if (urlDir !== "/") {
      html = html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" />\n<base href="${urlDir}">`,
      );
    }
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error(`[serveHtml] Failed to serve ${filePath}:`, e);
    return new Response(`Not Found: ${filePath}`, { status: 404 });
  }
}

const app = new Hono({ strict: false });

// API 路由 — 子应用挂载
app.route("/api/auth", authApp);
app.route("/api/ai", aiApp);
app.route("/api/memos", memosApp);
app.route("/api/creative", creativeApp);
app.route("/api", exportImportApp);

// 静态文件 + 页面路由
// 静态资源：favicon（首页和 admin 均支持）
function serveFavicon(): Response {
  const file = Bun.file(`${STATIC_BASE}/favicon.svg`);
  return new Response(file, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

app.get("/favicon.svg", serveFavicon);
app.get("/admin/favicon.svg", serveFavicon);

// /admin/app.js → 预构建 JS bundle
app.get("/admin/app.js", async (c) => {
  const file = Bun.file(`${DIST_BASE}/admin/app.js`);
  if (!(await file.exists())) {
    return new Response(
      "JS bundle not found. Please run: bun run build:admin",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(file, {
    headers: { "Content-Type": "application/javascript" },
  });
});

// /admin 与 /admin/ → admin SPA
app.get("/admin", async (c) =>
  serveHtml("/frontend/admin/index.html", "/admin/"),
);
app.get("/admin/", async (c) =>
  serveHtml("/frontend/admin/index.html", "/admin/"),
);
app.get("/admin/index.html", async (c) =>
  serveHtml("/frontend/admin/index.html", "/admin/"),
);

// /index.js → 预构建 JS bundle
app.get("/index.js", async (c) => {
  const file = Bun.file(`${DIST_BASE}/masonry/index.js`);
  if (!(await file.exists())) {
    return new Response(
      "JS bundle not found. Please run: bun run build:masonry",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(file, {
    headers: { "Content-Type": "application/javascript" },
  });
});

// / → masonry 首页
app.get("/", async (c) => serveHtml("/frontend/masonry/index.html", "/"));
app.get("/index.html", async (c) =>
  serveHtml("/frontend/masonry/index.html", "/"),
);

// 共享 CSS 文件
app.get("/frontend/shared/styles/common.css", async (c) => {
  const file = Bun.file(`${STATIC_BASE}/frontend/shared/styles/common.css`);
  return new Response(file, {
    headers: { "Content-Type": "text/css; charset=utf-8" },
  });
});

// admin SPA 深层链接
app.notFound(async (c) => {
  const path = c.req.path;
  if (path.startsWith("/admin/")) {
    return serveHtml("/frontend/admin/index.html", "/admin/");
  }
  return c.json({ error: "Not Found" }, 404);
});

// 初始化数据库
initDb();

// 首次启动种子数据（内置 prompts + 示例 memos）
initSeedData();

// 初始化向量缓存（含历史 memo 嵌入向量生成）
await initEmbeddingCache();

// 启动服务器
Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

console.log(`Memos server running at http://localhost:${PORT}`);
