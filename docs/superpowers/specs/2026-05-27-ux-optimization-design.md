# Memos UX 优化设计

> 日期: 2026-05-27 | 状态: 待实现

## 概述

针对 Memos 产品 5 个核心体验短板进行优化：首页标签展示、暗色模式、AI 菜单定位、标签自动补全、登录态首页感知。

---

## 1. 首页卡片显示标签

### 现状

Masonry 卡片 (`Card` 类型) 不包含 `tags` 字段。API 返回 memo 带 tags，但在 `api.ts` 构建卡片时被丢弃。

### 设计

| 文件 | 改动 |
|------|------|
| `src/frontend/masonry/state.ts` | `Card` 类型增加 `tags: string[]` |
| `src/frontend/masonry/api.ts` | `fetchAndRender` 中 API 响应类型增加 `tags: string[]`；Card 构建时传入 tags |
| `src/frontend/masonry/components.ts` | `MasonryCard` 在文本下方、card-info 上方增加标签行 |

**标签渲染规则**：
- 小圆角 pill 样式，浅灰背景 `#e8e8e8`，字号 11px
- 一行展示，超出卡片宽度时最多显示 5 个，剩余用 `+N` 折叠
- 点击标签 → 设置 `tag.val` 为该标签值 → 调用 `fetchAndRender(0)` 按标签过滤
- 卡片无标签时不渲染此行

---

## 2. 暗色模式

### 现状

`common.css` 中所有颜色硬编码，无主题变量体系。

### 设计

**CSS 变量体系**：在 `common.css` 顶部定义两套变量，通过 `<html data-theme>` 切换。

```css
:root, [data-theme="light"] {
  --bg-primary: #fff;
  --bg-secondary: #f8f9fb;
  --bg-page: #f0f0f0;
  --text-primary: #333;
  --text-secondary: #666;
  --text-muted: #999;
  --border-color: #e5e5e5;
  --primary-color: #3b82f6;
  --primary-hover: #2563eb;
  --danger-color: #c00;
  --danger-bg: #fef2f2;
  --card-bg: #fff;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.08);
  --overlay-bg: rgba(0,0,0,0.35);
  --modal-bg: #fff;
  --input-bg: #fff;
  --input-border: #ddd;
  --tag-bg: #e8e8e8;
  --tag-hover: #d0d0d0;
}

[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252525;
  --bg-page: #121212;
  --text-primary: #e0e0e0;
  --text-secondary: #aaa;
  --text-muted: #777;
  --border-color: #333;
  --primary-color: #60a5fa;
  --primary-hover: #93bbfd;
  --danger-color: #f87171;
  --danger-bg: #3b1111;
  --card-bg: #252525;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
  --overlay-bg: rgba(0,0,0,0.6);
  --modal-bg: #1e1e1e;
  --input-bg: #2a2a2a;
  --input-border: #444;
  --tag-bg: #333;
  --tag-hover: #444;
}
```

**CSS 迁移**：`common.css` 中所有硬编码颜色替换为 `var(--xxx)`。其他文件中的内联 `style` 字符串也需要配合（如 MemoCard、ChatPanel 等组件中的硬编码 `#xxx` 颜色值）。

**切换控件**：
- **Masonry**：FilterBar 中，Admin 链接左侧加 🌙/☀️ 切换按钮
- **Admin**：顶部栏操作按钮组中加同样的按钮

**持久化逻辑**：
- 初始化时读 `localStorage.getItem("memos-theme")`，无存储值时通过 `window.matchMedia("(prefers-color-scheme: dark)")` 跟随系统偏好
- 切换时：设置 `document.documentElement.dataset.theme`，写入 localStorage
- 两套前端（masonry/admin）各自初始化，写入同一 localStorage key `"memos-theme"`
- 两套前端共享 `common.css`，主题变量只需定义一次

---

## 3. AI 工具箱菜单动态定位

### 现状

- `FormModal.ts`：菜单 `bottom:100%;right:0;`（向上弹出），视口顶部附近会被截断
- `MemoCard.ts`：菜单 `top:100%;right:0;`（向下弹出），页面底部会被截断
- 两者均为静态 CSS，不感知可用空间

### 设计

**新增状态**（`admin/state.ts`）：

```ts
export const aiMenuPos = van.state<{
  top: number;
  left: number;
  dir: "down" | "up";
  align: "left" | "right";
} | null>(null);
```

**工具函数**（`admin/actions/ai.ts` 新增）：

```ts
export function openAiMenu(buttonEl: HTMLElement): void {
  const rect = buttonEl.getBoundingClientRect();
  const menuH = 230; // 预估菜单高度（5个操作项 + 改写风格子菜单）
  const menuW = 140; // 预估菜单宽度
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceRight = window.innerWidth - rect.right;

  aiMenuPos.val = {
    top: spaceBelow >= menuH ? rect.bottom + 4 : rect.top - menuH - 4,
    left: spaceRight >= menuW ? rect.left : rect.right - menuW,
    dir: spaceBelow >= menuH ? "down" : "up",
    align: spaceRight >= menuW ? "left" : "right",
  };
}

export function closeAiMenu(): void {
  aiMenuPos.val = null;
}
```

