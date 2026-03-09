# 数据模型：Codex 会话续聊记忆

## `ConversationSessionBinding`

- **作用**: 表示某个飞书 `chat` 当前绑定的底层 Codex 续聊上下文，是本轮新增的持久化实体。
- **关键字段**:
  - `sessionId`
  - `chatId`
  - `agentId`
  - `workspace`
  - `bridge`
  - `bridgeSessionId`
  - `mode`
  - `status`
  - `lastBoundAt`
  - `lastUsedAt`
  - `lastResetAt`
  - `lastInvalidatedAt`
  - `lastInvalidationReason`
  - `lastRecoveryAt`
  - `lastRecoveryResult`
  - `createdAt`
  - `updatedAt`
- **枚举建议**:
  - `mode`: `fresh` | `continuation`
  - `status`: `unbound` | `bound` | `reset` | `invalidated` | `recovered`
- **约束**:
  - 每个渠道 `Session` 最多存在一个当前有效绑定
  - `bridgeSessionId` 仅在 `status = bound | recovered` 时允许非空
  - `workspace` 和 `agentId` 必须与所属 `Session` 保持一致
  - 续聊绑定状态变更必须保留最近一次重置、失效和恢复结果，便于 `/status` 与运维排障

## `Session`（扩展关系）

- **作用**: 继续表示飞书 `chat` 到固定 agent/workspace 的绑定。
- **本轮变化**:
  - `Session` 不直接承载完整桥接器状态，但会关联一个可选的 `ConversationSessionBinding`
- **约束**:
  - `Session` 的渠道、`chatId`、`agentId` 和 `workspace` 仍是路由真值来源
  - 显式 `/new` 只影响 `ConversationSessionBinding`，不删除或重建 `Session`

## `RunRequest`（扩展）

- **作用**: 继续表示待执行的一次运行请求。
- **新增字段建议**:
  - `bridgeSessionId`：可选，表示本次运行希望继续的底层 Codex session
  - `sessionMode`：`fresh` | `continuation`
- **约束**:
  - 当当前 `ConversationSessionBinding.status` 为 `bound | recovered` 时，`RunRequest` 默认携带对应 `bridgeSessionId`
  - 当用户刚执行 `/new` 或当前无有效绑定时，`RunRequest.bridgeSessionId` 必须为空

## `Run`（扩展）

- **作用**: 继续表示单次排队或执行中的运行实体。
- **新增字段建议**:
  - `requestedSessionMode`
  - `resolvedBridgeSessionId`
  - `sessionRecoveryAttempted`
  - `sessionRecoveryResult`
- **约束**:
  - 这些字段仅用于记录本轮运行是否尝试续聊、是否发生自动恢复，以及最终采用的新旧会话模式
  - `Run.status`、queue、cancel、timeout、heartbeat 语义保持不变

## `RunEvent`（最小变化）

- **作用**: 继续作为 executor / bridge 到 gateway 的规范事件通道。
- **本轮策略**:
  - 不强制新增新的公开 `RunEventType`
  - 续聊绑定建立、重置、失效和自动恢复主要通过持久化状态与结构化日志表达
- **约束**:
  - 若实现中需要补充桥接器返回的 session 元数据，应以内聚的 payload 字段或等价结果对象回传，不能让 Feishu 层直接感知 Codex 细节

## `CodexBridgeResult`（桥接结果扩展）

- **作用**: 表示一次底层 Codex 执行完成后，桥接层返回给运行控制器的终态结果元数据。
- **关键字段建议**:
  - `resultSummary`
  - `bridgeSessionId`
  - `sessionOutcome`
  - `sessionInvalid`
- **枚举建议**:
  - `sessionOutcome`: `created` | `continued` | `reset` | `unchanged`
- **约束**:
  - 若运行成功并获得可继续使用的底层 session，桥接层必须显式返回 `bridgeSessionId`
  - 若桥接层能明确判定“请求引用的 session 无效”，必须返回可供运行控制器识别的一致信号

## 状态迁移摘要

1. 首次普通消息:
   - `Session` 已存在或新建
   - `ConversationSessionBinding.status = unbound`
   - `RunRequest.sessionMode = fresh`
2. 首轮成功结束:
   - bridge 返回新的 `bridgeSessionId`
   - `ConversationSessionBinding.status = bound`
   - `mode = continuation`
3. 后续普通消息:
   - `RunRequest.bridgeSessionId = 当前绑定`
   - `RunRequest.sessionMode = continuation`
4. 用户执行 `/new`:
   - 现有绑定被清空
   - `ConversationSessionBinding.status = reset`
   - 下一轮 `RunRequest.sessionMode = fresh`
5. 续聊 session 失效:
   - 当前 run 记录 `sessionRecoveryAttempted = true`
   - 绑定进入 `invalidated`
   - 系统自动重试一次新会话
6. 自动恢复成功:
   - 新 `bridgeSessionId` 回写
   - `ConversationSessionBinding.status = recovered`
   - 后续继续使用新绑定
7. 自动恢复失败:
   - run 按普通失败结束
   - 绑定保留最新失效信息，供 `/status` 和运维排障使用
