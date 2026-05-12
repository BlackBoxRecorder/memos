# VanJS 开发实战手册

> 基于 Memos 项目实践总结的 VanJS（vanjs-core v1.6.0）使用经验、常见问题与最佳实践。

---

## 一、状态管理

### 1.1 State 的创建与读写

VanJS 的核心状态单元是 `van.state()`，它创建一个响应式状态容器。基本用法：

```typescript
import van from "vanjs-core";

// 创建状态，提供初始值
const count = van.state(0);
const name = van.state("");
const items = van.state<Memo[]>([]);

// 读取：通过 .val 属性
console.log(count.val); // 0

// 写入：赋值给 .val 会触发所有依赖此状态的响应式节点重新渲染
count.val = 1;
```

**关键原则**：`.val` 的赋值是触发 VanJS 响应式更新的唯一途径。任何依赖此状态的 UI 都会在 `.val` 被赋新值时自动刷新。

### 1.2 复杂类型状态

对于复杂类型（如可辨识联合、Set），直接赋予新值即可触发更新：

```typescript
// 可辨识联合类型
type FormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

const formMode = van.state<FormMode>({ type: "closed" });
formMode.val = { type: "edit", id: 5 }; // 触发更新

// Set 类型：必须创建新实例赋值
const collapsedYears = van.state<Set<number>>(new Set());
function toggleYear(year: number): void {
  const current = new Set(collapsedYears.val);
  if (current.has(year)) {
    current.delete(year);
  } else {
    current.add(year);
  }
  collapsedYears.val = current; // 赋新 Set 实例触发更新
}
```

### 1.3 跨模块共享状态

当多个组件文件需要共享状态时，通过独立模块导出 State 对象（参见 `src/admin/ai-state.ts`）：

```typescript
// ai-state.ts —— 共享状态模块
import van from "vanjs-core";

export const selectedProvider = van.state("");
export const selectedModel = van.state("");

export function getSelectedAiModel(): { provider: string; model: string } {
  return { provider: selectedProvider.val, model: selectedModel.val };
}
```

```typescript
// app.ts 和 creative.ts 均可直接导入使用
import { selectedProvider, selectedModel } from "./ai-state";
```

---

## 二、组件渲染

### 2.1 函数式组件模式

VanJS 组件本质上是返回 DOM 节点的普通函数。组件函数被调用时执行，返回的节点树中若包含响应式绑定（`() => ...`），则会在依赖的 State 变更时被重新求值。

```typescript
const { div, span, button, input, textarea, h3 } = van.tags;

function MemoCard(memo: Memo) {
  return div(
    { class: "memo-card" },
    div({ class: "memo-content" }, memo.content),
    span({ class: "memo-id" }, `#${memo.id}`),
  );
}
```

### 2.2 条件渲染

在 VanJS 中，条件渲染通过**响应式子节点函数**（返回节点或空字符串的函数）实现：

```typescript
// 渲染可选内容
() => generateError.val
  ? div({ class: "form-error" }, generateError.val)
  : ""

// 渲染可选组件（Modal 模式）
() => generateModalOpen.val ? GenerateModal() : ""
() => formMode.val.type !== "closed" ? FormCard() : ""
```

**关键要点**：
- 响应式子节点函数必须返回单个 `ValidChildDomValue`（Node | string | number | null | undefined），**不能直接返回数组**。
- 空内容统一用空字符串 `""` 表示。

### 2.3 列表渲染

列表渲染有两种方式：

**方式一：展开运算符（用于数组中的单层子节点）**

```typescript
// TagCloud 组件
function TagCloud() {
  return div(
    { class: "tag-cloud" },
    ...prompts.val.map((prompt) =>
      button({ class: "tag-cloud-item", onclick: ... }, prompt.title)
    ),
  );
}
```

**方式二：直接传数组（`ChildDom` 参数类型天然支持 `readonly ChildDom[]`）**

```typescript
// MemoCard 列表
return div(memos.val.map(MemoCard));

// PreviewPanel 中渲染 Memo 列表
return div(
  { style: "..." },
  ...previewMemos.val.map((m) => div({ ... }, ...)),
);
```

### 2.4 属性绑定：动态 class 和 style

```typescript
// class 通过响应式函数动态计算
button({
  class: () =>
    "tag-cloud-item" + (selectedPromptId.val === prompt.id ? " active" : ""),
  onclick: () => selectPrompt(prompt.id),
}, prompt.title)

