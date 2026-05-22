# AI 写作工具箱 & 对话工作台 设计规范

## 概述

将 Memos 现有的 AI 能力从「标签建议 + 创意生成」扩展为完整的 **AI 创意写作搭档**。分两阶段交付：

- **Phase 1 — AI 写作工具箱**：在管理后台 memo 卡片和编辑弹窗中提供 5 个一键 AI 操作（摘要、改写、扩写、要点提炼、润色），其中「润色」整合现有 optimize 功能
- **Phase 2 — 对话式 AI 工作台**：将 Creative 页面升级为多轮对话界面，AI 可自动检索全库 memo 作为上下文

两阶段共享底层 Prompt 系统和 AI Provider 基础设施。

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    用户入口                              │
│                                                         │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 管理员后台    │  │ 编辑弹窗  │  │ Creative 工作台    │  │
│  │ MemoCard     │  │ FormModal │  │ 对话模式 (Phase 2) │  │
│  │ → 工具箱下拉  │  │ → 工具箱  │  │ → 对话 + 检索  │  │
│  └──────┬───────┘  └────┬─────┘  └──────┬────────────┘  │
│         │               │               │                │
│  ┌──────┴───────────────┴───────────────┴──────────┐     │
│  │                  API 层                           │     │
│  │  POST /api/ai/action  (Phase 1 — 工具箱)          │     │
│  │  POST /api/ai/chat    (Phase 2 — 对话 SSE 流式)   │     │
│  │  复用现有: optimize, suggest-tags, models         │     │
│  └──────────────────────┬───────────────────────────┘     │
│                         │                                 │
│  ┌──────────────────────┴─────────────────────────┐       │
│  │              AI Service 层                       │       │
│  │  chatCompletion / chatCompletionStream (已有)    │       │
│  │  + 新增 Prompt 模板管理 (prompts.ts)             │       │
│  └────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Phase 1 — AI 写作工具箱

### 功能范围

五个原子 AI 操作——整合现有「润色」功能，统一入口：

| 操作 | 描述 |
|---|---|
| **摘要** (`summarize`) | 用 2-3 句话提炼核心内容，保留关键信息 |
| **改写** (`rewrite`) | 按指定风格重写，保持原意不变 |
| **扩写** (`expand`) | 基于简短想法展开为完整段落，增加细节和连贯性 |
| **要点提炼** (`extract-keypoints`) | 以 `-` 列表形式提取关键要点，每点一行 |
| **润色** (`polish`) | 优化表达、修正语法、提升可读性（整合原 `/optimize`） |

> 现有 `POST /api/ai/optimize` 端点保留但标记为 legacy 别名，内部委托到 `/action` 的 `polish` 操作。

### API: `POST /api/ai/action`

**文件**: `src/api/ai.ts` — 在现有 `aiApp` 上新增路由

```
POST /api/ai/action
认证: authMiddleware
Content-Type: application/json

Body:
{
  "content": "原始文本",                    // 必填
  "action": "summarize" | "rewrite" |      // 必填
            "expand" | "extract-keypoints" |
            "polish",
  "style": "professional" | "casual" |     // rewrite 专用，可选，默认 "professional"
            "minimal" | "academic",
  "provider": "deepseek",                  // 可选
  "model": "deepseek-v4-flash"             // 可选
}

Response 200: { "result": "处理后的文本内容" }
Response 400: { "error": "..." }
Response 429: { "error": "频率限制..." }
Response 503: { "error": "AI not configured" }
```

**关键规则**：
- `content` 必填且非空
- `action` 必须为 5 个有效值之一
- `style` 仅在 action 为 `rewrite` 时有效
- 复用现有频率限制（IP 级，与 `ai` 操作类型共用计数）
- provider/model 可选，不传使用默认

### Prompt 层

**文件**: `src/ai/prompts.ts` — 新增 5 个 system prompt 函数（polish 复用现有 `getOptimizePrompt`）

