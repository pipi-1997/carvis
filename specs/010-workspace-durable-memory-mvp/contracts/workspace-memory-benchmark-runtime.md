# Workspace Memory Benchmark Runtime Contract

## 目的

定义 `010-workspace-durable-memory-mvp` 对 `009-workspace-memory-benchmark` 必须暴露的真实 runtime 契约，确保 benchmark 评估的是实际的 workspace memory 行为，而不是 fixture 伪装。

## Contract

### benchmark 必须可观测的真实信号

| 类别 | 字段/信号 | 说明 |
| --- | --- | --- |
| 文件写入 | `memoryWriteObservations[]` | 一组真实文件写入观测，覆盖 `.carvis/MEMORY.md` 与 `.carvis/memory/YYYY-MM-DD.md` |
| 文件写入 | `memoryWriteObservations[].targetPath` | 变更目标文件路径 |
| 文件写入 | `memoryWriteObservations[].changeType` | `long_term`、`daily`、`none` |
| 文件写入 | `memoryWriteObservations[].summary` | 变更摘要，如“新增 preference”或“写入今日上下文” |
| 召回 | `memoryExcerpt.excerptText` | 实际注入 bridge request 的 bounded memory 片段 |
| 召回 | `memoryExcerpt.sources` | 本次 recall 实际使用的文件来源 |
| bridge 请求 | `bridgeRequests[]` | scorer 用于确认 memory excerpt 已真正进入 agent prompt |
| flush | `memoryFlushObservation.triggered` | 本次 run 是否触发静默 memory flush |
| flush | `memoryFlushObservation.changed` | flush 是否产生实际文件变更 |
| flush | `memoryFlushObservation.userVisibleOutputCount` | flush 是否泄漏了用户可见消息 |
| 成本 | `preflightLatencyMs` | recall + 裁剪 + augmentation 的总耗时 |
| 成本 | `filesScannedPerSync` | 本次 recall 扫描的文件数 |
| 成本 | `toolCallCount` | 与记忆相关的总工具调用数 |
| 成本 | `toolReadCount` | 与记忆相关的读调用数 |
| 成本 | `toolWriteCount` | 与记忆相关的写调用数 |
| 用户可见结果 | `userVisibleOutputs[]` | 用于区分“文件已写入”和“回答里只是口头说记住了” |

### MVP 对 benchmark 的承诺

1. `L1-golden` 中的长期事实写入、跨 chat recall、`/new` 后 recall、非记忆聊天误写保护和 compaction 前 flush 场景必须走真实 runtime。
2. benchmark 不得通过硬编码 `writes[]` / `recalls[]` / `flushes[]` 伪造通过结果。
3. memory 是否写入成功，必须以 `memoryWriteObservations[]` 中的真实文件 diff 为依据，而不是基于回答文本猜测。
4. recall 是否成功，必须以 bridge request 中的真实 augmentation 为依据。
5. 手工修改 memory 文件后的下一次 run，也必须能被 benchmark 或等价集成测试观测。
6. `toolCallCount`、`toolReadCount`、`toolWriteCount` 必须来自真实 instrumentation。

### gate 前提

| 指标 | MVP 要求 |
| --- | --- |
| `falseWriteRate` | `L1-golden` 必须为 `0` |
| `staleRecallRate` | `L1-golden` 必须为 `0` |
| `recallHitRate` | 必须基于真实 augmentation 计算 |
| `preflightLatencyMsP95` | 必须来自真实文件读取与裁剪 |
| `filesScannedPerSyncP95` | 不得通过伪造常量掩盖真实扫描量 |
| `toolCallCountP95` | 必须反映真实写入、flush 与 recall 成本 |
| `userVisibleFlushLeakRate` | 必须为 `0` |

### 不允许的退化

1. 只在 runner 里构造“应该写入什么”，但不真正比较文件前后差异。
2. 让 recall 命中只存在于 trace 假数据中，而不进入真实 bridge prompt。
3. 让 flush 只存在于日志文案中，而不产生真实 trace 和文件结果。
4. 为了过 benchmark 而放宽 `009` 的热路径成本门槛。
5. 手工改文件后仍读取旧缓存，却被错误判为通过。

## 示例结论

```json
{
  "caseId": "golden-project-prefers-bun",
  "traceSummary": {
    "memoryWriteObservations": [
      {
        "targetPath": ".carvis/MEMORY.md",
        "changeType": "long_term",
        "changed": true,
        "summary": "Decisions: project uses bun"
      }
    ],
    "memoryExcerpt": {
      "sources": ["MEMORY.md", "memory/2026-03-12.md"],
      "approxTokens": 58
    },
    "memoryFlushObservation": {
      "triggered": false,
      "changed": false,
      "userVisibleOutputCount": 0
    },
    "costMetrics": {
      "preflightLatencyMs": 11,
      "filesScannedPerSync": 3,
      "toolCallCount": 0
    }
  }
}
```