// disabled 也常用响应式函数
button({
  disabled: () => formSaving.val,
  onclick: saveForm,
}, "Save")
```

---

## 三、事件处理

### 3.1 oninput 与状态同步

VanJS 中表单输入的标准模式是：**`oninput` 事件中手动将 DOM 值同步到 State**。

```typescript
textarea({
  placeholder: "What's on your mind?",
  value: formContent,          // 绑定 State 对象（不是 .val）
  oninput: (e: Event) => {
    formContent.val = (e.target as HTMLTextAreaElement).value;
  },
})

input({
  type: "checkbox",
  checked: formIsPublic,
  oninput: (e: Event) =>
    (formIsPublic.val = (e.target as HTMLInputElement).checked),
})
```

**关于 `value` 绑定的重要陷阱（见第六节 6.1）**：当输入框在模态框等会被重建的容器中时，`value` 绑定 State 对象可能导致焦点丢失。此时需改绑原始值 `.val` 并纯靠 `oninput` 管理。

### 3.2 事件冒泡控制

在嵌套可点击元素中，使用 `e.stopPropagation()` 防止父级事件触发：

```typescript
button({
  class: "tag-action-btn",
  title: "Edit",
  onclick: (e: Event) => {
    e.stopPropagation();  // 阻止触发父级 button 的 onclick
    openPromptEdit(prompt);
  },
}, "\u270E")
```

### 3.3 失焦处理：下拉菜单关闭

利用 `onblur` 事件的 `relatedTarget` 判断焦点是否移出组件：

```typescript
const aiModelsOpen = van.state(false);

function ModelSelector() {
  return div({
    class: () => "model-select" + (aiModelsOpen.val ? " open" : ""),
    tabindex: "0",
    onblur: (e: FocusEvent) => {
      const tgt = e.relatedTarget as HTMLElement | null;
      const el = e.currentTarget as HTMLElement;
      if (!tgt || !el.contains(tgt)) {
        aiModelsOpen.val = false;
      }
    },
  }, ...);
}
```

### 3.4 模态框点击外部关闭

```typescript
div({
  class: "modal-overlay",
  onclick: (e: Event) => {
    if (e.target === e.currentTarget) closeGenerateModal();
  },
}, ...)
```

### 3.5 键盘事件

```typescript
input({
  type: "password",
  placeholder: "Secret key",
  onkeydown: (e: KeyboardEvent) => {
    if (e.key === "Enter") login((e.target as HTMLInputElement).value);
  },
})
```

---

## 四、异步操作

### 4.1 标准异步 Action 模式

异步操作遵循 `loading → try/catch → finally` 模式，通过 State 控制 UI 状态：

```typescript
const loading = van.state(false);
const error = van.state<string | null>(null);

async function loadMemos(): Promise<void> {
  loading.val = true;
  try {
    const data = await api<{ memos: Memo[] }>("/api/memos?all=true");
    memos.val = data.memos;
    error.val = null;
  } catch (err) {
    error.val = (err as Error).message;
  } finally {
    loading.val = false;
  }
}
```

对应的 UI 渲染：

```typescript
() => {
  if (loading.val) return div({ class: "status-msg" }, "Loading...");
  if (error.val) return div({ class: "form-error" }, error.val);
  if (memos.val.length === 0) return div({ class: "empty-state" }, "No data.");
  return div(memos.val.map(MemoCard));
}
```

### 4.2 SSE 流式输出 + requestAnimationFrame 缓冲

在 `creative.ts` 中，AI 生成内容通过 SSE 流式接收，使用 `requestAnimationFrame` 批量合并更新减少重渲染：

```typescript
let pendingStreamContent = "";
let rafScheduled = false;

const flushStreamContent = () => {
  if (pendingStreamContent) {
    streamContent.val += pendingStreamContent;
    pendingStreamContent = "";
  }
  rafScheduled = false;
};

// 在 SSE 数据解析循环中：
pendingStreamContent += msg.content;
if (!rafScheduled) {
  rafScheduled = true;
  requestAnimationFrame(flushStreamContent);
}
```

**为什么用 RAF**：SSE 可能高频推送小片段（每次几个字符）。直接每次更新 `streamContent.val` 会触发大量 DOM 更新。RAF 缓冲将同一帧内的多次推送合并为一次 State 更新，大幅减少重渲染。

### 4.3 AbortController 取消请求

流式请求支持取消，避免组件关闭后继续更新已销毁的 UI：

```typescript
let streamAbort: AbortController | null = null;

// 发起请求
streamAbort = new AbortController();
const resp = await fetch("/api/creative/generate", {
  signal: streamAbort.signal,
  ...
});

// 关闭 Modal 时取消
function closeGenerateModal(): void {
  if (streamAbort) streamAbort.abort(); // 触发 AbortError
  generateModalOpen.val = false;
  // ...重置状态
}

