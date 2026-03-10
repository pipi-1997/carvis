# Research: 调度器与外部 Webhook 触发

## 决策 1：trigger definitions 以 runtime config 为声明源，并同步到 Postgres

- **Decision**: v1 由 `~/.carvis/config.json` 声明 scheduled jobs 和 external webhooks；gateway 启动时将 definition 以稳定 ID 同步到 Postgres，使 operator 能看到启用状态、最近一次触发和下一次计划时间。
- **Rationale**: 规格要求“预定义并持久化管理”，但又明确本轮不交付 admin UI 编辑器；以 config 作为 desired state、以 Postgres 作为 durable view，能同时满足 operator 可见性和 v1 的实现节制。
- **Alternatives considered**:
  - 只保存在 config，不写 Postgres：operator 无法可靠查看最近触发状态，重启后也没有历史。
  - 只保存在 Postgres，通过 SQL 维护：缺少显式声明源，且不符合当前 runtime config 驱动的部署模式。

## 决策 2：non-chat trigger 使用 sessionless run，而不是伪造聊天 session

- **Decision**: scheduler / webhook 触发的 run 可以不绑定聊天 `Session`，改由 `triggerExecutionId` 和可选 delivery target 表达来源与通知目标；chat message 触发的 run 继续保留真实 session。
- **Rationale**: 非聊天触发不一定有聊天上下文，也不应该污染 `sessions` 表或 continuation 绑定。显式建模 sessionless run 能让 queue/lock 继续依赖 workspace，同时避免给 operator 造成“这些 run 来自某个假 chat”的误导。
- **Alternatives considered**:
  - 为 scheduler/webhook 伪造系统 session：会污染 `sessions` 语义，并让 `/status`、continuation 和 operator 视图混入无意义 chat 标识。
  - 复用某个固定 Feishu chat 作为 session：会把 delivery target、run source 与会话记忆耦合到一起，行为不可预测。

## 决策 3：scheduler 与 webhook 共享同一 `TriggerExecution` 状态机

- **Decision**: 两类入口统一持久化为 `TriggerExecution`，至少覆盖 `accepted`、`rejected`、`missed`、`skipped`、`queued`、`running`、`completed`、`failed`、`cancelled`、`delivery_failed` 这些 operator-visible 状态或等价状态。
- **Rationale**: 宪法要求 trigger path 与 run lifecycle 保持统一可审计语义。统一状态机可以让 operator 不必记住两套路径，也让 tests 能覆盖“source 不同但 run 行为一致”的核心约束。
- **Alternatives considered**:
  - scheduler 和 webhook 各自定义状态表：实现分裂，后续 admin 视图和集成测试都要维护两套逻辑。
  - 只看 `Run.status` 不记录 trigger execution：无法表达 rejected / missed / skipped 这类“未创建 run 但对 operator 很关键”的结论。

## 决策 4：scheduled job 采用 cron-like 计划表达式，missed 窗口只记录不补跑

- **Decision**: v1 scheduled job 使用单条 cron-like 计划表达式与本地 runtime 时区计算 `nextDueAt`；若 gateway / scheduler 在某个窗口不可用，只记录 `missed`，恢复后从下一次未来窗口继续，不自动回放历史窗口。
- **Rationale**: 规格已经明确“不自动补跑历史窗口”。单条 cron-like 计划表达式足以覆盖巡检/日报类用例，又不会把 Phase 1 设计拖入复杂日历规则。
- **Alternatives considered**:
  - fixed interval only：对日历型任务表达力不足。
  - 支持 missed replay：会引入补跑顺序、堆积上限、运维限流等额外语义，不适合 v1。

## 决策 5：external webhook 采用 definition 级 HMAC 鉴权与同步 accepted/rejected 回执

- **Decision**: v1 external webhook 使用 definition 级共享 secret 和 HMAC 签名，配合时间戳限制重放窗口；gateway 在同一个 HTTP 请求内完成 definition 匹配、验签与 payload 校验，并同步返回 accepted 或 rejected 结果。
- **Rationale**: 这比固定 bearer token 更抗重放，也比直接暴露任意 prompt 更安全。同步 accepted/rejected 回执能让外部系统立即知道请求是否被接受，而不必轮询 run 结果。
- **Alternatives considered**:
  - bearer token：实现更简单，但缺乏原始请求签名与重放防护。
  - 只有 200/500、无显式 rejected 语义：集成方难以判断是配置错误、鉴权失败还是运行期失败。

## 决策 6：trigger delivery 首版只支持 `none` 和 `Feishu chat`

- **Decision**: 每条 trigger definition 只有两种结果投递模式：不投递，或投递到一个显式声明的 Feishu `chatId`。非聊天 run 不会创建临时 session，也不会试图走 CardKit 过程卡片链路。
- **Rationale**: 当前仓库唯一成熟的 outbound channel 是 Feishu。限定 delivery 目标可以复用现有 sender / delivery 审计，又不需要为 scheduler/webhook 额外创造新的展示协议。
- **Alternatives considered**:
  - 允许任意 channel target：当前没有 Telegram/其他渠道实现，超出仓库现状。
  - 为 non-chat run 复用 streaming card：缺少真实 trigger message / chat session，不符合现有 presentation 模型。

## 决策 7：notifier 按 run 上下文解析目标，不再要求 executor 总是提供 session

- **Decision**: notifier 以 `runId + event` 为最小输入，在 gateway 内部解析该 run 是 chat-triggered 还是 trigger-triggered，再决定是否发送 reaction / 卡片 / 终态消息，或只更新持久化状态。
- **Rationale**: 现有 executor 处理链假设所有 run 都有 `Session`，这会阻塞 sessionless run。把 audience 解析收敛到 gateway notifier 可以最小化 executor 变更，并保持所有 outbound decision 都由 gateway 负责。
- **Alternatives considered**:
  - 在 executor 里分支判断不同 run source：会把通知策略扩散到执行链，违背 gateway 负责 delivery 的拓扑。
  - 为 trigger run 强制创建 session 再复用旧 notifier：仍然回到伪造 session 的问题。
