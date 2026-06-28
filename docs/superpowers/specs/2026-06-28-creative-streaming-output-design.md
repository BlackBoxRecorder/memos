# Creative 页面流式输出显示

## 概述

在 Creative 页面附加指令生成创意内容时，于 GenerateBar 输入框下方的加载动画下面增加一个 180px 的只读文本框，实时流式展示 AI 生成内容。复用现有 `chatCompletionStream` → SSE 管道，前端新增 `content` 类型消息的消费逻辑，通过 rAF 节流保证界面流畅。

## 架构与数据流

**当前 SSE 消息类型（后端已支持，无需改动）：**

| type | 含义 | 前端处理现状 |
|---|---|---|
| `content` | 增量文本 chunk | **丢弃**（未消费） |
| `done` | 生成完成，附带完整 CreativeItem | 插入列表首位 |
| `error` | 错误信息 | 显示错误提示 |

**改动后流程：**

```
用户点击生成 → handleGenerate()
  → POST /api/creative/generate → 后端 SSE 流
  → for await (msg of streamSSE(resp)):
      msg.type === "content"  → 追加到 buffer → rAF 批量提交 streamContent.val
      msg.type === "done"     → 插入列表 + 清空 streamContent + generating = false
      msg.type === "error"    → 显示错误 + generating = false
```

**rAF 节流策略：**

- 维护内存缓冲区 `let buffer = ""`，每次 SSE `content` 消息追加到 buffer
- 通过 `requestAnimationFrame` 将 buffer 内容写入 `streamContent.val`（~60fps）
- 使用 `flushPending` 布尔标志防止多个 rAF 回调同时注册
- rAF 回调中将 buffer 置空，准备下一批

## 组件布局

流式输出区域位于 GenerateBar 中的位置（从上到下）：

```
提示词选择器
标签选择器
[附加指令输入框] [生成按钮]
LoadingBar 动画
流式输出 textarea (180px)  ← 新增
错误信息
```

**渲染条件：** `generating.val === true` 时渲染（首次渲染显示空框，随后内容逐渐填充）。`generating.val === false` 时从 DOM 完全移除，不可仅 hidden。

## StreamOutput 组件

### 样式规格

| 属性 | 值 |
|---|---|
| 高度 | `180px` |
| 宽度 | `100%` |
| 状态 | `readonly` |
| 字体 | `13px`，`font-family: monospace` |
| 文本处理 | `white-space: pre-wrap; word-wrap: break-word; overflow-x: hidden` |
| 滚动 | `overflow-y: auto` |
| 内边距 | `padding: 10px` |
| 背景 | `var(--bg-secondary)` |
| 边框 | `1px solid var(--border-color)`, `border-radius: 6px` |
| 上边距 | `margin-top: 8px`（与 LoadingBar 间距） |
| 暗色模式 | CSS 变量自动适配，无需额外声明 |

### 智能滚动

- 使用 ref 持有 textarea DOM 元素
- 每次内容更新后检查滚动位置：
  - `el.scrollHeight - el.scrollTop - el.clientHeight <= 20` → 自动滚到底部
  - 否则 → 用户正在手动查看上方内容，不强制滚动
- 用户重新滚回底部（距离 ≤20px）后，再次恢复自动跟随

## 生命周期

1. **生成开始** — `generating.val = true`，输入框禁用，加载动画出现，流式区域渲染（空内容）
2. **流式进行中** — SSE content chunk 持续到来，经 rAF 批量写入状态，textarea 内容增长，自动滚底
3. **生成完成** — `generating.val = false`，流式区域从 DOM 移除，`streamContent.val` 清空为空字符串，输入框恢复可用，新卡片出现在列表首位
4. **生成出错** — 同完成，但无新卡片，显示错误信息

## 涉及文件

| 文件 | 改动内容 |
|---|---|
| `src/frontend/admin/actions/creative-core.ts` | `handleGenerate()` 中新增 `content` 类型 SSE 消息处理，rAF 批量写入 `streamContent`，finally 中清空 |
| `src/frontend/admin/components/GenerateBar.ts` | 新增 `StreamOutput()` 组件，在 LoadingBar 下方渲染；引入 `streamContent` 状态 |

**无需改动的文件：**
- `src/ai/service.ts` — `chatCompletionStream` / `generateCreativeContentStream` 已就绪
- `src/api/creative.ts` — SSE 已在发送 `content` 消息
- `src/frontend/admin/state.ts` — `streamContent` 状态已定义
- `src/frontend/admin/index.html` — 公共样式已覆盖，流式区域使用内联样式

## 错误处理

- SSE 解析失败：跳过该 chunk，不影响后续消息
- AbortError（用户切换标签/断开）：静默终止，不显示错误
- 生成错误：`generating = false`，流式区域移除，显示 `generateError`

## 性能考量

- rAF 节流保证 DOM 更新频率 ≤60fps，避免高频 token 流入导致的渲染阻塞
- 内容通过 VanJS `value` 绑定响应式更新，不产生额外 DOM 操作
- 智能滚动仅在底部附近执行 `scrollTop` 赋值，减少不必要的 reflow