// 捕获取消异常
} catch (err) {
  if ((err as Error).name === "AbortError") return; // 忽略取消
  generateError.val = (err as Error).message;
}
```

### 4.4 防抖输入

Tag 建议功能使用 debounce 减少 API 调用次数：

```typescript
let suggestTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSuggestTags(): void {
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => {
    suggestTagsForContent();
  }, 1000);
}

// 在 oninput 中调用
textarea({
  oninput: (e: Event) => {
    formContent.val = (e.target as HTMLTextAreaElement).value;
    if (aiAvailable.val) debouncedSuggestTags();
  },
})
```

---

## 五、TypeScript 集成

### 5.1 State 类型注解

始终为 `van.state()` 提供明确的类型参数：

```typescript
const prompts = van.state<Prompt[]>([]);
const authenticated = van.state<boolean | null>(null);
const formMode = van.state<FormMode>({ type: "closed" });
const selectedMonth = van.state<string | null>(null);
```

### 5.2 响应式子节点函数的返回类型约束

**这是项目中最常遇到的类型错误**。VanJS 要求响应式子节点函数 `() => ...` 返回 `ValidChildDomValue`（单个节点/原始值/null/undefined），不能返回数组。

**错误示例**：

```typescript
// 错误：flatMap 返回数组，不满足 ValidChildDomValue 类型
() => aiModels.val.flatMap((prov) => [
  div({ class: "model-select-group" }, prov.name),
  ...prov.models.map((m) => div({ ... }, m)),
])
```

**修复方案**：利用外层已有的响应式边界，将列表从响应式函数改为直接传数组：

```typescript
// 正确：外层 () => 做条件判断，内层直接传数组
() => (aiModels.val.length > 0 ? ModelSelector() : "")

// ModelSelector 内部直接使用展开运算符（VanJS 属性值支持 readonly ChildDom[]）
function ModelSelector() {
  return div(
    { class: "model-select-dropdown" },
    aiModels.val.flatMap((prov) => [
      div({ class: "model-select-group" }, prov.name),
      ...prov.models.map((m) => div({ ... }, m)),
    ]),
  );
}
```

### 5.3 可辨识联合类型

表单模式等使用可辨识联合类型提升类型安全：

```typescript
type FormMode =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; id: number };

const formMode = van.state<FormMode>({ type: "closed" });

// TypeScript 自动收窄类型
if (formMode.val.type === "edit") {
  const id: number = formMode.val.id; // 已知 id 存在
}
```

---

## 六、常见问题与解决方案

### 6.1 输入框输入即失焦

**现象**：模态框中的 textarea/input 每输入一个字符就失去焦点。

**根因**：将 `value` 属性绑定到 `van.state` 对象本身（如 `value: extraPromptInput`）。当 `oninput` 更新 `.val` 后，VanJS 的 DOM diff 会重写输入框的 `value` 属性，破坏浏览器的输入状态和光标位置，严重时触发父级 DOM 子树的重建导致输入框被销毁重挂载。

**修复方案**：将 `value` 绑定改为读取原始值（`.val`）做一次性初始化，输入逻辑完全由 `oninput` 事件管理：

```typescript
// 错误写法 —— 会导致焦点丢失
textarea({
  placeholder: "Additional instructions...",
  value: extraPromptInput,          // 绑定 State 对象
  oninput: (e: Event) => {
    extraPromptInput.val = (e.target as HTMLTextAreaElement).value;
  },
})

// 正确写法 —— 适用于模态框等动态容器
textarea({
  placeholder: "Additional instructions...",
  value: extraPromptInput.val,      // 绑定原始值（一次性初始化）
  oninput: (e: Event) => {
    extraPromptInput.val = (e.target as HTMLTextAreaElement).value;
  },
})

// 同理 input 也适用
input({
  type: "text",
  placeholder: "Memo IDs (e.g. 1,3,5)",
  value: manualMemoIds.val,
  oninput: (e: Event) => {
    manualMemoIds.val = (e.target as HTMLInputElement).value;
  },
})
```

> **注意区分场景**：对于不会导致 DOM 重建的静态表单（如 `PromptForm` 中始终存在于 DOM 的输入框），`value: promptFormTitle` 绑定 State 对象是安全的，因为容器本身不会因外部状态变更而重建。

**诊断思路**：在 `oninput`、`onfocus`、`onblur` 和触发状态变更的函数中注入 `document.activeElement` 检查日志，定位焦点丢失的精确时机。使用 `queueMicrotask` 可以确认是否是异步 DOM 重建导致的。

### 6.2 响应式循环导致无限请求

**现象**：`CreativeTab` 组件在数据库无 prompt 时频繁重复请求 `/api/creative/prompts` 接口。

**根因**：VanJS 的响应式追踪机制。`CreativeTab` 在响应式函数中读取 `prompts.val`，当 `loadPrompts()` 执行 `prompts.val = []` 时，创建了新的空数组引用，触发响应式函数重执行，形成无限循环。

**修复方案**：添加模块级加载锁，确保空数据时只发起一次请求：

```typescript
let isLoadingPrompts = false;

