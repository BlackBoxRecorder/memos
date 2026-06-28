# Seed Memo 标签解析设计

## 背景

`data/memos.txt` 作为种子数据文件，在首次启动时通过 `src/init/seed.ts` 导入到 SQLite 数据库。当前导入逻辑不支持标签——所有 memo 导入时 `tags: []`。但 `Memo` 模型和 `importMemo()` 均已支持 tags 字段，只需补齐数据文件和解析逻辑即可。

## 数据格式变更

### memos.txt 新增标签行

在每条 memo 的日期行下方增加标签行，格式如下：

```
---
--2025-05-23--
--tag: 哲学 | 格言 --

加尔定律经常被引用...
---
```

**规则：**
- 标签行格式：`--tag: tag1 | tag2 | tag3 --`
- 多个标签以 `|` 分割
- 解析时对每个标签做 trim，去除首尾空格
- 过滤掉 trim 后为空的标签
- 无标签的 memo 可省略该行

### 标签体系

共 15 个标签，每条 memo 分配 1-3 个：

| 标签 | 说明 |
|------|------|
| 哲学 | 庄子、道家、佛学、王阳明、斯多葛等思想 |
| 格言 | 名人名言、金句式表达 |
| 自我认知 | 做自己、听从内心、个体化、自由书写 |
| 人生 | 成功定义、生活态度、困境应对、心态 |
| 编程 | 写代码、Bug修复、工程实践 |
| AI | ChatGPT、Vibe Coding、AI 时代角色 |
| 独立开发 | 开源项目、AudioPen、产品思维 |
| 心理学 | 荣格、焦虑、欲望模仿、英雄崇拜 |
| 学习方法 | 狩猎式学习、费曼技巧、遗忘曲线 |
| 效率 | 高效能秘诀、时间管理、生产力 |
| 人际关系 | 沟通、冲突处理、他人评价 |
| 正念 | 一行禅师、觉察、修行 |
| 经典 | 庄子原文、孔子、黄粱一梦典故 |
| 文学 | 卡夫卡、诗词、故事 |
| 认知 | 判断力、认知升级、信念 |

## 代码变更

### src/init/seed.ts

**1. 新增 `parseTags` 函数**

```ts
function parseTags(entry: string): string[] {
  const match = entry.match(/^--tag:\s*(.+?)\s*--/m);
  if (!match) return [];
  return match[1]
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
```

**2. 修改 `seedMemosIfEmpty`——传入 tags**

将 `importMemo` 调用中的 `tags: []` 替换为 `tags: parseTags(entry)`。

### data/memos.txt

为每条 memo 在日期行下方添加 `--tag: ... --` 行，基于内容分配标签。分配方案另附完整映射表。

## 影响范围

- 仅影响首次启动种子数据导入逻辑
- 已有数据库不受影响（`seedMemosIfEmpty` 在表非空时跳过）
- `importMemo` 接口不变，标签存储格式不变（JSON 数组）
