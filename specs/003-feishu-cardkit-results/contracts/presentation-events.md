# 合同：Presentation Event 映射

## `RunEvent` 到呈现动作的最小映射

| RunEvent | Presentation Action | Notes |
|----------|---------------------|-------|
| `run.queued` | 不创建过程卡片 | 仅保持既有排队可见性 |
| `run.started` | 创建过程卡片 | 进入 `streaming` |
| `agent.output.delta` | 更新过程卡片输出区域 | 需按 `sequence` 合并与节流，并尽可能保留富文本语义 |
| `run.completed` | 同一张过程卡片切换完成态 | 正常路径不得再发送第二条成功终态消息 |
| `run.failed` | 同一张过程卡片切换失败态 | 需展示简短原因；仅在无已送达卡片时才允许兜底终态消息 |
| `run.cancelled` | 同一张过程卡片切换取消态 | 需展示取消原因；仅在无已送达卡片时才允许兜底终态消息 |

## `agent.output.delta` 负载约束

- `payload.sequence`: 同一 `runId` 内单调递增
- `payload.delta_text`: 新增文本片段
- `payload.source`: 输出来源标识，例如 assistant / tool / system
- `payload.sequence` 缺失或回退时，`gateway` 不得盲目覆盖已有过程卡片内容
- `gateway` 可以对 delta 做节流、合并与结构恢复，但不得把本可表达为标题、列表、强调、代码块、路径或命令的内容统一提前拍平成单段纯文本
- `channel-feishu` 必须把上游文本映射到飞书实际支持的卡片元素；对不稳定的 Markdown 标题语法需要做最小必要归一化

## 边界约束

- `bridge-codex` 只负责规范事件产出，不直接感知 Feishu CardKit
- `channel-feishu` 只负责消息和卡片发送，并负责把上游文本映射为飞书支持的 `interactive` 卡片结构；不直接感知 Codex 原始进程输出来源
- `apps/gateway` 负责把规范事件映射为具体呈现动作，并记录降级、delivery 状态与单消息约束是否被破坏