export function CreativeTab() {
  if (prompts.val.length === 0 && !isLoadingPrompts) {
    isLoadingPrompts = true;
    loadPrompts().finally(() => { isLoadingPrompts = false; });
  }
  // ...
}
```

### 6.3 响应式子节点返回数组类型错误

**现象**：`TypeScript` 报错 `() => HTMLDivElement[]` 无法赋给 `(dom?: Node) => ValidChildDomValue`。

**根因**：VanJS 的类型系统要求响应式子节点函数返回单个值，而非数组。

**修复**：见 5.2 节。

### 6.4 模态框滚动穿透

当模态框打开时，需要阻止背景页面滚动。在管理后台中，通过 `preventBodyScroll`/`restoreBodyScroll` 辅助函数实现（依据项目中实际使用的方案）。CSS 层面使用 `overflow: hidden` 作用于 `<body>` 或滚动容器。

### 6.5 死代码清理

流式输出功能上线后，原有的非流式 `generateCreative` 函数成了死代码。及时清理避免维护混淆，保持代码库健康。

---

## 七、最佳实践速查

| 场景 | 推荐做法 |
|------|---------|
| 创建状态 | `van.state<Type>(initVal)`，始终加类型参数 |
| 更新状态 | `state.val = newValue`（直接替换引用触发更新） |
| 读取状态 | `state.val`（在非响应式上下文中） |
| 条件渲染 | `() => cond ? Node() : ""` |
| 列表渲染 | `div(items.map(Item))` 或 `...items.map(fn)` |
| 表单输入-安全 Context | `value: state` + `oninput` 同步 |
| 表单输入-动态容器 | `value: state.val` + 纯 `oninput` 管理 |
| 动态 class | `class: () => "base" + (active.val ? " active" : "")` |
| 加载/空/错误态 | `loading -> error -> empty -> data` 四级判断链 |
| 异步请求 | `loading=true -> try/catch -> finally loading=false` |
| 取消请求 | `AbortController` + 捕获 `AbortError` |
| 高频更新 | `requestAnimationFrame` 合并批量写入 |
| 跨模块状态 | 独立文件导出 `van.state()`，多处导入使用 |
| Modal | 条件渲染 + overlay `onclick` 检查 `e.target===e.currentTarget` |
| 下拉菜单关闭 | `onblur` + `relatedTarget` 检查 + `tabindex="0"` |

---

## 八、项目中的 VanJS 组件清单

| 组件 | 文件 | 关键模式 |
|------|------|---------|
| `LoginPage` | `src/admin/app.ts` | 基础表单，onkeydown Enter 提交 |
| `AdminPage` | `src/admin/app.ts` | 顶层路由，Tab 切换，响应式条件渲染 |
| `FormCard` | `src/admin/app.ts` | 创建/编辑表单，可辨识联合模式 |
| `MemoCard` | `src/admin/app.ts` | 纯展示卡片，内联 DeleteConfirm |
| `DeleteConfirm` | `src/admin/app.ts` | 内联确认组件 |
| `TimelineSidebar` | `src/admin/app.ts` | 复杂响应式列表，缓存计算结果 |
| `ModelSelector` | `src/admin/app.ts` | 下拉选择，onblur 关闭，flatMap 渲染 |
| `CreativeTab` | `src/admin/creative.ts` | 多状态驱动的 Tab 页面 |
| `TagCloud` | `src/admin/creative.ts` | 展开运算符渲染标签 |
| `PromptForm` | `src/admin/creative.ts` | 模态框表单，点击外部关闭 |
| `GenerateModal` | `src/admin/creative.ts` | 流式输出，双模式切换，上下文预览 |
| `PreviewPanel` | `src/admin/creative.ts` | 可折叠面板，4 态渲染 |
| `ReadMoreModal` | `src/admin/creative.ts` | 只读内容展示模态框 |
| `CreativeCard` | `src/admin/creative.ts` | 创意内容卡片，长度截断 + Read more |

---

## 九、参考资源

- [VanJS 官方文档](https://vanjs.org/)
- 项目 `src/admin/` 目录：完整的管理后台实现
- 项目 `src/masonry/` 目录：瀑布流首页（原生 DOM + pretext，非 VanJS）
