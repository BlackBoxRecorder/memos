# Memos

一个轻量级的备忘录应用系统，基于 [Bun](https://bun.com) 运行时构建。支持公开/私密备忘录管理、标签分类、全文搜索，并提供瀑布流展示界面和独立的管理后台。

## 功能特性

- **📝 备忘录管理** — 创建、编辑、删除备忘录，支持公开和私密两种可见性
- **🏷️ 标签分类** — 为备忘录添加标签，按标签筛选浏览
- **🔍 全文搜索** — 实时搜索备忘录内容，支持按需过滤
- **🌊 瀑布流展示** — 首页采用 Masonry 瀑布流布局，自适应多列排列
- **🔐 管理后台** — 独立的管理员 SPA 界面，通过密钥认证登录
- **🪶 轻量无依赖** — 基于 Bun 内置 API（SQLite + HTTP Server）

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.com) |
| 数据库 | SQLite（`bun:sqlite`，WAL 模式） |
| 前端（首页） | [@chenglou/pretext](https://github.com/chenglou/pretext) 文字排版 |
| 前端（管理后台） | [VanJS](https://vanjs.org/) 响应式 UI |
| 认证 | Cookie + 内存 Session |
| 构建 | `Bun.build`（服务端按需编译 TS → JS） |

## 项目结构

```
memos/
├── src/
│   ├── server.ts          # 主服务入口（路由、构建、静态文件）
│   ├── db.ts              # 数据库层（SQLite 初始化、CRUD、seed）
│   ├── auth.ts            # 认证逻辑（Session/Cookie 管理）
│   ├── api/
│   │   ├── auth.ts        # 认证 API（登录/登出/状态检查）
│   │   └── memos.ts       # 备忘录 API（CRUD + 标签）
│   ├── admin/
│   │   ├── index.html     # 管理后台 HTML 模板 + 样式
│   │   └── app.ts         # 管理后台 SPA（VanJS）
│   └── masonry/
│       ├── index.html     # 首页瀑布流 HTML 模板 + 搜索栏
│       └── index.ts       # 瀑布流布局引擎 + 数据获取
├── package.json
├── tsconfig.json
└── memos.db               # SQLite 数据库文件（自动创建）
```

## 快速开始

### 环境要求

- [Bun](https://bun.com) >= 1.3.3

### 安装

```bash
bun install
```

### 环境变量（可选）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3020` | 服务器监听端口 |
| `MEMOS_SECRET_KEY` | `memos-dev-test` | 管理员登录密钥 |

### 数据库初始化

数据库会在首次启动时自动初始化：

- 自动创建 `memos.db` 文件（SQLite，WAL 模式）
- 自动创建 `memos` 表（id、content、tag、is_public、created_at、updated_at）

### 运行

```bash
# 开发模式（热重载）
bun run dev

# 生产模式
bun run start
```

启动后访问：

- **首页（瀑布流）**：http://localhost:3020
- **管理后台**：http://localhost:3020/admin

## 管理后台

管理后台位于 `/admin`，通过密钥认证登录（默认密钥 `memos-dev-test`，可通过 `MEMOS_SECRET_KEY` 环境变量修改）。

功能包括：

- **创建备忘录** — 填写内容、标签，设置公开/私密
- **编辑备忘录** — 修改内容、标签、可见性
- **删除备忘录** — 含二次确认
- **切换可见性** — 一键切换公开/私密状态
- **查看全部备忘录** — 包括公开和私密（管理员视角）

## API 接口

所有 API 路径前缀为 `/api`。需要认证的接口需携带 Cookie（通过 `/api/auth/login` 获取）。

### 认证

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/auth/check` | 否 | 检查当前登录状态 |
| `POST` | `/api/auth/login` | 否 | 登录，Body: `{ "key": "secret" }` |
| `POST` | `/api/auth/logout` | 否 | 登出，清除 Cookie |

### 备忘录

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/memos` | 可选 | 获取备忘录列表 |
| `GET` | `/api/memos/tags` | 否 | 获取所有标签 |
| `POST` | `/api/memos` | 是 | 创建备忘录 |
| `PUT` | `/api/memos/:id` | 是 | 更新备忘录 |
| `DELETE` | `/api/memos/:id` | 是 | 删除备忘录 |

#### GET /api/memos 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 全文搜索（LIKE 匹配 content） |
| `tag` | string | 按标签精确筛选 |
| `all` | string | 设为 `"true"` 时返回包含私密备忘录（需认证） |

#### 请求/响应示例

**创建备忘录：**

```bash
curl -X POST http://localhost:3020/api/memos \
  -H "Content-Type: application/json" \
  -d '{"content": "今日备忘", "is_public": true, "tag": "work"}'
```

响应：

```json
{
  "memo": {
    "id": 1,
    "content": "今日备忘",
    "tag": "work",
    "is_public": true,
    "created_at": "2026-05-08 12:00:00",
    "updated_at": "2026-05-08 12:00:00"
  }
}
```

**获取备忘录列表（含搜索和标签筛选）：**

```bash
curl "http://localhost:3020/api/memos?search=备忘&tag=work"
```

响应：

```json
{
  "memos": [
    {
      "id": 1,
      "content": "今日备忘",
      "tag": "work",
      "is_public": true,
      "created_at": "2026-05-08 12:00:00",
      "updated_at": "2026-05-08 12:00:00"
    }
  ]
}
```

## 瀑布流展示

首页采用 Masonry 瀑布流布局，基于 `@chenglou/pretext` 进行文字预排版，实现精确的卡片高度计算。特性：

- **自适应列数** — 根据视口宽度自动调整列数（窄屏单列，宽屏多列）
- **虚拟滚动** — 只渲染可视区域内的卡片，滚动时动态回收/创建 DOM 节点
- **搜索栏** — 顶部固定搜索栏，支持关键词搜索和标签下拉筛选
- **URL 同步** — 搜索/标签状态同步到 URL 参数，支持浏览器前进/后退和书签
