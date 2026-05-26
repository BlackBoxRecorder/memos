# AI写作工具箱设计规格

<cite>
**本文档引用的文件**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [app.config.json](file://app.config.json)
- [ai.config.json](file://ai.config.json)
- [src/server.ts](file://src/server.ts)
- [src/api/ai.ts](file://src/api/ai.ts)
- [src/ai/service.ts](file://src/ai/service.ts)
- [src/ai/embeddings.ts](file://src/ai/embeddings.ts)
- [src/frontend/admin/components/GenerateModal.ts](file://src/frontend/admin/components/GenerateModal.ts)
- [src/frontend/admin/components/ChatPanel.ts](file://src/frontend/admin/components/ChatPanel.ts)
- [src/frontend/admin/creative.ts](file://src/frontend/admin/creative.ts)
- [src/frontend/admin/state.ts](file://src/frontend/admin/state.ts)
- [src/frontend/admin/ai-state.ts](file://src/frontend/admin/ai-state.ts)
- [data/system-prompts/creative.txt](file://data/system-prompts/creative.txt)
- [data/prompts/创意写作.txt](file://data/prompts/创意写作.txt)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

AI写作工具箱是基于Memos备忘录应用开发的一套智能写作辅助系统。该系统集成了多种AI模型提供商，提供了内容优化、标签建议、创意写作、对话式AI工作台等核心功能。系统采用前后端分离架构，后端基于Bun运行时和Hono框架，前端使用VanJS构建响应式管理界面。

该工具箱的主要目标是为用户提供智能化的写作辅助能力，包括但不限于：
- 多模型提供商支持（DeepSeek、Kimi、GLM、DashScope）
- 智能内容优化和改写
- 自动标签生成和管理
- 创意内容生成和上下文感知
- 对话式AI助手集成
- 语义搜索和内容关联

## 项目结构

项目采用模块化组织方式，主要分为以下几个核心部分：

```mermaid
graph TB
subgraph "后端服务"
Server[src/server.ts]
API[API路由层]
AI[AI服务层]
DB[数据库层]
Embeddings[嵌入向量层]
end
subgraph "前端界面"
Admin[管理后台]
Creative[创意写作模块]
Chat[对话面板]
Generate[生成模态框]
end
subgraph "配置文件"
AppConfig[应用配置]
AIConfig[AI提供商配置]
Prompts[系统提示词]
end
Server --> API
API --> AI
AI --> Embeddings
Admin --> Creative
Creative --> Generate
Chat --> AI
AppConfig --> Server
AIConfig --> AI
Prompts --> AI
```

**图表来源**
- [src/server.ts:1-125](file://src/server.ts#L1-L125)
- [src/api/ai.ts:1-297](file://src/api/ai.ts#L1-L297)
- [src/frontend/admin/creative.ts:1-349](file://src/frontend/admin/creative.ts#L1-L349)

**章节来源**
- [README.md:25-45](file://README.md#L25-L45)
- [package.json:1-28](file://package.json#L1-L28)

## 核心组件

### AI服务架构

AI写作工具箱的核心服务架构包含多个相互协作的组件：

#### 1. 多提供商AI集成
系统支持四个主要AI提供商，每个提供商都有独特的API端点和模型集合：

| 提供商 | ID | 主要模型 | API端点 |
|--------|----|----------|---------|
| DeepSeek | deepseek | deepseek-v4-pro, deepseek-v4-flash | https://api.deepseek.com/v1/chat/completions |
| Kimi | kimi | kimi-k2.5, kimi-k2.6 | https://api.moonshot.cn/v1/chat/completions |
| GLM | glm | glm-4.7, glm-4.7-flash, glm-5 | https://open.bigmodel.cn/api/paas/v4/chat/completions |
| DashScope | dashscope | 多种兼容模型 | https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions |

#### 2. 嵌入向量和语义搜索
系统实现了完整的向量嵌入和语义搜索功能：
- 使用DashScope的text-embedding-v3模型生成1024维向量
- 内存缓存机制提高查询性能
- 余弦相似度计算实现语义匹配
- 支持可选的rerank重排序功能

#### 3. 创意写作工作流
提供完整的创意内容生成流程：
- 上下文自动匹配和手动选择
- 多种生成模式（自动/手动）
- 实时流式输出显示
- 生成内容的存储和管理

**章节来源**
- [ai.config.json:1-44](file://ai.config.json#L1-L44)
- [src/ai/service.ts:23-75](file://src/ai/service.ts#L23-L75)
- [src/ai/embeddings.ts:13-64](file://src/ai/embeddings.ts#L13-L64)

## 架构概览

系统采用分层架构设计，确保各组件间的松耦合和高内聚：

```mermaid
graph TB
subgraph "表现层"
UI[VanJS前端界面]
Modals[模态框组件]
Panels[功能面板]
end
subgraph "业务逻辑层"
Creative[创意写作服务]
Chat[对话服务]
Tools[AI工具箱]
Tags[标签服务]
end
subgraph "数据访问层"
Embeddings[嵌入向量缓存]
Memory[内存存储]
Cache[缓存管理]
end
subgraph "外部服务"
Providers[AI提供商API]
DashScope[DashScope服务]
RateLimit[限流服务]
end
UI --> Modals
UI --> Panels
Panels --> Creative
Panels --> Chat
Creative --> Tools
Tools --> Tags
Creative --> Embeddings
Chat --> Embeddings
Tools --> Providers
Tags --> Providers
Embeddings --> DashScope
Creative --> RateLimit
Tools --> RateLimit
```

**图表来源**
- [src/frontend/admin/creative.ts:218-349](file://src/frontend/admin/creative.ts#L218-L349)
- [src/api/ai.ts:21-297](file://src/api/ai.ts#L21-L297)
- [src/ai/service.ts:447-507](file://src/ai/service.ts#L447-L507)

## 详细组件分析

### AI服务组件

#### 1. 多提供商配置管理

AI服务的核心是灵活的提供商配置系统：

```mermaid
classDiagram
class AiProviderConfig {
+string id
+string name
+string endpoint
+string apiKeyEnv
+string[] models
}
class AiConfig {
+AiProviderConfig[] providers
+DefaultConfig default
}
class ResolvedProvider {
+string baseUrl
+string apiKey
}
class AIService {
+loadConfig() AiConfig
+resolveProvider(string) ResolvedProvider
+isAiAvailable() Availability
+getAvailableModels() ModelList
}
AiConfig --> AiProviderConfig : contains
AIService --> AiConfig : uses
AIService --> ResolvedProvider : resolves
```

**图表来源**
- [src/ai/service.ts:23-86](file://src/ai/service.ts#L23-L86)
- [src/ai/service.ts:98-128](file://src/ai/service.ts#L98-L128)

#### 2. 流式聊天处理

系统实现了高效的流式聊天处理机制：

```mermaid
sequenceDiagram
participant Client as 客户端
participant API as AI API
participant Service as AIService
participant Provider as AI提供商
Client->>API : POST /api/ai/chat
API->>Service : chatStream(message, history)
Service->>Provider : 发送流式请求
Provider-->>Service : 返回数据块
Service->>Service : 解析SSE数据
Service-->>API : 传输增量内容
API-->>Client : 流式响应
Note over Client,Provider : 实时交互体验
```

**图表来源**
- [src/api/ai.ts:195-297](file://src/api/ai.ts#L195-L297)
- [src/ai/service.ts:480-506](file://src/ai/service.ts#L480-L506)

**章节来源**
- [src/ai/service.ts:177-245](file://src/ai/service.ts#L177-L245)
- [src/api/ai.ts:195-297](file://src/api/ai.ts#L195-L297)

### 嵌入向量和语义搜索

#### 1. 向量嵌入缓存系统

```mermaid
flowchart TD
Start([系统启动]) --> CheckConfig{检查AI配置}
CheckConfig --> |可用| LoadCache[加载现有嵌入缓存]
CheckConfig --> |不可用| SkipInit[跳过初始化]
LoadCache --> FindMissing[查找缺失的嵌入]
FindMissing --> GenerateLoop{还有待生成?}
GenerateLoop --> |是| GenerateEmbedding[生成嵌入向量]
GenerateEmbedding --> StoreCache[存储到缓存]
StoreCache --> GenerateLoop
GenerateLoop --> |否| Ready[系统就绪]
SkipInit --> Ready
Ready --> SemanticSearch[语义搜索请求]
SemanticSearch --> QueryEmbedding[生成查询嵌入]
QueryEmbedding --> CosineCalc[计算余弦相似度]
CosineCalc --> Threshold{超过阈值?}
Threshold --> |是| AddCandidate[加入候选集]
Threshold --> |否| NextMemo[下一个备忘录]
AddCandidate --> NextMemo
NextMemo --> SortResults[排序结果]
SortResults --> RerankCheck{启用重排序?}
RerankCheck --> |是| Rerank[DashScope重排序]
RerankCheck --> |否| ReturnResults[返回结果]
Rerank --> ReturnResults
```

**图表来源**
- [src/ai/embeddings.ts:16-64](file://src/ai/embeddings.ts#L16-L64)
- [src/ai/embeddings.ts:95-154](file://src/ai/embeddings.ts#L95-L154)

#### 2. 语义搜索算法

系统实现了两阶段的语义搜索算法：

1. **嵌入向量召回**：使用余弦相似度计算，获取高于阈值的候选备忘录
2. **重排序优化**：使用DashScope的qwen3-rerank模型对候选进行重新排序

**章节来源**
- [src/ai/embeddings.ts:77-93](file://src/ai/embeddings.ts#L77-L93)
- [src/ai/embeddings.ts:117-150](file://src/ai/embeddings.ts#L117-L150)

### 创意写作组件

#### 1. 生成模态框界面

创意写作功能通过模态框提供完整的用户体验：

```mermaid
classDiagram
class GenerateModal {
+boolean hasStarted
+string selectedPrompt
+string extraPromptInput
+string generationMode
+string manualMemoIds
+boolean generating
+string generateError
+renderPreviewBody() HTMLElement
+PreviewPanel() HTMLElement
+GenerateModal() HTMLElement
}
class PreviewPanel {
+boolean previewOpen
+PreviewMemo[] previewMemos
+boolean previewLoading
+boolean previewFetched
+loadPreviewContext() void
+resetPreview() void
}
class CreativeState {
+Prompt[] prompts
+CreativeItem[] creativeItems
+number selectedPromptId
+boolean generateModalOpen
+string streamContent
+boolean streamDone
}
GenerateModal --> PreviewPanel : contains
GenerateModal --> CreativeState : uses
PreviewPanel --> CreativeState : uses
```

**图表来源**
- [src/frontend/admin/components/GenerateModal.ts:138-392](file://src/frontend/admin/components/GenerateModal.ts#L138-L392)
- [src/frontend/admin/state.ts:112-172](file://src/frontend/admin/state.ts#L112-L172)

#### 2. 对话式AI面板

对话面板提供了类似ChatGPT的交互体验：

```mermaid
sequenceDiagram
participant User as 用户
participant ChatPanel as 对话面板
participant State as 状态管理
participant AI as AI服务
participant Embeddings as 嵌入向量
User->>ChatPanel : 输入消息
ChatPanel->>State : 更新chatInput
User->>ChatPanel : 点击发送
ChatPanel->>State : 添加用户消息
ChatPanel->>Embeddings : 获取相关备忘录
Embeddings-->>ChatPanel : 返回上下文
ChatPanel->>AI : 发送流式请求
AI-->>ChatPanel : 返回增量响应
ChatPanel->>State : 更新chatMessages
ChatPanel-->>User : 显示回复
Note over User,AI : 实时双向交互
```

**图表来源**
- [src/frontend/admin/components/ChatPanel.ts:14-198](file://src/frontend/admin/components/ChatPanel.ts#L14-L198)
- [src/frontend/admin/state.ts:156-164](file://src/frontend/admin/state.ts#L156-L164)

**章节来源**
- [src/frontend/admin/components/GenerateModal.ts:138-392](file://src/frontend/admin/components/GenerateModal.ts#L138-L392)
- [src/frontend/admin/components/ChatPanel.ts:14-198](file://src/frontend/admin/components/ChatPanel.ts#L14-L198)

### 配置管理系统

#### 1. 应用配置

系统配置采用JSON格式，支持运行时调整：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| ai.requestTimeoutMs | 120000 | AI请求超时时间（毫秒） |
| ai.defaultMaxTokens | 2048 | 默认最大生成tokens |
| ai.defaultTemperature | 0.7 | 默认温度参数 |
| embeddings.similarityThreshold | 0.5 | 语义相似度阈值 |
| rerank.enabled | true | 是否启用重排序 |
| rerank.candidateTopN | 30 | 候选数量 |
| rerank.finalTopN | 10 | 最终结果数量 |

#### 2. AI提供商配置

每个提供商都有详细的配置信息：

| 字段 | 类型 | 描述 |
|------|------|-------|
| id | string | 提供商唯一标识符 |
| name | string | 提供商名称 |
| endpoint | string | API端点地址 |
| apiKeyEnv | string | 环境变量名 |
| models | string[] | 支持的模型列表 |

**章节来源**
- [app.config.json:1-22](file://app.config.json#L1-L22)
- [ai.config.json:1-44](file://ai.config.json#L1-L44)

## 依赖关系分析

系统的关键依赖关系如下：

```mermaid
graph LR
subgraph "核心依赖"
Hono[Hono Web框架]
VanJS[VanJS前端框架]
Pretext[Pretext文本排版]
Dompurify[Dompurify安全处理]
end
subgraph "AI相关"
OpenAI[OpenAI兼容API]
DashScope[DashScope服务]
Fetch[标准fetch API]
end
subgraph "数据库"
SQLite[Bun SQLite驱动]
WAL[WAL模式]
end
subgraph "构建工具"
Bun[Bun运行时]
ESM[ESM模块]
end
Hono --> VanJS
VanJS --> Dompurify
OpenAI --> Fetch
DashScope --> Fetch
SQLite --> WAL
Bun --> ESM
```

**图表来源**
- [package.json:20-26](file://package.json#L20-L26)
- [src/server.ts:1-125](file://src/server.ts#L1-L125)

**章节来源**
- [package.json:1-28](file://package.json#L1-L28)
- [src/server.ts:1-125](file://src/server.ts#L1-L125)

## 性能考虑

### 1. 缓存策略

系统实现了多层次的缓存机制：

- **嵌入向量缓存**：内存中存储所有备忘录的向量表示
- **配置缓存**：避免重复读取配置文件
- **响应缓存**：对频繁请求的结果进行缓存

### 2. 流式处理

采用流式处理技术减少延迟：
- SSE（Server-Sent Events）实现实时响应
- 分块传输避免大响应阻塞
- 增量更新UI提升用户体验

### 3. 并发控制

- 限流机制防止API滥用
- 异常中断处理确保稳定性
- 超时控制避免长时间等待

## 故障排除指南

### 常见问题及解决方案

#### 1. AI服务不可用

**症状**：调用AI接口返回503错误
**原因**：缺少必要的API密钥或配置不正确
**解决方法**：
- 检查对应的环境变量是否设置
- 验证AI提供商配置文件
- 确认网络连接正常

#### 2. 嵌入向量生成失败

**症状**：语义搜索功能异常
**原因**：DashScope API密钥问题或网络错误
**解决方法**：
- 验证DASHSCOPE_API_KEY环境变量
- 检查网络连接和防火墙设置
- 查看服务器日志获取详细错误信息

#### 3. 流式响应中断

**症状**：聊天对话中出现连接中断
**原因**：客户端断开连接或超时
**解决方法**：
- 检查客户端网络稳定性
- 调整requestTimeoutMs配置
- 实现客户端重连机制

**章节来源**
- [src/ai/service.ts:98-115](file://src/ai/service.ts#L98-L115)
- [src/ai/embeddings.ts:16-64](file://src/ai/embeddings.ts#L16-L64)

## 结论

AI写作工具箱是一个功能完整、架构清晰的智能写作辅助系统。其主要特点包括：

1. **多提供商支持**：灵活的AI服务集成，支持多家主流AI提供商
2. **智能语义搜索**：基于向量嵌入的语义匹配和重排序机制
3. **实时交互体验**：流式处理提供接近实时的响应速度
4. **模块化设计**：清晰的组件分离便于维护和扩展
5. **性能优化**：多层缓存和并发控制确保系统稳定性

该系统为用户提供了一个强大而易用的AI写作平台，能够显著提升内容创作效率和质量。通过合理的架构设计和配置管理，系统具备了良好的可扩展性和维护性，为未来的功能扩展奠定了坚实基础。