# 数据模型：Feishu 卡片结果增强

## `RunEvent`（扩展）

- **作用**: 继续作为 `executor` / `bridge` 到 `gateway` 的规范事件通道。
- **新增事件类型**:
  - `agent.output.delta`: 表示接近原始 agent 输出的增量文本片段，供过程卡片渲染使用。
- **关键字段**:
  - `runId`
  - `eventType`
  - `payload.sequence`
  - `payload.delta_text`
  - `payload.source`
  - `createdAt`
- **约束**:
  - `sequence` 必须在同一 `runId` 内单调递增。
  - `agent.summary` 可以继续保留，但不再是过程卡片的唯一数据来源。
  - `run.completed`、`run.failed`、`run.cancelled` 仍然是终态真值来源。

## `RunPresentation`

- **作用**: 表示某次运行在 Feishu 侧的整体呈现生命周期，是本轮新增的持久化实体。
- **关键字段**:
  - `runId`
  - `sessionId`
  - `chatId`
  - `phase`
  - `terminalStatus`
  - `streamingMessageId`
  - `streamingCardId`
  - `streamingElementId`
  - `fallbackTerminalMessageId`
  - `degradedReason`
  - `singleMessageViolation`
  - `lastOutputSequence`
  - `lastOutputExcerpt`
  - `createdAt`
  - `updatedAt`
- **状态**:
  - `pending_start`: 请求已创建但尚未执行
  - `streaming`: 过程卡片已创建并允许增量更新
  - `completed`: 过程卡片已切换为完成态摘要卡
  - `failed`: 过程卡片已切换为失败态摘要卡
  - `cancelled`: 过程卡片已切换为取消态摘要卡
  - `degraded`: 卡片链路部分失败，系统进入异常兜底或终态增强失败可见状态
- **约束**:
  - 每个 `runId` 最多存在一个 `RunPresentation`
  - 队列中的请求可以预先存在 `pending_start` 记录，但不能拥有过程卡片 ID
  - 一旦进入 `degraded`，不得再继续过程卡片流式更新
  - 正常成功路径下 `singleMessageViolation` 必须保持为 `false`

## `StreamingCardView`

- **作用**: 表示过程卡片当前用户可见的渲染快照，可作为 `RunPresentation` 的聚合视图。
- **关键字段**:
  - `runId`
  - `visibleText`
  - `richSegments`
  - `excerpt`
  - `lastRenderedSequence`
  - `renderedAt`
  - `isTerminal`
- **约束**:
  - 只保留足够支撑可读性的最近输出窗口，不承诺完整日志镜像
  - 更新由 `gateway` 基于 `agent.output.delta` 合并、节流和有限富文本恢复后产生

## `TerminalCardDocument`

- **作用**: 表示同一张 Feishu `interactive` 卡片在运行结束后展示的终态富文本文档。
- **关键字段**:
  - `runId`
  - `headline`
  - `conclusion`
  - `changes`
  - `verification`
  - `nextSteps`
  - `status`
- **约束**:
  - 必须对应单次运行唯一的主终态结果
  - 成功、失败、取消三种终态都必须生成可读的终态结果
  - 内容以中文为主，路径、命令、代码标识和结构化 ID 保持原文

## `OutboundDelivery`（扩展）

- **作用**: 继续记录所有 Feishu 出站交付尝试。
- **新增交付类别建议**:
  - `reaction`
  - `card_create`
  - `card_update`
  - `card_complete`
  - `fallback_terminal`
- **新增关联信息建议**:
  - `targetRef` 或等价字段，用于关联 `message_id` / `card_id`
- **约束**:
  - 过程卡片生命周期动作和异常兜底消息必须分别留下独立 delivery 记录
  - 交付失败不能覆盖或抹去已存在的 `RunPresentation` 终态

## `Run`

- **作用**: 继续表示单次排队或执行中的运行实体。
- **本轮约束**:
  - `Run.status`、queue position、timeout、cancel、heartbeat 语义保持不变
  - `RunPresentation.phase` 只能追随 `Run` 生命周期前进，不得反向修改 `Run.status`

## `Session`

- **作用**: 表示飞书 `chat` 到固定 agent/workspace 的绑定。
- **本轮约束**:
  - 同一 `Session` 下的排队请求只有在真正进入执行后才允许拥有过程卡片
  - 主过程卡片与异常兜底消息都必须能回溯到同一个 `Session`

## 状态迁移摘要

1. `run.queued`:
   - `Run.status = queued`
   - `RunPresentation.phase = pending_start`
   - 不创建过程卡片
2. `run.started`:
   - 创建过程卡片
   - `RunPresentation.phase = streaming`
3. `agent.output.delta`:
   - 更新 `StreamingCardView`
   - 节流后写入 CardKit
4. `run.completed` / `run.failed` / `run.cancelled`:
   - 过程卡片切换为对应终态摘要卡
   - `RunPresentation.phase` 进入对应终态
5. 过程卡片创建或更新失败:
   - `RunPresentation.phase = degraded`
   - 停止过程卡片更新
   - 若用户侧尚无任何已送达卡片，则发送单条终态富文本兜底消息
