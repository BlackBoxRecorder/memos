# Memo 置顶功能 设计规范

## 概述

为 Memos 备忘录系统增加置顶（Pin）功能，允许管理员将重要的 memo 置顶，使其在列表顶部优先显示。置顶状态在 Admin 后台和瀑布流公开页均生效。

## 功能范围

- **Admin 后台**：每条 memo 卡片提供置顶/取消置顶按钮，已置顶卡片显示状态标记
- **瀑布流公开页**：已置顶的公开 memo 优先排列，并显示置顶状态标记（仅展示，无操作按钮）
- 不限制置顶数量
- 多条置顶 memo 按置顶时间倒序排列

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│                    前端 UI                            │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Admin 后台        │  │ 瀑布流公开页      │          │
│  │ MemoCard          │  │ Masonry Card     │          │
│  │ → 置顶状态标记     │  │ → 置顶状态标记    │          │
│  │ → 置顶切换按钮     │  │ （无操作按钮）    │          │
│  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │
│  ┌────────┴─────────────────────┴────────┐            │
│  │              API 层                    │            │
│  │  PUT /api/memos/:id/pin  (新增)        │            │
│  │  GET /api/memos          (排序变更)    │            │
│  └───────────────────┬──────────────────┘            │
│                      │                               │
│  ┌───────────────────┴──────────────────┐            │
│  │          数据库层                      │            │
│  │  memos 表新增 pinned_at TEXT 列       │            │
│  │  ORDER BY pinned_at...排序逻辑变更    │            │
│  └──────────────────────────────────────┘            │
└──────────────────────────────────────────────────────┘
```

## 关键决策

| 决策 | 选型 | 理由 |
|---|---|---|
| 适用范围 | Admin + 瀑布流 | 置顶是具有普遍意义的优先级标记 |
| 数量限制 | 不限制 | 保持灵活性，降低复杂度 |
| 排序规则 | 按 `pinned_at` 倒序 | 最近置顶的排在前面，符合直觉 |
| 数据模型 | 扩展 memos 表（方案 A） | 比独立关系表更简单，无需 JOIN |
| UI 方案 | 顶部标记 + 按钮切换（方案 C） | 状态可读性好，操作入口明确 |
| 按钮位置 | 按钮组最左侧 | 与公开/私密切换同属状态操作 |

## 数据库设计

### Schema 变更

`memos` 表新增 `pinned_at` 列：

```sql
pinned_at TEXT  -- NULL 表示未置顶，非 NULL 表示置顶时间（ISO 8601）
```

### Migration 策略

在 `initDb()` 中检测列是否存在，不存在则执行：

```sql
ALTER TABLE memos ADD COLUMN pinned_at TEXT;
```

遵循现有 `tag → tags` 迁移模式。

### 排序变更

`getMemos` 中的排序从：

```sql
ORDER BY created_at DESC
```

改为：

```sql
ORDER BY pinned_at IS NOT NULL DESC, pinned_at DESC, created_at DESC
```

排序逻辑：
1. 置顶的排前面（`pinned_at IS NOT NULL` 为 true 的优先）
2. 置顶之间按置顶时间倒序
3. 非置顶的按创建时间倒序

### 新增 DB 函数

```typescript
// src/db.ts
export function pinMemo(id: number, pin: boolean): Memo | null
```

- `pin=true`：`UPDATE memos SET pinned_at = datetime('now') WHERE id = ?`
- `pin=false`：`UPDATE memos SET pinned_at = NULL WHERE id = ?`
- 返回更新后的完整 memo 对象或 null（ID 不存在时）

## 类型定义变更

### Model（`src/model.ts`）

```typescript
export interface Memo {
  id: number;
  content: string;
  tags: string[];
  is_public: boolean;
  pinned_at: string | null;  // 新增
  created_at: string;
  updated_at: string;
}
```

### DB Row（`src/db.ts`）

`MemoRow` 接口新增 `pinned_at: string | null`，`rowToMemo` 函数透传该字段。

### 瀑布流 Card 类型（`src/masonry/index.ts`）

```typescript
type Card = {
  id: number;
  text: string;
  prepared: PreparedText;
  updatedAt: string;
  pinnedAt: string | null;  // 新增
};
```

## API 设计

### 新增路由：`PUT /api/memos/:id/pin`

**文件**：`src/api/memos.ts` — 在现有 `memosApp` 上新增路由

```
PUT /api/memos/:id/pin
认证: authMiddleware
Content-Type: application/json

