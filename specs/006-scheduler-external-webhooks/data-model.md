# 数据模型：调度器与外部 Webhook 触发

## `TriggerDefinition`

- **作用**: 表示一条可被启用或禁用的自动化入口定义。
- **关键字段**:
  - `id`
  - `sourceType`：`scheduled_job` | `external_webhook`
  - `slug`
  - `enabled`
  - `workspace`
  - `agentId`
  - `promptTemplate`
  - `deliveryTarget`
  - `createdAt`
  - `updatedAt`
- **source-specific 字段**:
  - scheduled job:
    - `scheduleExpr`
    - `timezone`
    - `nextDueAt`
    - `lastTriggeredAt`
    - `lastTriggerStatus`
  - external webhook:
    - `secretRef`
    - `requiredFields`
    - `optionalFields`
    - `replayWindowSeconds`
- **约束**:
  - `slug` 在系统范围内唯一
  - `workspace` 必须指向已存在且可访问的受管 workspace
  - `deliveryTarget` 仅允许 `none` 或 `feishu_chat`
  - disabled definition 不得创建新 `TriggerExecution`

## `TriggerExecution`

- **作用**: 表示一次实际 trigger 尝试，无论最终是否创建 run，都必须保留 operator-visible 结果。
- **关键字段**:
  - `id`
  - `definitionId`
  - `sourceType`
  - `status`
  - `triggeredAt`
  - `inputDigest`
  - `runId`
  - `deliveryStatus`
  - `rejectionReason`
  - `finishedAt`
- **状态建议**:
  - `accepted`
  - `rejected`
  - `missed`
  - `skipped`
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `cancelled`
  - `delivery_failed`
- **约束**:
  - `rejected` / `missed` / `skipped` 时可以没有 `runId`
  - 一旦进入 `queued` 及之后状态，必须关联唯一 `runId`
  - `delivery_failed` 只表示终态摘要投递失败，不覆盖 `run` 自身终态

## `TriggerDeliveryTarget`

- **作用**: 描述 trigger 终态通知的显式目标。
- **关键字段**:
  - `kind`：`none` | `feishu_chat`
  - `chatId`（当 `kind = feishu_chat`）
  - `label`
- **约束**:
  - `kind = none` 时不得写入 `chatId`
  - `kind = feishu_chat` 时必须提供稳定 `chatId`

## `Run`

- **作用**: 继续表示一次排队或执行中的运行实体。
- **本轮变化**:
  - `sessionId` 允许为空，以支持 non-chat trigger
  - `triggerSource` 扩展为 `chat_message` | `scheduled_job` | `external_webhook`
  - 新增 `triggerExecutionId`
  - `triggerMessageId` / `triggerUserId` 允许为空，仅 chat-triggered run 必填
  - 新增或等价持久化 `deliveryTarget`
- **约束**:
  - queue/lock/heartbeat/cancel 仍完全按 `workspace` 运行
  - `triggerExecutionId` 存在时，`triggerSource` 不得为 `chat_message`
  - chat-triggered run 保持现有 continuation 语义；non-chat run 强制 `fresh`

## `RunRequest`

- **作用**: gateway 向 executor 提交的 canonical 执行请求。
- **本轮变化**:
  - 支持可空 `sessionId`
  - 支持 `triggerSource`
  - 支持 `triggerExecutionId`
  - 支持可空 `deliveryTarget`
  - `sessionMode` 对 non-chat runs 固定为 `fresh`
- **约束**:
  - external webhook payload 只能影响模板变量展开结果，不得改写 request 的 `workspace` / `agentId`

## `OutboundDelivery`

- **作用**: 继续记录每次消息投递。
- **本轮变化**:
  - delivery 可由 `runId` 或 `triggerExecutionId` 间接追溯到 trigger definition
  - non-chat trigger 的终态消息只记录终态 `status` / `result` / `error`，不走 reaction / streaming card
- **约束**:
  - delivery failure 不得覆盖 `Run.status`
  - 当 trigger delivery 为 `none` 时不得创建 delivery 记录

## `Session`

- **作用**: 继续表示真实飞书 `chat` 会话。
- **本轮变化**:
  - 非聊天触发不创建或复用 `Session`
  - chat-triggered run 继续使用现有 `Session`、`SessionWorkspaceBinding`、`ConversationSessionBinding`
- **约束**:
  - scheduler/webhook 不能为了运行而伪造 session

## 状态迁移摘要

1. scheduled job due:
   - scheduler 找到 enabled definition
   - 创建 `TriggerExecution(status = accepted)`
   - 创建 `Run(triggerSource = scheduled_job, sessionId = null)`
   - 入队后推进到 `queued`

2. external webhook accepted:
   - gateway 匹配 definition、通过验签与 payload 校验
   - 创建 `TriggerExecution(status = accepted)`
   - 创建 `Run(triggerSource = external_webhook, sessionId = null)`
   - 返回同步 accepted 回执

3. external webhook rejected:
   - 创建 `TriggerExecution(status = rejected)` 或等价审计记录
   - 不创建 `Run`

4. disabled definition due / hit:
   - scheduled job 记录 `skipped`
   - webhook 记录 `rejected`
   - 两者都不创建 `Run`

5. run terminal + delivery:
   - `Run` 进入 `completed` / `failed` / `cancelled`
   - `TriggerExecution` 跟随更新到相同终态
   - 若存在 `deliveryTarget`，创建 `OutboundDelivery`
   - 若 delivery 最终失败，`TriggerExecution.deliveryStatus = failed`，但 `Run.status` 保持原终态