**渲染方式**：菜单使用 `position: fixed` + 动态 `top`/`left`，脱离父容器 `overflow` 限制。`FormModal` 和 `MemoCard` 两个场景的 AI 菜单统一调用 `openAiMenu()`。

**关闭逻辑**：点击菜单外区域时 `closeAiMenu()`；执行操作后 `closeAiMenu()`。

---

## 4. 标签输入自动补全

### 现状

`FormModal.ts` 中标签输入是纯 `<input>`，无任何补全提示。

### 设计

**数据来源**：复用 `availableTags` 状态（`admin/state.ts`），在表单打开时确保已加载。

**加载时机**：`FormModal` 渲染时（`formMode.val.type !== "closed"`），若 `!tagsLoaded.val` 则调 `/api/memos/tags` 加载（`tagsLoaded` 状态已存在于 `state.ts`）。

**UI 结构**：在 `tag-input-row` 的 input 父容器内增加下拉面板（`position: absolute`），未匹配或 input 为空时隐藏。

**过滤逻辑**：
- 匹配：大小写不敏感的前缀/包含匹配 `availableTags`
- 最多展示 8 个候选项
- 完全匹配不显示（已添加的标签或输入值与已有标签完全一致）

**交互**：
- 输入框 `onfocus` / `oninput` → 显示下拉
- `onblur`（非点击候选项时） → 延迟 200ms 关闭下拉（给 click 时间）
- 候选项 `onclick` → 调用 `addTag()` 添加标签，清空 input，关闭下拉
- 键盘 ↑↓ → 移动高亮项
- Enter → 若无高亮项则 `addTag(input值)`；若有高亮项则 `addTag(高亮项)`
- Escape → 关闭下拉
- Tab → 选中第一项并添加

---

## 5. 登录态首页感知

### 现状

Masonry 首页始终只请求公开 memo，不感知登录状态。

### 设计

**新增状态**（`masonry/state.ts`）：

```ts
export const authenticated = van.state<boolean>(false);
```

**初始化流程**（`masonry/index.ts`）：

```
页面加载 → GET /api/auth/check (credentials: "same-origin")
  → authenticated.val = data.authenticated
  → loadTags() / loadCount() / fetchAndRender(0)
```

**API 调用改动**（`masonry/api.ts`）：

`fetchAndRender()` 和 `loadCount()` 在 `authenticated.val === true` 时自动附加 `all=true` 参数。

```ts
// fetchAndRender 中
if (authenticated.val) params.set("all", "true");

// loadCount 中
const url = authenticated.val
  ? apiUrl("api/memos/count?all=true")
  : apiUrl("api/memos/count");
```

**UI 改动**（`masonry/components.ts` FilterBar）：

- 未登录：Admin 按钮左侧显示"登录"链接 → 跳转 `/admin/`
- 已登录：Admin 按钮替换为"Admin"按钮 → 跳转 `/admin/`（行为不变，样式微调）
- Admin 按钮始终显示

---

## 影响范围汇总

| 文件 | 改动类型 |
|------|---------|
| `src/frontend/masonry/state.ts` | `Card` 加 `tags`，新增 `authenticated` |
| `src/frontend/masonry/api.ts` | `fetchAndRender`/`loadCount` 传 tags + all 参数 |
| `src/frontend/masonry/components.ts` | MasonryCard 渲染标签行，FilterBar 加主题/登录按钮 |
| `src/frontend/masonry/index.ts` | 初始化时检查登录态 |
| `src/frontend/shared/styles/common.css` | CSS 变量化 + 双主题 + Masonry/admin 内联样式配套 |
| `src/frontend/admin/state.ts` | 新增 `aiMenuPos`、`tagAutocompleteOpen`、`tagAutocompleteItems`、`tagAutocompleteHighlight` |
| `src/frontend/admin/actions/ai.ts` | 新增 `openAiMenu`/`closeAiMenu` 工具函数 |
| `src/frontend/admin/components/MemoCard.ts` | AI 菜单改为动态定位 |
| `src/frontend/admin/components/FormModal.ts` | AI 菜单改为动态定位；标签输入增加补全下拉 |
| `src/frontend/admin/app.ts` | 顶部栏增加主题切换按钮 |

---

## 测试要点

1. **标签展示**：有标签/无标签卡片均正常渲染；点击标签可正确过滤；标签多时折叠显示
2. **暗色模式**：light ↔ dark 切换后所有页面颜色正确；刷新后保持选择；跟随系统偏好
3. **AI 菜单定位**：弹窗内/卡片内菜单均不被视口截断；上下左右四个方向均测试
4. **标签补全**：输入匹配显示候选项；键盘导航正常；blur/click 时序正确不闪烁
5. **登录态**：未登录只看到公开 memo；登录后看到全部；搜索覆盖私密；退出后恢复只公开
