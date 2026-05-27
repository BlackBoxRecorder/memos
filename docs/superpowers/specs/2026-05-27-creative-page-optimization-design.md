# Creative 页面优化设计

## 背景

Creative 页面当前承载了过多功能：Prompt 管理（CRUD）、3 种上下文模式的生成配置、预览面板、Modal 弹窗交互、对话模式等。状态变量 30+ 个，GenerateModal 组件达 446 行。用户实际核心工作流是「选标签 → 选提示词 → 生成」，但当前需要多步 Modal 交互才能完成。

## 目标

1. 将核心生成操作从 3 步缩减到 1 步（同一页面内联完成）
2. 删除不常用的 auto/manual 上下文模式，仅保留标签模式
3. 去掉 GenerateModal 弹窗，改为内联生成栏
4. 简化对话模式为纯聊天界面
5. 将 Prompt 管理移入抽屉，日常不可见

## 页面结构

### 生成视图（主视图）

```
┌─────────────────────────────────────────────────┐
│ [工作] [生活] [读书] [技术] ...     [提示词 ▼]  ⚙ │
│                                                  │
│ ┌──────────────────────────────────┐ ┌────────┐  │
│ │ 附加指令...（textarea 2行）       │ │  生成  │  │
│ └──────────────────────────────────┘ └────────┘  │
│                                                  │
│ [流式生成区 — 生成时出现]                          │
│                                                  │
│ [历史结果列表 — CreativeCard]                      │
└─────────────────────────────────────────────────┘
```

- **标签选择器**：横向排列可滚动的标签按钮，选中态高亮，再点取消
- **提示词下拉**：展示所有 prompt title 的下拉选择
- **齿轮图标**：点击展开 Prompt 管理抽屉
- **生成输入区**：紧凑型 textarea（2 行）+ 生成按钮
- **生成按钮**：未选标签或未选提示词时禁用
- **流式生成区**：生成时在输入区下方出现，显示实时流式文本 + 闪烁光标；完成后显示「关闭」按钮
- **历史列表**：CreativeCard 列表，与现有展示一致

### 对话视图（简化版）

- 纯聊天界面：消息列表 + 输入框 + 发送按钮 + 新对话按钮
- 后端自动基于全部 memo 做语义搜索获取上下文，用户无需配置
- 保留「保存对话」功能（保存为 creative item）
- 去掉标签选择、提示词快捷按钮、上下文数量显示

### Prompt 管理抽屉

- 齿轮图标触发，从右侧滑出或向下展开
- 包含：Prompt 列表（标题 + 编辑/删除按钮）+ 新建按钮
- 编辑/新建复用现有的 PromptForm Modal

## 操作流程

```
1. 选择标签     →  点击横向标签按钮（高亮选中）
2. 选择提示词   →  下拉菜单选择
3. 输入附加指令 →  textarea 输入 + 点击「生成」
                  ↓
              结果内联展示（流式输出）
                  ↓
              完成后追加到下方历史列表
```

## 删除/简化的功能

| 功能 | 处理 |
|------|------|
| auto 上下文模式（语义搜索匹配） | 删除 UI 入口，后端 generate 不再支持 |
| manual 上下文模式（手动输入 ID） | 删除 |
| 预览面板（PreviewPanel） | 删除 |
| GenerateModal 弹窗 | 删除，替换为内联 GenerateBar |
| preview-context API | 删除 |

## 状态变量精简

### 删除的变量（~12 个）

- `generationMode` — 只剩标签模式
- `manualMemoIds` — 手动模式删除
- `previewOpen`, `previewMemos`, `previewLoading`, `previewError`, `previewFetched` — 预览面板删除
- `generateModalOpen` — 不再有 Modal
- `chatContextCount` — 对话不展示上下文数量
- `chatTagFilter` — 对话不再选标签

### 保留的核心状态（~15 个）

- `prompts`, `promptsLoaded`, `selectedPromptId` — Prompt 选择
- `creativeItems`, `creativeLoading`, `creativeDeleteId`, `creativeDeleting` — 结果列表
- `readMoreItem` — 阅读更多
- `extraPromptInput`, `generating`, `generateError` — 生成控制
- `streamContent`, `streamDone`, `streamAbort` — 流式输出
- `creativeView` — 生成/对话视图切换
- `chatMessages`, `chatInput`, `chatStreaming`, `chatAbort` — 对话
- `availableTags`, `tagsLoaded` — 标签列表
- `promptFormMode`, `promptFormTitle`, `promptFormContent`, `promptFormError`, `promptFormSaving` — Prompt 表单
- `selectedTagFilter`（新增） — 标签选择状态

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/frontend/admin/state.ts` | 修改 | 删除 ~12 个状态变量，新增 `selectedTagFilter` |
| `src/frontend/admin/creative.ts` | 重写 | CreativeTab 改为内联布局 |
| `src/frontend/admin/components/GenerateBar.ts` | 新增 | 内联生成栏（标签选择 + 提示词下拉 + 输入 + 生成按钮 + 流式输出） |
| `src/frontend/admin/components/PromptDrawer.ts` | 新增 | Prompt 管理抽屉 |
| `src/frontend/admin/components/GenerateModal.ts` | 删除 | 逻辑移入 GenerateBar |
| `src/frontend/admin/components/ChatPanel.ts` | 修改 | 去掉标签选择、提示词快捷、上下文数量显示 |
| `src/frontend/admin/actions/creative-core.ts` | 修改 | 删除 `loadPreviewContext/resetPreview/parseManualIds`，简化 `handleGenerate` 只支持标签模式 |
| `src/api/creative.ts` | 修改 | generate 接口删除 `memo_ids` 和 auto 模式，只接受 `tag`；删除 preview-context 端点 |

## 后端 API 变更

### `POST /api/creative/generate`

- 删除 `memo_ids` 参数
- 删除 auto 模式逻辑（embedding + 语义搜索）
- 只接受 `tag` 参数作为上下文来源
- 保留 `prompt_id`, `extra_prompt`, `provider`, `model` 参数

### `POST /api/creative/preview-context`

- 整个端点删除

### `POST /api/ai/chat`（对话 API）

- 去掉 `tag` 参数
- 后端自动基于全部 memo 做语义搜索

## 不变的部分

- Prompt CRUD API（GET/POST/PUT/DELETE /api/creative/prompts）
- Creative item CRUD API（GET/POST/DELETE /api/creative）
- PromptForm Modal 组件（编辑/新建提示词弹窗）
- CreativeCard 组件（结果卡片展示）
- ReadMoreModal 组件
- 标签页 API（GET /api/memos/tags）