```
getSummarizePrompt()    → "用 2-3 句话提炼以下内容的核心要点，保留关键信息..."
getRewritePrompt(style) → "按{style}风格重写以下内容，保持原意不变..."
getExpandPrompt()       → "基于以下简短想法展开为一个完整段落，增加细节..."
getKeypointsPrompt()    → "从以下内容中提取关键要点，以 - 列表形式输出..."
getPolishPrompt()       → 复用现有 getOptimizePrompt，优化表达、修正语法
```

### AI Service 层

**文件**: `src/ai/service.ts` — 新增 `executeAction` 函数

```typescript
export async function executeAction(
  content: string,
  action: "summarize" | "rewrite" | "expand" | "extract-keypoints" | "polish",
  style?: "professional" | "casual" | "minimal" | "academic",
  providerId?: string,
  model?: string
): Promise<string | null>
```

内部根据 action 选择对应 system prompt，调用现有 `chatCompletion`。

### 前端 UI：管理员后台 MemoCard 工具箱

**文件**: `src/admin/app.ts`

在每张 memo 卡片底部操作栏（`memo-meta-icons`）新增 AI 工具箱按钮：

1. **触发按钮**：`✨` 图标按钮，位于编辑/删除按钮组右侧
2. **下拉菜单**：点击弹出操作列表（摘要 · 改写 · 扩写 · 要点提炼 · 润色）
3. **改写子选项**：选择改写后展开风格选择（专业/口语/极简/学术）
4. **内联结果面板**：在当前卡片下方插入结果面板，含三个操作按钮

交互规则：
- 同一时间只有一个结果面板展开（新操作关闭旧面板）
- 加载中显示 spinner
- 替换原文 → 调用 `PUT /api/memos/:id` 更新 content，关闭面板，刷新列表
- 新建 memo → 调用 `POST /api/memos`，content 为结果，tag 继承原 memo 的 tags 并追加 `#原ID-摘要`（或其他操作名）
- 丢弃 → 关闭面板

### 前端 UI：编辑弹窗快捷入口

**文件**: `src/admin/app.ts` — 在 `FormModal` 中的 tag-input-row 区域

现有 AI 优化按钮 (`svgSparkle`) 被工具箱下拉替代（同样 `✨` 图标），操作逻辑一致，结果直接回填到 `formContent` textarea。原有独立 optimize 调用移除。

### 瀑布流页面

Phase 1 瀑布流（`src/masonry/index.ts`）暂不添加 AI 工具箱入口。瀑布流为公开页面，无认证机制，AI 操作需要认证。
如需后续添加，需要先解决瀑布流的认证问题（JWT token 或 API key 模式）。

### 结果处理模式

无论从 MemoCard 还是编辑弹窗触发，每个操作结果提供统一三选一：

| 操作 | 效果 |
|---|---|
| **替换原文** | `PUT /api/memos/:id` 覆盖 content |
| **新建 memo** | `POST /api/memos` 新建，标签继承 + 标注 `#来源ID-操作名` |
| **丢弃** | 仅关闭面板，不保存 |

---

## Phase 2 — 对话式 AI 工作台

### 核心交互模型

将现有 Creative 页面从「表单 → 生成 → 结果列表」升级为「自由对话」。通过 Creative Tab 内的子 Tab 切换：

- **列表视图**（现有功能，保持不变）
- **对话模式**（新增）

对话模式下：
1. 用户输入自然语言消息
2. 系统自动对消息做语义搜索 → 检索 Top N 相关 memo
3. 检索结果注入 system prompt 作为上下文
4. AI 流式返回回复
5. 支持多轮对话，历史保持

### API: `POST /api/ai/chat`

**文件**: `src/api/ai.ts` — 新路由

```
POST /api/ai/chat
认证: authMiddleware
Content-Type: application/json

Body:
{
  "message": "总结最近关于产品设计的笔记",     // 必填
  "history": [                                   // 可选，当前对话轮次
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "provider": "deepseek",                        // 可选
  "model": "deepseek-v4-flash"                   // 可选
}

Response: SSE 流 (text/event-stream)
  data: {"type":"content","content":"..."}       // token 流
  data: {"type":"done"}                          // 完成
  data: {"type":"error","error":"..."}           // 出错
```

