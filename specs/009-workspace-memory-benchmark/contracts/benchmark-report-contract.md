# Benchmark Report Contract

## 目的

定义 workspace memory benchmark 输出报告的最小契约，确保维护者、feature owner 和 operator 都能基于同一份结果判断是否允许继续 rollout。

## Contract

### 单案例报告

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `caseId` | 是 | 对应样例 ID |
| `suite` | 是 | 样例所属 suite |
| `passed` | 是 | 是否通过 |
| `failureReasons` | 是 | 未通过原因列表 |
| `traceSummary` | 是 | 对判分有用的摘要工件 |
| `effectMetrics` | 是 | 与该案例相关的效果指标 |
| `costMetrics` | 是 | 与该案例相关的成本指标 |

### suite 聚合报告

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `suite` | 是 | `L1-golden`、`L2-replay`、`L3-adversarial` |
| `caseCount` | 是 | 样例总数 |
| `failedCaseIds` | 是 | 失败样例列表 |
| `metrics` | 是 | 聚合效果与成本指标 |
| `gateResult` | 是 | 该 suite 是否通过 gate |

### 全局报告

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `generatedAt` | 是 | 报告生成时间 |
| `suiteReports` | 是 | 所有 suite 报告 |
| `globalMetrics` | 是 | 全局指标 |
| `globalGateResult` | 是 | 是否允许继续 rollout |
| `rolloutRecommendation` | 是 | `blocked`、`shadow_only` 或 `eligible_for_next_phase` |

## 必备指标

### 效果指标

- `intentPrecision`
- `intentRecall`
- `falseWriteRate`
- `recallHitRate`
- `staleRecallRate`
- `missedDurableRecallRate`

### 成本指标

- `classifierLatencyMsP50`
- `classifierLatencyMsP95`
- `recallLatencyMsP50`
- `recallLatencyMsP95`
- `augmentationTokensP50`
- `augmentationTokensP95`
- `augmentationTokenRatioP95`
- `preflightLatencyMsP50`
- `preflightLatencyMsP95`
- `filesScannedPerSyncP95`
- `toolCallCountP50`
- `toolCallCountP95`
- `toolReadCountP50`
- `toolReadCountP95`
- `toolWriteCountP50`
- `toolWriteCountP95`

## Gate 语义

1. 当 `falseWriteRate` 或 `staleRecallRate` 超出红线时，`globalGateResult` 必须为失败。
2. 当关键 recall 样例命中率低于门槛时，报告必须说明是哪些案例拖低了指标。
3. 当 `preflightLatencyMsP95`、`filesScannedPerSyncP95` 或 `toolCallCountP95` 超出默认门槛时，即使效果指标通过，也必须阻断 rollout。
4. 即使成本指标通过，若红线效果指标失败，也不得给出继续 rollout 的正向建议。

## 示例结论

```json
{
  "globalGateResult": {
    "passed": false,
    "failures": [
      "false_write_rate != 0",
      "stale_recall_rate != 0"
    ]
  },
  "rolloutRecommendation": "blocked"
}
```
