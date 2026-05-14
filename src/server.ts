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

// 客户端 TS 打包（含 import 解析）+ mtime 缓存
const buildCache = new Map<string, { js: string; mtime: number }>();

async function buildClientJs(srcPath: string): Promise<string | null> {
  try {
    const file = Bun.file(srcPath);
    if (!(await file.exists())) return null;

    const mtime = file.lastModified;

    const cached = buildCache.get(srcPath);
    if (cached && cached.mtime === mtime) {
      return cached.js;
    }

    const result = await Bun.build({
      entrypoints: [srcPath],
      target: "browser",
      format: "esm",
      splitting: false,
      minify: false,
    });

    if (!result.success) {
      for (const log of result.logs) {
        console.error(`Build error in ${srcPath}:`, log);
      }
      return null;
    }

    const js = await result.outputs[0]?.text();
    if (!js) return null;

    buildCache.set(srcPath, { js, mtime });
    return js;
  } catch (e) {
    console.error(`Build failed for ${srcPath}:`, e);
    return null;
  }
}

function serveHtml(path: string): Response {
  try {
    const file = Bun.file(`${STATIC_BASE}${path}`);
    return new Response(file, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

async function serveJs(path: string): Promise<Response> {
  const js = await buildClientJs(`${STATIC_BASE}${path}`);
  if (js === null) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(js, {
    headers: { "Content-Type": "application/javascript" },
  });
}

const app = new Hono();

// API 路由 — 子应用挂载
app.route("/api/auth", authApp);
app.route("/api/ai", aiApp);
app.route("/api/memos", memosApp);
app.route("/api/creative", creativeApp);
app.route("/api", exportImportApp);

// 静态文件 + 页面路由
// /admin/app.ts → 转译 JS
app.get("/admin/app.ts", (c) => serveJs("/admin/app.ts"));
app.get("/admin/app.js", (c) => serveJs("/admin/app.ts"));

// /admin → 重定向到 /admin/
app.get("/admin", (c) => c.redirect("/admin/"));

// /admin/ → admin SPA
app.get("/admin/", (c) => serveHtml("/admin/index.html"));
app.get("/admin/index.html", (c) => serveHtml("/admin/index.html"));

// /index.ts → 转译 JS
app.get("/index.ts", (c) => serveJs("/masonry/index.ts"));
app.get("/index.js", (c) => serveJs("/masonry/index.ts"));

// /favicon.svg
app.get("/favicon.svg", (c) => {
  const file = Bun.file(`${STATIC_BASE}/favicon.svg`);
  return new Response(file, {
    headers: { "Content-Type": "image/svg+xml" },
  });
});

// / → masonry 首页
app.get("/", (c) => serveHtml("/masonry/index.html"));
app.get("/index.html", (c) => serveHtml("/masonry/index.html"));

// admin SPA 深层链接 + 其他 .ts 文件
app.notFound((c) => {
  const path = c.req.path;
  if (path.startsWith("/admin/")) {
    return serveHtml("/admin/index.html");
  }
  if (path.endsWith(".ts")) {
    return serveJs(`/masonry${path}`);
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
