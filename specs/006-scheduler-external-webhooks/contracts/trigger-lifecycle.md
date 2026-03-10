# 合同：Trigger Lifecycle

## 1. source 一致性

- `scheduled job` 与 `external webhook` 都必须先形成 `TriggerExecution`，再决定是否创建 `Run`
- 两类 source 创建出的 run 都必须进入同一 workspace queue 和 lock 语义
- executor 不应根据 source type 改变 workspace 串行化、heartbeat、cancel 或 timeout 规则

## 2. accepted / rejected / missed / skipped

- `accepted`: 入口校验通过，允许创建 run
- `rejected`: definition、鉴权或 payload 校验失败，不创建 run
- `missed`: scheduler 在应触发窗口不可用或错过窗口，不创建 run
- `skipped`: definition disabled 或 operator 明确关闭，不创建 run

## 3. run 关联

- 一旦 `TriggerExecution` 进入 `queued`、`running`、`completed`、`failed` 或 `cancelled`，必须存在唯一关联 `Run`
- `Run.triggerSource` 必须与 definition source 一致
- non-chat trigger run 必须以 `fresh` 模式执行，不得自动复用任意 continuation

## 4. delivery 关联

- 若 definition 配置了 `Feishu chat` delivery target，run 终态后必须尝试发送单条终态摘要
- non-chat trigger 不发送 reaction，不创建运行中卡片，不依赖 trigger message
- delivery failure 必须单独记录，不得把已成功完成的 run 改写为 failed

## 5. operator-visible 结果

- operator 必须能区分：
  - trigger 未发生
  - trigger 被 rejected / skipped / missed
  - run 已 queued / running / completed / failed / cancelled / heartbeat_expired
  - delivery failed
- 任何一个状态都必须能从持久化记录恢复，而不依赖 gateway / executor 进程内存

## 6. 内部管理查询面

- gateway 必须提供最小内部管理查询面或等价 read model，基于 Postgres 返回 definition、execution、run 和 delivery 的持久化状态
- 该查询面至少要支持：
  - 按 definition 查看 `enabled`、`last_triggered`、`next_due`、最近 `missed/skipped`
  - 按 execution 查看 `accepted/rejected/queued/running/completed/failed/cancelled/heartbeat_expired/delivery_failed`
  - 反查 execution 关联的 `Run` 与 outbound delivery 结果
- `heartbeat_expired`、timeout、cancel 等 run 终态原因必须与 `delivery_failed` 分离展示，避免把执行失败和通知失败混为一个状态
