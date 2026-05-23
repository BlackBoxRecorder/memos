# Admin 后台 Markdown 渲染支持

## 概述

为 Admin 后台的创意内容、AI 对话、AI 工具箱结果等区域添加基础 Markdown 语法渲染支持。当前 AI 生成的内容以纯文本 (`white-space: pre-wrap`) 展示，但 LLM 天然倾向输出带格式的 markdown 文本（标题、列表、加粗等），导致格式显示效果不佳。

## 范围

### 覆盖区域（Admin 后台）

| 组件 | 文件 | 改动 |
|---|---|---|
| CreativeCard | `src/admin/creative.ts#L146` | 卡片预览：markdown 渲染后截断 |
| Creative ReadMoreModal | `src/admin/creative.ts#L214` | 完整 markdown 渲染 |
| ChatPanel AI 消息 | `src/admin/components/ChatPanel.ts#L67-L79` | 流式/非流式消息 markdown 渲染 |
| MemoCard AI 结果面板 | `src/admin/components/MemoCard.ts#L274-L282` | AI 工具箱结果 markdown 渲染 |
| Admin ReadMoreModal (Memo) | `src/admin/app.ts#L99` | 若 memo 内容含 markdown，同样渲染 |

### 不覆盖

- **首页瀑布流（masonry）**：不改动。瀑布流依赖 `@chenglou/pretext` 做文本高度预计算，引入 HTML 渲染会破坏布局计算逻辑，范围过大
- **编辑表单 textarea**：保持纯文本输入，不加预览
- **Memo 卡片普通内容**：保持 `pre-wrap` 渲染，memo 内容不保证是 markdown

## 技术选型

- **解析库**：`marked`（轻量 ~20KB，API 简洁，默认安全输出）
- **XSS 防护**：`DOMPurify`（白名单模式，只允许安全标签和属性）
- **方案**：统一渲染工具函数（方案 A），所有组件共享同一入口

## 架构设计

### 新增文件：`src/helper/markdown.ts`

```ts
// 核心导出
export function renderMarkdown(text: string): string;          // markdown → 安全 HTML
export function stripHtmlTags(html: string): string;           // HTML → 纯文本（用于截断测量）
export function truncateRendered(html: string, maxLen: number): string; // 按可见字符截断，标签闭合
```

#### `renderMarkdown(text)`

1. `marked.parse(text)` — 将 markdown 转为 HTML
2. `DOMPurify.sanitize(html, config)` — 白名单清洗，仅允许安全标签
3. 返回安全 HTML 字符串

#### `truncateRendered(html, maxLen)`

1. 创建临时 DOM 容器，插入 sanitized HTML
2. 遍历文本节点，累加可见字符数
3. 达到 `maxLen` 时截断当前文本节点，删除后续所有节点
4. 在截断点追加 `...`
5. 序列化容器 innerHTML 返回

**注意**：此函数用于 CreativeCard 卡片预览区。ReadMoreModal 中展示完整内容，不需要截断。

### 修改的组件

所有组件将 `.textContent` / `white-space: pre-wrap` 模式替换为 `.innerHTML` 模式，通过 `van.tags` 的 `{ innerHTML: () => renderMarkdown(content) }` 属性绑定。

```ts
// 示例：CreativeCard 中的改动
// Before:
div({ class: "creative-content" }, displayContent)

// After:
div({ class: "creative-content md-content" }, () => {
  const html = renderMarkdown(item.content);
  const truncated = truncateRendered(html, 200);
  return { innerHTML: truncated };
})
```

### DOMPurify 配置

```ts
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i',
                 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'pre', 'code'],
  ALLOWED_ATTR: ['href', 'target'],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};
```

注：`pre` 和 `code` 标签允许，但不做语法高亮。只是保留基本的等宽字体格式。

### marked 配置

```ts
marked.setOptions({
  breaks: false,        // 不将单换行转为 <br>
  gfm: true,            // 支持 GFM 表格（但 DOMPurify 会过滤掉 table 标签）
});
```

### CSS 样式

在 `src/admin/index.html` 的 `<style>` 块中新增 `.md-content` 系列样式：

```css
.md-content h1, .md-content h2, .md-content h3,
.md-content h4, .md-content h5, .md-content h6 {
  font-weight: 600;
  margin: 8px 0 4px;
  line-height: 1.3;
}
.md-content h1 { font-size: 1.3em; }
.md-content h2 { font-size: 1.15em; }
.md-content h3 { font-size: 1.05em; }
.md-content strong, .md-content b { font-weight: 600; }
.md-content em, .md-content i { font-style: italic; }
.md-content ul, .md-content ol { padding-left: 1.5em; margin: 4px 0; }
.md-content li { margin: 2px 0; }
.md-content blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 12px;
  color: #666;
  margin: 6px 0;
}
.md-content hr {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 12px 0;
}
.md-content p { margin: 4px 0; }
.md-content pre {
  background: #f5f5f5;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  overflow-x: auto;
}
.md-content code {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
.md-content a { color: #3b82f6; }
```

### 安全考虑

1. **DOMPurify 白名单**：仅允许安全的展示类标签，排除了 `<script>`、`<iframe>`、`<object>`、`<embed>`、`<style>` 等
2. **属性白名单**：`<a>` 仅允许 `href` 和 `target`，DOMPurify 默认阻止 `javascript:` 协议
3. **marked 配置**：不启用任何潜在危险的扩展
4. **innerHTML 使用**：仅对 sanitized 后的 HTML 使用，不对原始用户输入直接使用

### 不需要改的部分

- 数据库 schema（内容仍以 markdown 原文存储）
- API 层（不涉及服务端修改）
- `src/model.ts` 类型定义
- 瀑布流相关代码

## 依赖变更

```json
// package.json 新增
{
  "dependencies": {
    "marked": "^12.0.0",
    "dompurify": "^3.0.0"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.0"
  }
}
```

`marked` 原生支持 TypeScript 类型，无需额外 `@types/marked`。
