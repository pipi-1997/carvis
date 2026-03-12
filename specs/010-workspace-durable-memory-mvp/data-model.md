# Phase 1 数据模型

## 1. WorkspaceMemoryFile

表示某个 workspace 的长期 durable memory 主文件，路径固定为 `<workspace>/.carvis/MEMORY.md`。

| 字段 | 说明 |
| --- | --- |
| `workspacePath` | 当前 workspace 根目录 |
| `memoryPath` | 固定为 `<workspace>/.carvis/MEMORY.md` |
| `exists` | 文件是否存在 |
| `content` | 文件完整内容 |
| `contentHash` | 当前内容摘要，用于 diff 和 benchmark 观测 |
| `updatedAt` | 文件最后更新时间 |

### 校验规则

- `memoryPath` 必须位于 workspace 目录内。
- 文件不存在时，普通 recall 按空长期记忆处理；正常 run 可惰性创建。
- `content` 必须是可解析的 Markdown 文本。

## 2. WorkspaceDailyMemoryFile

表示某个 workspace 的当日或近期 daily memory 文件，路径为 `<workspace>/.carvis/memory/YYYY-MM-DD.md`。

| 字段 | 说明 |
| --- | --- |
| `workspacePath` | 当前 workspace 根目录 |
| `dailyMemoryPath` | 固定为 `<workspace>/.carvis/memory/YYYY-MM-DD.md` |
| `date` | 从文件名解析出的日期 |
| `exists` | 文件是否存在 |
| `content` | 文件完整内容 |
| `contentHash` | 当前内容摘要 |
| `updatedAt` | 文件最后更新时间 |

### 校验规则

- `dailyMemoryPath` 必须位于 `<workspace>/.carvis/memory/` 下。
- MVP 默认只对今天和昨天的文件做自动 recall。
- daily memory 应允许追加式写入；不要求复杂 schema。

## 3. WorkspaceMemoryStructure

表示 `MEMORY.md` 的推荐结构。MVP 不强制复杂 schema，但要求文件保持 curated、可读、可去重。

| Section | 说明 |
| --- | --- |
| `## Facts` | 稳定项目事实 |
| `## Decisions` | 当前仍生效的技术或流程决策 |
| `## Preferences` | 用户或团队长期工作偏好 |
| `## Avoid / Deprecated` | 已废弃或应避免的事项 |

### 约束

- 同一语义的 active 事实不应在多个 section 中冲突共存。
- 文件应保持短小、可人工整理，而不是无限追加日志。
- 日志型细节优先进入 daily memory，而不是持续膨胀 `MEMORY.md`。

## 4. WorkspaceMemoryExcerpt

表示某次普通 run preflight 注入给 Codex 的 bounded memory 片段。

| 字段 | 说明 |
| --- | --- |
| `workspacePath` | 所属 workspace |
| `sources` | 本次 excerpt 命中的文件列表，如 `MEMORY.md`、`memory/2026-03-12.md` |
| `excerptText` | 实际注入 prompt 的 memory 片段 |
| `selectedSections` | 本次 excerpt 命中的 section 或来源标签 |
| `approxTokens` | 估算 token 数 |
| `createdAt` | 生成时间 |

### 校验规则

- `excerptText` 必须来自当前文件真相源，而不是缓存或 fixture 伪造。
- `approxTokens` 必须受固定预算约束。
- 文件过大时只截取预算内内容，不得整份注入。

## 5. WorkspaceMemoryWriteObservation

表示单次正常 run 前后 memory 文件的变化，用于判断是否发生真实 durable write。

| 字段 | 说明 |
| --- | --- |
| `runId` | 关联运行 |
| `targetPath` | 发生变化的目标文件，如 `MEMORY.md` 或某个 daily memory |
| `beforeHash` | run 前文件摘要，可为空 |
| `afterHash` | run 后文件摘要，可为空 |
| `changed` | 是否发生文件变化 |
| `createdFile` | 是否由本次 run 首次创建 |
| `changeType` | `long_term`、`daily`、`none` |
| `summary` | 供 benchmark / 日志使用的简短变更说明 |

### 校验规则

- `changed = true` 才能被视为真实 durable write 候选。
- 若 run 失败且文件无合法变更，不得宣称记忆写入成功。
- benchmark 以 `WriteObservation` 为准，不直接依赖回答文本。

## 5a. Benchmark Trace Write Collection

benchmark trace 不再区分独立的 `dailyMemoryWriteObservation` 命名，而是统一收集为 `memoryWriteObservations[]`。

| 字段 | 说明 |
| --- | --- |
| `memoryWriteObservations[]` | 一组 `WorkspaceMemoryWriteObservation`，可同时覆盖 `MEMORY.md` 与 daily memory |
| `targetPath` | 用于区分长期记忆与 daily memory |
| `changeType` | `long_term`、`daily`、`none` |

### 校验规则

- benchmark contract、trace 和 scorer 必须使用统一命名。
- 不允许同一概念在 data model 和 benchmark contract 中出现两套不兼容的观测字段。

## 6. WorkspaceMemoryFlushObservation

表示一次 compaction 前静默 memory flush 的触发、执行和结果。

| 字段 | 说明 |
| --- | --- |
| `runId` | 触发 flush 的关联运行 |
| `triggerReason` | 触发原因，如接近 compaction 阈值 |
| `targetPath` | 预期写入的 daily memory 路径 |
| `triggered` | 是否实际触发 flush |
| `changed` | flush 是否产生文件变更 |
| `userVisibleOutputCount` | flush 产生的用户可见输出数 |
| `summary` | flush 结果摘要 |

### 校验规则

- `triggered = true` 时，`targetPath` 必须指向当天的 daily memory。
- `userVisibleOutputCount` 在 MVP 中必须为 `0`。
- flush 不得改写非 memory 文件。

## 7. WorkspaceMemoryRecallSnapshot

表示某次普通 run 的 preflight recall 观测。

| 字段 | 说明 |
| --- | --- |
| `runId` | 关联运行 |
| `workspacePath` | 所属 workspace |
| `sources` | 本次 recall 实际读取的文件列表 |
| `filesScanned` | 本次 recall 扫描的文件数 |
| `excerpt` | 注入的 memory excerpt |
| `preflightLatencyMs` | 本次 preflight 总耗时 |
| `toolCallCount` | 本次 run 中与 memory 相关的工具调用数 |
| `toolReadCount` | memory 相关读调用数 |
| `toolWriteCount` | memory 相关写调用数 |

### 校验规则

- `filesScanned` 在 MVP 中应稳定且很小，通常为 `1-3`。
- `toolCallCount`、`toolReadCount`、`toolWriteCount` 必须来自真实 instrumentation。
- recall hot path 不应依赖大量工具调用。

## 8. Run 扩展：Memory Guidance Context

MVP 不新增新的 run 类型，但普通 run 在 bridge 调用前会附带一个 memory guidance context。

| 字段 | 说明 |
| --- | --- |
| `memoryGuidance` | 告诉 Codex 何时写入、写到哪里、何时拒绝持久化 |
| `memoryExcerpt` | 注入的 bounded durable memory 片段 |
| `memoryObservationId` | 可选，指向本次 run 的 write / recall / flush 观测 |

### 约束

- guidance 是 host 注入的说明，不是新的工具接口。
- memory 写入和 recall 都仍走普通 run 生命周期。
