# Seed Memo 日期解析导入

## 概述

修改首次启动种子数据导入逻辑，使 `memos.txt` 中的每条 memo 使用其自带日期行（`--YYYY-MM-DD--`）作为 `created_at`，而非当前时间。无有效日期行的条目将被跳过。

## 背景

`data/memos.txt` 是项目预置的示例 memo 数据集，格式为：

```
---
--2025-05-23--

加尔定律经常被引用...
---
--2025-05-24--

卡尔·荣格的观点...
---
```

每条 memo：
- 由 `---` 分割
- 首行为日期标记：`--YYYY-MM-DD--`
- 后续为文本内容

当前 `seedMemosIfEmpty()` 使用 `createMemo()` 导入，所有 memo 的 `created_at` 均为导入时的当前时间，丢失了原始日期信息。

## 设计

### 修改范围

仅修改 **`src/init/seed.ts`** 中的 `seedMemosIfEmpty()` 函数。

### 新增函数：`parseMemoDate`

```typescript
function parseMemoDate(entry: string): { date: string; content: string } | null
```

- 用正则 `/^--(\d{4}-\d{2}-\d{2})--/m` 匹配条目首行
- 提取日期部分，拼接为 ISO 时间戳格式 `YYYY-MM-DDT00:00:00`
- 返回去掉日期行的纯文本内容
- 匹配失败返回 `null`

### 修改导入循环

将 `seedMemosIfEmpty()` 中的处理循环从：

```
createMemo(entry, true)
```

改为：

```
const parsed = parseMemoDate(entry)
if (!parsed) → 跳过 + warn 日志
importMemo({ content: parsed.content, tags: [], is_public: true, created_at: parsed.date })
```

### 边界处理

| 场景 | 行为 |
|------|------|
| 正常条目（含日期行） | 解析日期，导入 |
| 无日期行 | 跳过，打印 warn |
| 日期格式不匹配 | 跳过，打印 warn |
| 日期行后无实质内容 | 跳过 |

### 依赖

- 使用 `db.ts` 中已有的 `importMemo()` 函数（L411-432），无需修改
- 无需修改数据模型、API、前端或其他模块

## 验证

- 删除 `memos.db` 后重启服务，检查数据库中各 memo 的 `created_at` 是否为对应日期
- 检查日志中正确跳过的条目数量
- 确认无日期条目不出现新导入的 memo 中