**服务端处理流程**：
1. 校验 `message` 非空
2. 频率限制检查
3. 对 `message` 调用 `generateEmbedding` + `getSemanticResults` 获取 Top 5 相关 memo
4. 构建 system prompt：`你是用户的写作助手。以下为用户笔记库中相关内容作为参考：\n{memo 列表}`
5. 调用 `chatCompletionStream`（已有函数）
6. SSE 流式返回

### 对话管理

- **自动检索**：每条用户消息默认触发语义检索，检索到的 memo 数量在底部状态栏显示
- **引用卡片**：AI 回复可包含 memo 引用 `[#42]`，前端解析为可点击跳转链接
- **保存对话**：「保存」按钮将完整对话存为 Creative Item（复用现有 creative 表）
- **Prompt 启动器**：现有 Prompt 列表在对话模式下作为「对话模板」，点击后自动填入首条系统消息

### 与现有系统的关系

- Creative `列表视图` 完全不变，通过子 Tab 切换
- 现有 `POST /api/creative/generate` SSE 流式逻辑可被 `/chat` 复用
- Prompt 管理（CRUD）继续共用
- Phase 1 工具箱处理卡片级快速操作，Phase 2 对话处理自由探索，职责清晰不重叠

### 前端 UI：对话界面布局

```
┌──────────────────────────────────────────────────────┐
│  [Memo]  [Creative ▾]                                │
│          ├─ 列表视图                                  │
│          └─ 对话模式                     [模型选择器]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────┐            │
│  │ 👤 帮我总结最近关于产品设计的笔记      │            │
│  ├──────────────────────────────────────┤            │
│  │ 🤖 根据你的笔记库，我找到以下相关内容...│            │
│  │   （流式输出）                        │            │
│  │                    [保存为 Creative]  │            │
│  └──────────────────────────────────────┘            │
│                                                      │
│  ┌────────────────────────────────────────┐          │
│  │ 💬 输入消息...                           │          │
│  │ [发送]  上下文: 自动检索 · 5 条 memo     │          │
│  └────────────────────────────────────────┘          │
│                                                      │
│  ├─ 左侧: 对话历史列表 (可切换/删除)                   │
│  └─ 右侧: 对话区                                      │
└──────────────────────────────────────────────────────┘
```

---

## 涉及文件

| 文件 | Phase 1 | Phase 2 | 变更类型 |
|---|---|---|---|
| `src/api/ai.ts` | 新增 `/action` 路由 | 新增 `/chat` 路由 | 扩展现有文件 |
| `src/ai/prompts.ts` | 新增 5 个 prompt 函数 | — | 扩展现有文件 |
| `src/ai/service.ts` | 新增 `executeAction` 函数 | 新增 `chatStream` 函数 | 扩展现有文件 |
| `src/admin/app.ts` | 新增工具箱按钮组、结果面板 | 对话模式子 Tab | 扩展现有文件 |
| `src/admin/creative.ts` | — | 对话界面组件 | 可能新建文件或扩展 |
| `src/model.ts` | — | 可能需要新增类型 | 按需扩展 |
| `src/helper/util.ts` | 可能新增 `apiAction` 函数 | — | 按需 |

---

## 错误处理

- AI 不可用时返回 503，前端隐藏工具箱按钮
- API 调用超时/失败 — 内联面板显示错误信息，提供重试按钮
- 频率限制触发 — 显示具体冷却剩余时间
- 空内容校验 — 操作前检查 content 是否足够长（摘要/要点提炼 ≥20 字，扩写 ≥10 字，改写 ≥20 字）
- SSE 流中断 — 显示已生成内容 + 错误提示，允许重试

## 测试策略

- Phase 1 服务端：单元测试 `executeAction` 函数，覆盖 5 种 action + 参数校验 + 错误路径
- Phase 1 前端：手动验证 MemoCard 工具箱交互、编辑弹窗工具箱交互
- Phase 2 服务端：测试 `/chat` 的检索注入 + SSE 流式输出
- Phase 2 前端：验证对话历史管理、保存对话

## 向后兼容性

项目处于开发阶段，不考虑向后兼容性（参见项目约束）。所有 API 和 UI 变更直接进行，不做版本兼容处理。
