# Phase 1 数据模型

## 1. Benchmark Case

表示一条可重复执行的 memory 评测样例。

| 字段 | 说明 |
| --- | --- |
| `id` | 样例唯一标识 |
| `suite` | 样例分组，取值为 `L1-golden`、`L2-replay`、`L3-adversarial` |
| `workspaceKey` | 样例作用的逻辑 workspace |
| `transcript` | 输入消息序列，按顺序描述用户消息和必要的系统前置条件 |
| `expectation` | gold expectation，包括分类、写入、召回和禁止出现的结果 |
| `notes` | 可选说明，用于标注样例意图或特殊约束 |

### 校验规则

- `id` 在整个 benchmark 语料库中必须唯一。
- `suite` 必须属于约定集合。
- `transcript` 至少包含一个可执行输入。
- `expectation` 不能缺失；缺失时样例不得计入 gate。

## 2. Benchmark Turn

表示 `Benchmark Case.transcript` 中的一条消息或前置交互。

| 字段 | 说明 |
| --- | --- |
| `role` | 消息来源，例如 `user` 或受控系统输入 |
| `text` | 文本内容 |
| `chatId` | 可选，允许同一语料模拟不同 chat |
| `messageId` | 可选，用于固定 run request 和 trace 对齐 |
| `metadata` | 可选，记录该条输入需要的补充上下文 |

### 校验规则

- 第一阶段只要求支持 text 类型消息。
- 若样例依赖 `/new`、`/remember`、`/forget`，应直接在 `text` 中体现命令或自然语言表达。

## 3. Benchmark Expectation

表示样例的 gold expectation。

| 字段 | 说明 |
| --- | --- |
| `intent` | 期望识别出的 memory intent，取值为 `remember`、`forget`、`update`、`not_memory` |
| `expectedWrites` | 期望产生的 durable write 结果摘要 |
| `recalledItemTitles` | 后续 run 应命中的 memory 标识或标题集合 |
| `forbiddenItemTitles` | 不应被写入或不应进入 recall 的 memory 标识或标题集合 |
| `gateCritical` | 是否属于红线样例 |

### 校验规则

- 若样例涉及自然语言记忆意图分类，`intent` 必填。
- 若样例涉及 recall，`recalledItemTitles` 或 `forbiddenItemTitles` 至少一项必填。
- `gateCritical = true` 的样例失败时必须影响 gate 结果。

## 4. Benchmark Trace

表示单条样例执行后的结构化运行工件。

| 字段 | 说明 |
| --- | --- |
| `caseId` | 对应的样例 ID |
| `classification` | 实际识别出的 memory intent 结果 |
| `writes` | 实际发生的 durable write 摘要 |
| `recalls` | 实际命中的 memory 摘要 |
| `bridgeRequests` | 实际发给 bridge 的请求摘要 |
| `userVisibleOutputs` | 用户可见输出的摘要 |
| `metrics` | 本案例的 token、latency、scan 开销 |
| `runtimeOutcome` | 样例运行状态，例如成功、失败、取消 |
| `signalSources` | 说明 queue、lock、heartbeat 等信号来自真实运行复用还是测试替身 |

### 校验规则

- `metrics` 至少应包含 `classifierLatencyMs`、`recallLatencyMs`、`preflightLatencyMs`、`augmentationTokens`、`augmentationTokenRatio`。
- `runtimeOutcome` 需和 memory 判分分离，避免把基础运行失败误判为 memory 质量问题。
- `signalSources` 必须能解释关键运行信号的来源，避免 operator 将测试替身误解为生产观测。

## 5. Benchmark Case Score

表示单条样例的判分结果。

| 字段 | 说明 |
| --- | --- |
| `caseId` | 样例 ID |
| `passed` | 是否通过 |
| `failureReasons` | 未通过原因列表 |
| `effectMetrics` | 与该案例相关的效果判分摘要 |
| `costMetrics` | 与该案例相关的成本判分摘要 |

### 状态转换

```text
loaded -> executed -> traced -> scored -> aggregated
```

## 6. Benchmark Suite Report

表示一个 suite 的聚合结果。

| 字段 | 说明 |
| --- | --- |
| `suite` | `L1-golden` / `L2-replay` / `L3-adversarial` |
| `caseCount` | 样例总数 |
| `passedCaseCount` | 通过样例数 |
| `failedCaseIds` | 失败样例 ID 列表 |
| `metrics` | 聚合效果与成本指标 |
| `gateResult` | 该 suite 的 gate 评估结果 |

## 7. Benchmark Gate Profile

表示 gate 使用的阈值集合。第一阶段可先以内置默认配置实现，但该配置必须以结构化对象存在，而不是分散硬编码。

| 字段 | 说明 |
| --- | --- |
| `falseWriteRateMax` | 普通聊天误写上限 |
| `staleRecallRateMax` | 旧事实污染上限 |
| `missedDurableRecallRateMax` | durable recall 漏召回上限 |
| `recallHitRateMin` | recall 命中率下限 |
| `augmentationTokenRatioMax` | augmentation token 占比上限 |

### 约束

- 第一阶段默认 gate 应对 `L1-golden` 最严格。
- `falseWriteRateMax` 和 `staleRecallRateMax` 在 `L1-golden` 中应默认为 0。
- 第一阶段允许只提供默认 `Gate Profile`，暂不要求外部配置入口。

## 8. Benchmark Aggregate Report

表示整套 benchmark 的最终输出。

| 字段 | 说明 |
| --- | --- |
| `generatedAt` | 报告生成时间 |
| `suiteReports` | 各 suite 报告 |
| `globalMetrics` | 全局聚合指标 |
| `globalGateResult` | 是否允许继续 rollout |
| `notes` | 对 operator 或 feature owner 的解释性说明 |
