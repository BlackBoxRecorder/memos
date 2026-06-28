# About 页面集成设计

## 概述

将产品介绍落地页（`docs/introduce/index.html`）搬迁至前端目录 `src/frontend/about/`，通过 `/about` 路由对外暴露，并在首页右上角添加"关于"入口按钮。

## 文件搬迁

- `docs/introduce/index.html` → `src/frontend/about/index.html`
- `docs/introduce/images/` 整个目录 → `src/frontend/about/images/`
- HTML 内图片引用路径 `images/memo1.png` 等保持不动（相对路径天然正确）
- 搬迁后删除 `docs/introduce/` 目录

## 服务端路由

在 `src/server.ts` 中新增：

### /about 页面路由

```typescript
// /about → 产品介绍页
app.get("/about", async (c) =>
  serveHtml("/frontend/about/index.html", "/about/"),
);
app.get("/about/", async (c) =>
  serveHtml("/frontend/about/index.html", "/about/"),
);
```

处理方式复用现有 `serveHtml` 函数，与 `/admin` 保持一致。`serveHtml` 会自动注入 `<base href="/about/">` 确保深层路径下脚本 src 解析正确。

### /about/images/* 静态资源

由于 HTML 内图片使用相对路径 `images/memo1.png`，浏览器会向 `/about/images/` 发起请求，需要添加通配路由：

```typescript
app.get("/about/images/*", async (c) => {
  const imagePath = c.req.path.replace("/about/", "");
  const file = Bun.file(`${STATIC_BASE}/frontend/about/${imagePath}`);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(file);
});
```

## 首页"关于"按钮

在 `src/frontend/masonry/components.ts` 的 `FilterBar()` 中，admin 按钮右侧新增一个链接：

```typescript
a({ href: "/about", id: "admin-btn" }, "\u5173\u4E8E"),
```

- 位置：admin/登录按钮右侧，同一行内
- 样式：复用 `#admin-btn` CSS 定义，保持与登录按钮视觉一致
- 按钮文字：`关于`

## 不改动的部分

- `docs/introduce/index.html` 内容不变（文案、样式、轮播脚本均保留）
- Tailwind CSS CDN 依赖保留（该页面为独立静态页面，不参与 Bun 构建）
- HERO 区域"开始使用"按钮指向 `/` 保持不变

## 涉及文件

| 文件 | 操作 |
|------|------|
| `src/frontend/about/index.html` | 新建（从 docs/introduce 移入） |
| `src/frontend/about/images/*.png` | 新建（从 docs/introduce/images 移入） |
| `src/server.ts` | 修改（添加 /about 路由 + 图片静态资源路由） |
| `src/frontend/masonry/components.ts` | 修改（FilterBar 中添加关于按钮） |
| `docs/introduce/` | 删除 |