Body:
{ "pinned": true | false }

Response 200: { "memo": { ...Memo } }
Response 400: { "error": "Invalid JSON" }
Response 404: { "error": "Memo not found" }
```

**设计说明**：
- 独立子路由而非合并到 `PUT /api/memos/:id`，单一职责
- 不需要频率限制（低频率管理操作）
- 不需要重新生成 embedding（content 未变更）
- 返回完整 memo 对象，前端可直接更新本地状态

### 现有路由变更

`GET /api/memos` — 排序由服务端 `getMemos` 统一处理，前端无需额外参数。

## 前端设计

### Admin 后台

#### SVG 图标（`src/helper/svgHelper.ts`）

新增 `svgPin()` 函数，提供 📌 图钉图标。与现有 `svgLock()`/`svgEdit()` 风格一致：16×16，stroke 风格，feather-icons 风格的 pin SVG。

#### Action（`src/admin/actions/memo.ts`）

新增 `togglePin(memo: Memo)` 函数：

```typescript
export async function togglePin(memo: Memo): Promise<void> {
  await api(`api/memos/${memo.id}/pin`, {
    method: "PUT",
    body: JSON.stringify({ pinned: !memo.pinned_at }),
  });
  await loadMemos();
}
```

#### MemoCard 组件（`src/admin/components/MemoCard.ts`）

**改动一：卡片顶部状态标记**（在 `memo-content` div 上方）

仅在 `memo.pinned_at != null` 时显示：

```typescript
() => memo.pinned_at
  ? div({
      class: "pin-badge",
      style: "font-size:12px;color:#e67e22;padding:0 0 4px 0;"
    }, "📌 已置顶")
  : ""
```

**改动二：按钮组新增置顶切换按钮**（按钮组最左侧，锁按钮之前）

```typescript
button(
  {
    class: () => "memo-icon-btn" + (memo.pinned_at ? " pinned" : ""),
    title: memo.pinned_at ? "取消置顶" : "置顶",
    onclick: () => togglePin(memo),
  },
  svgPin(),
)
```

置顶状态下按钮增加 `.pinned` class，改变颜色为橙色（`#e67e22`）。

### 瀑布流公开页（`src/masonry/index.ts`）

**数据获取**：通过 `GET /api/memos` 获取公开 memo，排序由服务端 `getMemos` 统一处理，前端无需添加排序逻辑。

**Card 类型**：扩展 `Card` 类型，新增 `pinnedAt: string | null`。

**卡片 UI**：在每个卡片内容顶部添加置顶标记（仅在 `pinnedAt != null` 时显示），样式与 Admin 一致。**不提供操作按钮**（公开页无认证机制）。

## 涉及文件

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/model.ts` | 修改 | `Memo` 接口新增 `pinned_at` |
| `src/db.ts` | 修改 | 新增 `pinned_at` 列 migration、`pinMemo` 函数、排序变更、`MemoRow` 扩展 |
| `src/api/memos.ts` | 修改 | 新增 `PUT /:id/pin` 路由 |
| `src/helper/svgHelper.ts` | 修改 | 新增 `svgPin()` |
| `src/admin/actions/memo.ts` | 修改 | 新增 `togglePin` |
| `src/admin/components/MemoCard.ts` | 修改 | 顶部状态标记 + 按钮组新增置顶按钮 |
| `src/masonry/index.ts` | 修改 | `Card` 类型扩展 + 置顶状态标记 |

## 错误处理

- 操作不存在的 memo → 返回 404，前端 `globalError` 提示
- 网络请求失败 → `togglePin` 捕获异常，`globalError` 显示错误
- 无效 JSON 请求体 → API 层返回 400
- 无认证操作 → `authMiddleware` 拦截，与现有 API 行为一致

## 向后兼容性

项目处于开发阶段，不考虑向后兼容性。所有 API 和 UI 变更直接进行。

- 新增 `pinned_at` 列默认 NULL，现有 memo 不受影响
- `GET /api/memos` 排序变更对所有现有消费者透明
- 新的 pin API 路由为纯增量，不影响现有路由
