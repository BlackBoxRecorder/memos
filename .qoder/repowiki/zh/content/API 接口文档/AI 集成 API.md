# AI 集成 API

<cite>
**本文引用的文件**
- [src/api/ai.ts](file://src/api/ai.ts)
- [src/ai/service.ts](file://src/ai/service.ts)
- [src/ai/embeddings.ts](file://src/ai/embeddings.ts)
- [src/server.ts](file://src/server.ts)
- [src/db.ts](file://src/db.ts)
- [src/api/creative.ts](file://src/api/creative.ts)
- [README.md](file://README.md)
- [package.json](file://package.json)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考量](#性能考量)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件为 AI 集成 API 的详细接口文档，覆盖以下能力：
- 内容优化：基于 DeepSeek 的内容润色与优化
- 智能标签建议：基于 DeepSeek 的标签生成与复用
- 嵌入向量与语义搜索：基于 DashScope 的文本嵌入与内存中的余弦相似度检索
- 创意内容生成：结合提示词、上下文与嵌入的流式生成

文档包含端点定义、HTTP 方法、URL 模式、请求参数、响应格式、实际使用示例、嵌入与语义搜索实现原理、API 密钥配置与错误处理指南。

## 项目结构
- 服务入口在主服务器中挂载子应用，其中 AI 相关路由位于 /api/ai，创意内容相关路由位于 /api/creative。
- AI 服务封装在独立模块中，分别对接 DeepSeek（对话/优化/标签）与 DashScope（嵌入），并提供嵌入缓存与语义搜索能力。
- 数据层通过 SQLite 提供基础 CRUD 与嵌入持久化。

```mermaid
graph TB
subgraph "服务端"
S["Hono 应用<br/>src/server.ts"]
AIAPI["AI 路由<br/>src/api/ai.ts"]
CREATIVEAPI["创意路由<br/>src/api/creative.ts"]
DB["数据库层<br/>src/db.ts"]
AISVC["AI 服务<br/>src/ai/service.ts"]
EMB["嵌入与语义搜索<br/>src/ai/embeddings.ts"]
end
S --> AIAPI
S --> CREATIVEAPI
AIAPI --> AISVC
CREATIVEAPI --> AISVC
CREATIVEAPI --> EMB
AISVC --> DB
EMB --> DB
```

图表来源
- [src/server.ts:74-80](file://src/server.ts#L74-L80)
- [src/api/ai.ts:1-67](file://src/api/ai.ts#L1-L67)
- [src/api/creative.ts:1-238](file://src/api/creative.ts#L1-L238)
- [src/ai/service.ts:1-289](file://src/ai/service.ts#L1-L289)
- [src/ai/embeddings.ts:1-99](file://src/ai/embeddings.ts#L1-L99)
- [src/db.ts:197-221](file://src/db.ts#L197-L221)

章节来源
- [src/server.ts:74-80](file://src/server.ts#L74-L80)
- [src/api/ai.ts:1-67](file://src/api/ai.ts#L1-L67)
- [src/api/creative.ts:1-238](file://src/api/creative.ts#L1-L238)
- [src/ai/service.ts:1-289](file://src/ai/service.ts#L1-L289)
- [src/ai/embeddings.ts:1-99](file://src/ai/embeddings.ts#L1-L99)
- [src/db.ts:197-221](file://src/db.ts#L197-L221)

## 核心组件
- AI 路由（/api/ai）
  - /api/ai/status：检测 AI 能力可用性（无需认证）
  - /api/ai/optimize：内容优化（需认证）
  - /api/ai/suggest-tags：标签建议（需认证）
- 嵌入与语义搜索
  - 内存缓存 + SQLite 持久化
  - 余弦相似度阈值筛选
- 创意内容生成（/api/creative）
  - 流式生成创意内容（SSE）
  - 支持手动指定上下文或基于嵌入的语义检索

章节来源
- [src/api/ai.ts:8-66](file://src/api/ai.ts#L8-L66)
- [src/ai/embeddings.ts:7-86](file://src/ai/embeddings.ts#L7-L86)
- [src/api/creative.ts:112-228](file://src/api/creative.ts#L112-L228)

## 架构总览
AI 集成以“服务层 + 路由层 + 数据层”分层组织：
- 路由层负责鉴权、参数校验与错误处理
- 服务层封装 DeepSeek/DashScope 的调用细节与超时控制
- 数据层负责嵌入持久化与基础 CRUD

```mermaid
sequenceDiagram
participant C as "客户端"
participant S as "Hono 应用<br/>src/server.ts"
participant A as "AI 路由<br/>src/api/ai.ts"
participant SVC as "AI 服务<br/>src/ai/service.ts"
participant DB as "数据库<br/>src/db.ts"
C->>S : 请求 /api/ai/optimize
S->>A : 转发到 AI 路由
A->>A : 校验请求体与鉴权
A->>SVC : optimizeContent(content)
SVC->>SVC : deepseekChat(messages)
SVC-->>A : 返回优化结果
A-->>C : { content }
Note over SVC,DB : 语义搜索时会调用 SVC.generateEmbedding 并持久化
```

图表来源
- [src/server.ts:74-80](file://src/server.ts#L74-L80)
- [src/api/ai.ts:13-40](file://src/api/ai.ts#L13-L40)
- [src/ai/service.ts:81-90](file://src/ai/service.ts#L81-L90)

## 详细组件分析

### AI 路由与端点
- /api/ai/status
  - 方法：GET
  - 认证：否
  - 响应：包含 optimize、embedding、tags、available 的布尔值对象
  - 用途：前端根据可用性决定是否显示相关功能
- /api/ai/optimize
  - 方法：POST
  - 认证：是（Cookie）
  - 请求体：{ content: string }
  - 响应：{ content: string } 或错误对象
  - 行为：调用 DeepSeek 对内容进行优化，返回优化后的文本
- /api/ai/suggest-tags
  - 方法：POST
  - 认证：是（Cookie）
  - 请求体：{ content: string }
  - 响应：{ tags: string[] } 或错误对象
  - 行为：调用 DeepSeek 生成 1-3 个标签；优先复用现有标签；回退到行/逗号分割提取

章节来源
- [src/api/ai.ts:8-66](file://src/api/ai.ts#L8-L66)

### AI 服务实现（DeepSeek + DashScope）
- 可用性检测
  - 依据环境变量 DEEPSEEK_API_KEY 与 DASHSCOPE_API_KEY 判断 optimize/tags 与 embedding 是否可用
- DeepSeek 对话
  - 使用 /v1/chat/completions，模型为 deepseek-v4-flash
  - 超时时间 60 秒，失败时记录日志并返回空值
  - 优化与标签建议均通过该对话接口完成
- DashScope 嵌入
  - 使用 /compatible-mode/v1/embeddings，模型 text-embedding-v3，维度 1024
  - 返回 Float32Array，失败时记录日志并返回空值
- 创意内容生成
  - 支持同步生成与流式生成（SSE）
  - 流式生成解析 data: 行，逐块推送增量内容

```mermaid
classDiagram
class AIService {
+isAiAvailable() object
+optimizeContent(content) string|null
+suggestTags(content, existingTags) string[]
+generateEmbedding(text) Float32Array|null
+generateCreativeContent(prompt, extra, context) string|null
+generateCreativeContentStream(prompt, extra, context) AsyncGenerator
}
class DeepSeek {
+baseUrl() string|null
+chat(messages) string|null
}
class DashScope {
+baseUrl() string|null
+embeddings(text) Float32Array|null
}
AIService --> DeepSeek : "调用"
AIService --> DashScope : "调用"
```

图表来源
- [src/ai/service.ts:12-26](file://src/ai/service.ts#L12-L26)
- [src/ai/service.ts:36-69](file://src/ai/service.ts#L36-L69)
- [src/ai/service.ts:147-181](file://src/ai/service.ts#L147-L181)

章节来源
- [src/ai/service.ts:12-26](file://src/ai/service.ts#L12-L26)
- [src/ai/service.ts:36-69](file://src/ai/service.ts#L36-L69)
- [src/ai/service.ts:147-181](file://src/ai/service.ts#L147-L181)
- [src/ai/service.ts:185-208](file://src/ai/service.ts#L185-L208)
- [src/ai/service.ts:212-288](file://src/ai/service.ts#L212-L288)

### 嵌入向量与语义搜索
- 初始化
  - 启动时从数据库加载已有嵌入到内存 Map，键为 memo_id，值为 Float32Array
- 生成与存储
  - generateAndStoreEmbedding：生成嵌入并写入缓存与数据库
- 查询
  - getSemanticResults：对查询文本生成嵌入，与缓存中向量计算余弦相似度，超过阈值（0.3）即纳入候选，按分数降序取前 N
- 阈值与限制
  - SIMILARITY_THRESHOLD = 0.3
  - 默认 limit = 20

```mermaid
flowchart TD
Start(["开始"]) --> Gen["生成查询向量"]
Gen --> Loop{"遍历缓存向量"}
Loop --> |计算余弦相似度| Score["比较阈值"]
Score --> |≥阈值| Add["加入候选集"]
Score --> |<阈值| Skip["跳过"]
Add --> Next["继续遍历"]
Skip --> Next
Next --> |遍历完| Sort["按分数排序"]
Sort --> Limit["截取前 N"]
Limit --> End(["结束"])
```

图表来源
- [src/ai/embeddings.ts:66-86](file://src/ai/embeddings.ts#L66-L86)
- [src/ai/embeddings.ts:48-64](file://src/ai/embeddings.ts#L48-L64)

章节来源
- [src/ai/embeddings.ts:7-35](file://src/ai/embeddings.ts#L7-L35)
- [src/ai/embeddings.ts:48-64](file://src/ai/embeddings.ts#L48-L64)
- [src/ai/embeddings.ts:66-86](file://src/ai/embeddings.ts#L66-L86)
- [src/db.ts:199-221](file://src/db.ts#L199-L221)

### 创意内容生成（流式）
- 端点：/api/creative/generate
- 请求体：
  - prompt_id: number（必填）
  - extra_prompt: string（必填）
  - memo_ids: number[]（可选，手动指定上下文备忘录）
- 上下文策略：
  - 若提供 memo_ids，则直接读取对应备忘录内容作为上下文
  - 否则先生成 extra_prompt 的嵌入，再通过 getSemanticResults 获取相似备忘录作为上下文
- 流式输出：
  - SSE，逐块推送 { type: "content", content: string }
  - 完成后推送 { type: "done", item }，item 为保存到数据库的创意条目
- 错误处理：
  - 生成异常时推送 { type: "error", error }

```mermaid
sequenceDiagram
participant C as "客户端"
participant API as "创意路由<br/>src/api/creative.ts"
participant SVC as "AI 服务<br/>src/ai/service.ts"
participant EMB as "嵌入与语义搜索<br/>src/ai/embeddings.ts"
participant DB as "数据库<br/>src/db.ts"
C->>API : POST /api/creative/generate
API->>API : 校验参数与鉴权
alt 提供 memo_ids
API->>DB : 读取指定备忘录内容
else 未提供 memo_ids
API->>SVC : generateEmbedding(extra_prompt)
API->>EMB : getSemanticResults(extra_prompt)
EMB-->>API : 相似 memo_id 列表
API->>DB : 读取相似备忘录内容
end
API->>SVC : generateCreativeContentStream(prompt, extra, context)
SVC-->>API : 逐块返回增量内容
API-->>C : SSE data : {type : "content", ...}
API->>DB : 保存创意内容与上下文信息
API-->>C : SSE data : {type : "done", item}
```

图表来源
- [src/api/creative.ts:112-228](file://src/api/creative.ts#L112-L228)
- [src/ai/service.ts:212-288](file://src/ai/service.ts#L212-L288)
- [src/ai/embeddings.ts:66-86](file://src/ai/embeddings.ts#L66-L86)

章节来源
- [src/api/creative.ts:112-228](file://src/api/creative.ts#L112-L228)
- [src/ai/service.ts:212-288](file://src/ai/service.ts#L212-L288)
- [src/ai/embeddings.ts:66-86](file://src/ai/embeddings.ts#L66-L86)

## 依赖关系分析
- 服务层依赖
  - Hono（路由框架）
  - bun:sqlite（数据库）
  - fetch（HTTP 客户端）
- 环境变量
  - DEEPSEEK_API_KEY：DeepSeek 认证
  - DEEPSEEK_BASE_URL：DeepSeek 基础地址（可选，默认官方域名）
  - DASHSCOPE_API_KEY：DashScope 认证
  - PORT：服务端口（默认 3020）
  - MEMOS_SECRET_KEY：管理后台密钥（非 AI 相关）

```mermaid
graph LR
P["package.json 依赖"] --> H["hono"]
P --> PT["pretext"]
P --> VJ["vanjs-core"]
ENV["环境变量"] --> DS["DeepSeek API"]
ENV --> DSC["DashScope API"]
ENV --> DB["SQLite 数据库"]
SVC["AI 服务<br/>src/ai/service.ts"] --> DS
SVC --> DSC
EMB["嵌入与语义搜索<br/>src/ai/embeddings.ts"] --> DSC
EMB --> DB
```

图表来源
- [package.json:16-20](file://package.json#L16-L20)
- [src/ai/service.ts:18-25](file://src/ai/service.ts#L18-L25)
- [src/db.ts:197-221](file://src/db.ts#L197-L221)

章节来源
- [package.json:16-20](file://package.json#L16-L20)
- [src/ai/service.ts:18-25](file://src/ai/service.ts#L18-L25)
- [src/db.ts:197-221](file://src/db.ts#L197-L221)

## 性能考量
- 超时控制
  - AI 请求统一设置 60 秒超时，避免阻塞
- 嵌入缓存
  - 启动时加载数据库中的嵌入到内存，避免每次查询都调用外部 API
  - 余弦相似度计算为 O(n*d)，n 为缓存向量数量，d 为向量维度
- 流式生成
  - 创意内容生成采用流式输出，降低首屏等待时间
- 建议
  - 控制标签建议返回数量上限（当前最大 5）
  - 在高并发场景下考虑对 DeepSeek/DashScope 的调用做限流或队列化

[本节为通用性能讨论，不直接分析具体文件]

## 故障排查指南
- 状态检测
  - 访问 /api/ai/status 查看 optimize/tags/embedding/available 的可用性
- 常见错误与原因
  - 400：请求体无效或缺少 content
  - 503：对应功能未配置（如未设置 DEEPSEEK_API_KEY 或 DASHSCOPE_API_KEY）
  - 500：AI 服务不可用或外部 API 调用失败
- 日志定位
  - 服务端会打印 DeepSeek/DashScope 的错误状态与异常堆栈
- 配置核对
  - 确认 DEEPSEEK_API_KEY 与 DASHSCOPE_API_KEY 已正确设置
  - 如需自定义 DeepSeek 基础地址，设置 DEEPSEEK_BASE_URL

章节来源
- [src/api/ai.ts:14-40](file://src/api/ai.ts#L14-L40)
- [src/api/ai.ts:42-66](file://src/api/ai.ts#L42-L66)
- [src/ai/service.ts:58-68](file://src/ai/service.ts#L58-L68)
- [src/ai/service.ts:168-170](file://src/ai/service.ts#L168-L170)

## 结论
本项目提供了完整的 AI 集成功能：内容优化、标签建议、嵌入与语义搜索、创意内容生成（含流式）。通过清晰的路由分层与服务封装，既保证了易用性，也便于扩展与维护。建议在生产环境中合理配置密钥与超时参数，并结合业务需求对返回数量与相似度阈值进行调优。

[本节为总结性内容，不直接分析具体文件]

## 附录

### 端点一览与示例

- /api/ai/status
  - 方法：GET
  - 示例：curl http://localhost:3020/api/ai/status
  - 响应：包含 optimize、embedding、tags、available 的布尔值对象
- /api/ai/optimize
  - 方法：POST
  - 认证：Cookie（管理员登录后）
  - 请求体：{ "content": "你的备忘录内容" }
  - 响应：{ "content": "优化后的文本" }
  - 示例：curl -X POST http://localhost:3020/api/ai/optimize -H "Content-Type: application/json" -d '{"content":"你的备忘录内容"}'
- /api/ai/suggest-tags
  - 方法：POST
  - 认证：Cookie（管理员登录后）
  - 请求体：{ "content": "你的备忘录内容" }
  - 响应：{ "tags": ["tag1","tag2"] }
  - 示例：curl -X POST http://localhost:3020/api/ai/suggest-tags -H "Content-Type: application/json" -d '{"content":"你的备忘录内容"}'

章节来源
- [src/api/ai.ts:8-66](file://src/api/ai.ts#L8-L66)

### 嵌入与语义搜索使用流程
- 生成并存储嵌入
  - 调用生成函数，得到 Float32Array 后写入缓存与数据库
- 语义搜索
  - 输入查询文本，生成查询向量
  - 与缓存向量计算余弦相似度，超过阈值的进入候选
  - 按分数排序，取前 N 个 memo_id

章节来源
- [src/ai/embeddings.ts:88-98](file://src/ai/embeddings.ts#L88-L98)
- [src/ai/embeddings.ts:66-86](file://src/ai/embeddings.ts#L66-L86)

### API 密钥配置
- DEEPSEEK_API_KEY：用于 DeepSeek 对话与创意生成
- DEEPSEEK_BASE_URL：可选，自定义 DeepSeek 基础地址
- DASHSCOPE_API_KEY：用于 DashScope 嵌入
- PORT：服务端口（默认 3020）
- MEMOS_SECRET_KEY：管理后台登录密钥（非 AI 相关）

章节来源
- [src/ai/service.ts:18-25](file://src/ai/service.ts#L18-L25)
- [README.md:59-65](file://README.md#L59-L65)