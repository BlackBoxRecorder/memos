# Flomo HTML导入脚本

<cite>
**本文档引用的文件**
- [import-flomo.ts](file://script/import-flomo.ts)
- [export-import.ts](file://src/api/export-import.ts)
- [db.ts](file://src/db.ts)
- [model.ts](file://src/model.ts)
- [README.md](file://README.md)
- [package.json](file://package.json)
</cite>

## 更新摘要
**变更内容**
- 新增了Web API端点 `/api/import-flomo` 支持HTTP导入
- HTML实体解码功能在脚本和API中均实现了完整的实体映射
- 标签提取功能支持更精确的#标签格式识别和去重
- 去重检查机制在导入过程中提供重复数据过滤
- SQLite数据库已启用WAL模式优化，提升并发性能
- 增加了WAL checkpoint机制确保数据一致性

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [API端点详解](#api端点详解)
7. [依赖关系分析](#依赖关系分析)
8. [性能考虑](#性能考虑)
9. [故障排除指南](#故障排除指南)
10. [结论](#结论)

## 简介

Flomo HTML导入脚本是一个专门用于将Flomo导出的HTML文件中的备忘录数据批量导入到MemOS系统中的工具。该脚本通过解析Flomo的HTML格式，提取备忘录内容、时间和标签信息，并将其转换为MemOS可识别的数据格式，最终导入到SQLite数据库中。

### 主要功能特性

- **HTML解析**：准确解析Flomo导出的HTML文件结构
- **内容转换**：将HTML内容转换为纯文本格式
- **HTML实体解码**：完整支持常见HTML实体字符解码
- **标签提取**：自动从内容中提取#标签格式的标签
- **去重处理**：避免重复导入相同内容的备忘录
- **批量导入**：支持一次性导入大量备忘录记录
- **WAL优化**：SQLite WAL模式提升并发性能
- **错误处理**：完善的错误处理和日志输出机制
- **Web API支持**：提供HTTP接口进行远程导入

## 项目结构

该项目采用模块化的架构设计，主要包含以下核心目录和文件：

```mermaid
graph TB
subgraph "项目根目录"
A[script/] --> B[import-flomo.ts]
C[src/] --> D[api/]
C --> E[db.ts]
C --> F[model.ts]
G[package.json] --> H[依赖管理]
I[README.md] --> J[项目文档]
end
subgraph "API层"
D --> K[export-import.ts]
D --> L[auth.ts]
D --> M[memos.ts]
end
subgraph "数据库层"
E --> N[SQLite操作]
E --> O[数据模型]
E --> P[导入导出功能]
end
subgraph "前端层"
Q[frontend/] --> R[masonry/]
Q --> S[admin/]
Q --> T[shared/]
end
```

**图表来源**
- [import-flomo.ts:1-236](file://script/import-flomo.ts#L1-L236)
- [db.ts:1-484](file://src/db.ts#L1-L484)
- [export-import.ts:1-469](file://src/api/export-import.ts#L1-L469)

**章节来源**
- [README.md:25-45](file://README.md#L25-L45)
- [package.json:1-26](file://package.json#L1-L26)

## 核心组件

### 导入脚本核心组件

脚本主要由以下几个核心组件构成：

1. **FlomoRecord接口**：定义Flomo记录的数据结构
2. **HTML实体解码器**：处理HTML特殊字符，支持完整实体映射
3. **HTML转纯文本转换器**：将HTML内容转换为可读的纯文本
4. **标签提取器**：从文本中提取#标签格式的标签
5. **HTML解析器**：解析Flomo导出的HTML文件
6. **主流程控制器**：协调整个导入过程

### 数据库集成组件

- **initDb函数**：初始化SQLite数据库连接，启用WAL模式
- **importMemo函数**：将单个备忘录导入数据库
- **memoContentExists函数**：检查内容是否已存在
- **getDb函数**：获取数据库连接实例

### Web API组件

- **/api/import-flomo端点**：提供HTTP接口进行Flomo导入
- **Flomo HTML解析器**：在API层实现完整的HTML解析功能
- **WAL checkpoint机制**：确保导入后数据一致性

**章节来源**
- [import-flomo.ts:13-134](file://script/import-flomo.ts#L13-L134)
- [db.ts:15-61](file://src/db.ts#L15-L61)
- [db.ts:407-428](file://src/db.ts#L407-L428)
- [export-import.ts:385-468](file://src/api/export-import.ts#L385-L468)

## 架构概览

```mermaid
sequenceDiagram
participant User as 用户
participant Script as 导入脚本
participant API as Web API
participant Parser as HTML解析器
participant Converter as 文本转换器
participant DB as SQLite数据库
participant Checker as 去重检查器
User->>Script : 运行导入脚本
Script->>Parser : 读取并解析HTML文件
Parser->>Converter : 转换HTML为纯文本
Converter->>Checker : 提取标签和检查重复
Checker->>DB : 检查内容是否存在
alt 内容不存在
Checker->>DB : 导入新备忘录
DB-->>Script : 返回导入结果
else 内容已存在
Checker->>Script : 跳过重复记录
end
Script->>DB : 执行WAL checkpoint
Script-->>User : 输出导入统计结果
```

**图表来源**
- [import-flomo.ts:138-233](file://script/import-flomo.ts#L138-L233)
- [db.ts:458-465](file://src/db.ts#L458-L465)

## 详细组件分析

### HTML解析器组件

HTML解析器是整个脚本的核心组件，负责从Flomo导出的HTML文件中提取备忘录数据。

#### 解析流程

```mermaid
flowchart TD
Start([开始解析]) --> ReadFile["读取HTML文件"]
ReadFile --> ExtractBlocks["提取memo块"]
ExtractBlocks --> ParseTime["解析时间信息"]
ParseTime --> ParseContent["解析内容HTML"]
ParseContent --> ConvertText["转换为纯文本"]
ConvertText --> DecodeEntities["HTML实体解码"]
DecodeEntities --> ExtractTags["提取标签"]
ExtractTags --> ValidateData{"验证数据"}
ValidateData --> |有效| AddRecord["添加到记录数组"]
ValidateData --> |无效| SkipRecord["跳过记录"]
AddRecord --> NextBlock{"还有更多块?"}
SkipRecord --> NextBlock
NextBlock --> |是| ExtractBlocks
NextBlock --> |否| ReturnRecords["返回记录数组"]
ReturnRecords --> End([解析完成])
```

**图表来源**
- [import-flomo.ts:96-134](file://script/import-flomo.ts#L96-L134)

#### 关键实现细节

- **正则表达式匹配**：使用复杂的正则表达式来定位和提取每个备忘录块
- **嵌套块处理**：正确处理嵌套的HTML结构
- **边界检测**：智能检测块的边界，包括下一个同类div、容器结束标签或文件末尾

**章节来源**
- [import-flomo.ts:96-134](file://script/import-flomo.ts#L96-L134)

### HTML实体解码器组件

HTML实体解码器提供了完整的HTML特殊字符解码功能，支持多种常见的HTML实体。

#### 实体映射表

| HTML实体 | 字符表示 | Unicode码点 |
|---------|---------|------------|
| &amp; | `&` | U+0026 |
| &lt; | `<` | U+003C |
| &gt; | `>` | U+003E |
| &quot; | `"` | U+0022 |
| &#39; | `'` | U+0027 |
| &apos; | `'` | U+0027 |
| &nbsp; | 空格 | U+00A0 |

#### 解码算法

```mermaid
flowchart TD
Start([开始解码]) --> ScanText["扫描文本中的HTML实体"]
ScanText --> MatchEntity{"匹配实体模式?"}
MatchEntity --> |是| LookupMap["查找实体映射表"]
LookupMap --> ReplaceChar["替换为对应字符"]
ReplaceChar --> NextEntity["继续下一个实体"]
MatchEntity --> |否| NextChar["检查下一个字符"]
ReplaceChar --> NextEntity
NextChar --> ScanText
NextEntity --> ScanText
ScanText --> |扫描完成| ReturnText["返回解码后的文本"]
ReturnText --> End([解码完成])
```

**图表来源**
- [import-flomo.ts:21-36](file://script/import-flomo.ts#L21-L36)

**章节来源**
- [import-flomo.ts:21-36](file://script/import-flomo.ts#L21-L36)

### 文本转换器组件

文本转换器负责将HTML内容转换为纯文本格式，确保导入的数据格式统一且可读。

#### 转换规则

| HTML元素 | 转换规则 | 示例 |
|---------|---------|------|
| `<br>` 和 `<hr>` | 转换为换行符 | `<br>` → `\n` |
| 块级元素结束标签 | 转换为换行符 | `</p>` → `\n` |
| 列表和表格容器结束标签 | 转换为换行符 | `</ul>` → `\n` |
| 其余HTML标签 | 完全移除 | `<strong>` → "" |
| HTML实体 | 解码为对应字符 | `&amp;` → `&` |

**章节来源**
- [import-flomo.ts:49-72](file://script/import-flomo.ts#L49-L72)

### 标签提取器组件

标签提取器从纯文本中自动识别和提取#标签格式的标签。

#### 提取算法

```mermaid
flowchart TD
Start([开始提取]) --> FindHash["查找#字符"]
FindHash --> CheckPattern{"匹配#标签模式?"}
CheckPattern --> |是| ExtractTag["提取标签名称"]
CheckPattern --> |否| NextChar["检查下一个字符"]
ExtractTag --> ValidateTag{"验证标签有效性"}
ValidateTag --> |有效| AddToSet["添加到集合"]
ValidateTag --> |无效| NextChar
AddToSet --> NextChar
NextChar --> FindHash
FindHash --> |到达末尾| RemoveDuplicates["移除重复标签"]
RemoveDuplicates --> ReturnTags["返回标签数组"]
ReturnTags --> End([提取完成])
```

**图表来源**
- [import-flomo.ts:81-88](file://script/import-flomo.ts#L81-L88)

**章节来源**
- [import-flomo.ts:81-88](file://script/import-flomo.ts#L81-L88)

### 数据库集成组件

数据库集成组件提供了与SQLite数据库交互的所有功能，包括初始化、查询、插入和更新操作。

#### 数据库模式

```mermaid
erDiagram
MEMOS {
INTEGER id PK
TEXT content
TEXT tags
INTEGER is_public
TEXT pinned_at
TEXT created_at
TEXT updated_at
}
PROMPTS {
INTEGER id PK
TEXT title
TEXT content
TEXT created_at
TEXT updated_at
}
CREATIVE {
INTEGER id PK
INTEGER prompt_id FK
TEXT extra_prompt
BLOB embedding
TEXT content
TEXT context_memo_ids
TEXT created_at
TEXT updated_at
}
MEMO_EMBEDDINGS {
INTEGER memo_id PK
BLOB embedding
TEXT updated_at
}
PROMPTS ||--o{ CREATIVE : contains
MEMOS ||--o{ MEMO_EMBEDDINGS : has
```

**图表来源**
- [db.ts:18-60](file://src/db.ts#L18-L60)

**章节来源**
- [db.ts:18-60](file://src/db.ts#L18-L60)
- [model.ts:1-28](file://src/model.ts#L1-L28)

## API端点详解

### /api/import-flomo 端点

新增的Web API端点提供了HTTP接口来导入Flomo HTML文件，支持远程导入操作。

#### 端点配置

- **方法**：POST
- **路径**：`/api/import-flomo`
- **认证**：需要管理员认证
- **请求体**：multipart/form-data，包含HTML文件字段

#### 请求处理流程

```mermaid
flowchart TD
Start([接收请求]) --> ParseBody["解析multipart请求体"]
ParseBody --> ValidateFile{"验证文件存在?"}
ValidateFile --> |否| ReturnError["返回错误响应"]
ValidateFile --> |是| ReadFile["读取文件内容"]
ReadFile --> ParseHTML["解析Flomo HTML"]
ParseHTML --> ValidateRecords{"验证记录有效性"}
ValidateRecords --> |否| ReturnEmpty["返回空记录响应"]
ValidateRecords --> |是| ProcessRecords["逐条处理记录"]
ProcessRecords --> DedupeCheck{"检查重复?"}
DedupeCheck --> |重复| SkipRecord["跳过记录"]
DedupeCheck --> |不重复| ImportRecord["导入记录"]
ImportRecord --> NextRecord{"还有更多记录?"}
SkipRecord --> NextRecord
NextRecord --> |是| ProcessRecords
NextRecord --> |否| CheckpointWAL["执行WAL checkpoint"]
CheckpointWAL --> ReturnSuccess["返回导入结果"]
ReturnError --> End([处理完成])
ReturnEmpty --> End
ReturnSuccess --> End
```

**图表来源**
- [export-import.ts:385-468](file://src/api/export-import.ts#L385-L468)

#### 响应格式

```json
{
  "imported": 150,
  "skipped": 5,
  "errors": [
    "Record 3: 导入失败",
    "Record 7: 导入失败"
  ],
  "message": "Imported 150, skipped 5 record(s) from flomo HTML."
}
```

**章节来源**
- [export-import.ts:385-468](file://src/api/export-import.ts#L385-L468)

### 数据库WAL优化

数据库系统已启用WAL（Write-Ahead Logging）模式，提升并发性能和数据一致性。

#### WAL配置

- **PRAGMA journal_mode = WAL**：启用WAL模式
- **PRAGMA foreign_keys = ON**：启用外键约束
- **WAL checkpoint**：导入完成后执行checkpoint确保数据持久化

#### 性能优势

- **读写并发**：允许多个读操作同时进行
- **写入性能**：减少写入锁竞争
- **崩溃恢复**：改进的崩溃恢复机制
- **数据一致性**：确保导入操作的数据完整性

**章节来源**
- [db.ts:9](file://src/db.ts#L9)
- [db.ts:458-465](file://src/db.ts#L458-L465)

## 依赖关系分析

### 外部依赖

项目的主要外部依赖包括：

| 依赖包 | 版本 | 用途 |
|-------|------|------|
| bun:sqlite | 内置 | SQLite数据库操作 |
| hono | ^4.7.10 | Web框架 |
| @chenglou/pretext | ^0.0.6 | 文字排版引擎 |
| vanjs-core | ^1.6.0 | 响应式UI框架 |
| marked | ^18.0.4 | Markdown解析器 |
| dompurify | ^3.4.5 | HTML清理工具 |

### 内部模块依赖

```mermaid
graph LR
subgraph "导入脚本"
A[import-flomo.ts] --> B[db.ts]
end
subgraph "API层"
C[export-import.ts] --> B
C --> D[model.ts]
end
subgraph "数据库层"
B --> E[SQLite]
B --> F[数据库操作]
end
subgraph "前端层"
G[masonry/] --> H[预处理引擎]
I[admin/] --> J[响应式UI]
end
```

**图表来源**
- [import-flomo.ts:9](file://script/import-flomo.ts#L9)
- [export-import.ts:3-12](file://src/api/export-import.ts#L3-L12)

**章节来源**
- [package.json:19-25](file://package.json#L19-L25)
- [import-flomo.ts:9](file://script/import-flomo.ts#L9)

## 性能考虑

### 内存使用优化

- **流式处理**：脚本采用一次性读取整个文件的方式，适合处理中等大小的HTML文件
- **批量导入**：所有记录导入完成后才执行WAL checkpoint，减少数据库I/O操作
- **去重检查**：使用内存中的去重检查机制，避免重复的数据库查询

### 导入性能优化

- **正则表达式优化**：使用预编译的正则表达式提高匹配效率
- **索引利用**：数据库表已建立适当的索引以优化查询性能
- **事务处理**：批量导入过程中使用SQLite的事务机制提高写入速度
- **WAL模式**：启用WAL模式提升并发性能

### 错误处理策略

- **渐进式错误处理**：单个记录的导入失败不会影响其他记录的处理
- **详细日志输出**：提供详细的进度和错误信息，便于调试和监控
- **优雅降级**：遇到格式不兼容的记录时会跳过而不是中断整个过程

### 并发性能优化

- **WAL模式**：SQLite WAL模式支持更好的并发读写
- **连接池**：数据库连接复用减少连接开销
- **批量操作**：减少数据库往返次数

## 故障排除指南

### 常见问题及解决方案

#### 文件读取问题

**问题**：脚本报错显示文件不存在或读取失败
**解决方案**：
1. 确认HTML文件路径正确
2. 检查文件权限设置
3. 验证文件编码格式为UTF-8

#### HTML格式兼容性问题

**问题**：解析到的记录数量为0或格式不正确
**解决方案**：
1. 确认使用的是Flomo官方导出的HTML格式
2. 检查HTML文件是否完整且未被修改
3. 验证HTML结构符合预期格式

#### 数据库连接问题

**问题**：导入过程中出现数据库连接错误
**解决方案**：
1. 检查SQLite数据库文件权限
2. 确认数据库文件未被其他进程占用
3. 验证磁盘空间充足

#### 重复数据处理

**问题**：大量记录被标记为重复
**解决方案**：
1. 检查去重机制是否正常工作
2. 验证内容比较逻辑
3. 考虑手动清理数据库中的重复记录

#### HTML实体解码问题

**问题**：导入后出现乱码或特殊字符显示异常
**解决方案**：
1. 检查HTML实体解码功能是否正常
2. 验证实体映射表是否完整
3. 确认文本转换过程中的编码处理

#### Web API导入问题

**问题**：通过HTTP接口导入失败
**解决方案**：
1. 确认请求头设置正确（multipart/form-data）
2. 检查文件上传大小限制
3. 验证认证凭据有效性
4. 查看服务器日志获取详细错误信息

**章节来源**
- [import-flomo.ts:146-160](file://script/import-flomo.ts#L146-L160)
- [import-flomo.ts:184-213](file://script/import-flomo.ts#L184-L213)

## 结论

Flomo HTML导入脚本是一个功能完整、设计合理的数据迁移工具。它成功地解决了从Flomo到MemOS的数据迁移需求，具有以下显著特点：

### 技术优势

- **模块化设计**：清晰的功能分离和职责划分
- **健壮的错误处理**：完善的异常处理和用户反馈机制
- **高效的性能**：优化的算法和数据库操作
- **良好的扩展性**：易于维护和功能扩展
- **Web API支持**：提供HTTP接口支持远程导入
- **WAL优化**：SQLite WAL模式提升并发性能
- **完整的HTML处理**：支持HTML实体解码和标签提取

### 使用建议

1. **备份数据**：在进行大规模导入前务必备份现有数据
2. **测试环境**：先在测试环境中验证导入效果
3. **监控进度**：关注导入过程中的日志输出
4. **验证结果**：导入完成后检查数据完整性和准确性
5. **选择合适方式**：根据使用场景选择命令行脚本或Web API导入

### 新功能价值

- **Web API端点**：为自动化导入和远程管理提供了便利
- **增强的HTML处理**：更准确地处理复杂的HTML内容
- **WAL优化**：提升了系统的整体性能和可靠性
- **去重机制**：避免了重复数据的产生

该脚本为用户提供了从Flomo迁移到MemOS的便捷途径，简化了数据迁移过程，提高了用户体验。其设计原则和实现方式也为类似的数据迁移场景提供了有价值的参考。