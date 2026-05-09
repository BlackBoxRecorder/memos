import { initDb } from "./db";
import { handleAuthRequest } from "./api/auth";
import { handleMemosRequest } from "./api/memos";
import { handleAiRequest } from "./api/ai";
import { initEmbeddingCache } from "./ai/embeddings";

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

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // API 路由
  if (path.startsWith("/api/auth")) {
    const res = await handleAuthRequest(request, path);
    if (res) return res;
  }

  if (path.startsWith("/api/ai")) {
    const res = await handleAiRequest(request, path);
    if (res) return res;
  }

  if (path.startsWith("/api/memos")) {
    const res = await handleMemosRequest(request, path);
    if (res) return res;
  }

  // 静态文件 + 页面路由
  // /admin/app.ts → 转译 JS
  if (path === "/admin/app.ts" || path === "/admin/app.js") {
    return serveJs("/admin/app.ts");
  }

  // /admin → 重定向到 /admin/
  if (path === "/admin") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/" },
    });
  }

  // /admin/ → admin SPA
  if (path === "/admin/" || path === "/admin/index.html") {
    return serveHtml("/admin/index.html");
  }

  // /admin/* (SPA catch-all for deep links)
  if (path.startsWith("/admin/")) {
    return serveHtml("/admin/index.html");
  }

  // /index.ts → 转译 JS
  if (path === "/index.ts" || path === "/index.js") {
    return serveJs("/masonry/index.ts");
  }

  // / → masonry 首页
  if (path === "/" || path === "/index.html") {
    return serveHtml("/masonry/index.html");
  }

  // 其他 .ts 文件
  if (path.endsWith(".ts")) {
    return serveJs(`/masonry${path}`);
  }

  return new Response("Not Found", { status: 404 });
}

// 初始化数据库
initDb();

// 初始化向量缓存
initEmbeddingCache();

// 启动服务器
Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`Memos server running at http://localhost:${PORT}`);
