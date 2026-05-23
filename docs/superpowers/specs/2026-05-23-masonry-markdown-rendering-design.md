# Masonry 首页 Markdown 阅读体验优化

## 概述

改善包含 markdown 语法的 memo 在首页瀑布流中的阅读体验：
- 卡片显示时先提取纯文本再截断，消除 `#`、`**` 等标记符号干扰
- ReadMore 模态框统一使用 markdown 渲染，替代纯文本 escape 显示

不涉及数据库变更、API 变更、AI 调用。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `src/helper/markdown.ts` | 新增 `hasMarkdown(text)` 检测函数 |
| `src/masonry/index.ts` | 卡片文本预处理 + ReadMore 模态框渲染方式 |

## 改动详情

### 1. `src/helper/markdown.ts` — 新增 markdown 检测函数

```typescript
/**
 * 检测文本是否包含 markdown 语法标记。
 * 使用轻量正则，避免调用 marked 解析以保持性能。
 */
export function hasMarkdown(text: string): boolean {
  return /[#*_~`>\[\]!|-]/.test(text) &&
    /^#{1,6}\s|[*_~`]|\[.*\]\(.*\)|!\[.*\]\(.*\)|^\s*[-*+]\s|^\s*>\s|^\s*\d+\.\s/m.test(text);
}
```

快速预检 + 精确匹配两段式，避免误判普通文本中的 `-`、`#` 等字符。

### 2. `src/masonry/index.ts` — 卡片文本预处理

**位置**：`fetchAndRender` 函数中构建 Card 对象处（约 L235-241）

当前逻辑：
```
m.content → truncateText(m.content) → escapeHtml(displayText)
```

改为：
```
m.content → hasMarkdown? stripHtmlTags(renderMarkdown(text)) : text
          → truncateText(cleanText)
          → escapeHtml(displayText)
```

- 若内容含 markdown，先通过 `renderMarkdown` + `stripHtmlTags` 提取纯文本
- 纯文本内容直接使用原文
- 预处理后的文本用于 pretext 布局计算和卡片显示

### 3. `src/masonry/index.ts` — ReadMore 模态框

**位置**：`ReadMoreModal` 函数（约 L616-618）

当前：
```typescript
div({ class: "readmore-modal-text" }, () =>
  escapeHtml(readMoreText.val || ""),
)
```

改为：
```typescript
div({ class: "readmore-modal-text md-content" }, () =>
  span({ innerHTML: renderMarkdown(readMoreText.val || "") }),
)
```

所有内容统一走 `renderMarkdown`。纯文本经过 marked 后输出 `<p>text</p>`，视觉上与 `escapeHtml` 一致。

### 4. 不需要改动的地方

- **Admin 后台 ReadMore 模态框**：已使用 `renderMarkdown`，无需修改
- **Admin MemoCard 列表**：显示截断纯文本，保持现状
- **数据库 / API**：无变更
- **pretext 布局计算**：卡片文本改为纯文本后，布局自动适应，无需特殊处理

## 边界情况

- **纯文本 memo**：`hasMarkdown` 返回 false，走原逻辑，行为不变
- **空内容**：现有空值保护逻辑不变
- **混合内容**：部分 markdown + 部分纯文本，统一提取纯文本显示

## 风险

- `renderMarkdown` + `stripHtmlTags` 在卡片构建时调用，对大量 memo 可能有性能影响。但由于在 `fetchAndRender` 的 map 回调中同步执行，不会阻塞 UI 渲染管道，且单次调用耗时 <1ms，风险可控。
