# 数据模型：Agent 管理定时任务

## `TriggerDefinition`

- **作用**: 表示一条可被 scheduler 读取并实际触发的 durable 定时任务定义。
- **在 `006` 基础上的新增字段**:
  - `definitionOrigin`: `config` | `agent`
  - `label`: 用户和 operator 可读的稳定标题
- **保留关键字段**:
  - `id`
  - `sourceType`
  - `enabled`
  - `workspace`
  - `agentId`
  - `promptTemplate`
  - `scheduleExpr`
  - `timezone`
  - `deliveryTarget`
  - `nextDueAt`
  - `lastTriggeredAt`
  - `lastTriggerStatus`
- **约束**:
  - `workspace` 必须指向当前 registry 中存在的受管 workspace
  - `label` 在同一 workspace 内应尽量唯一，但系统仍以 `id` 为最终标识
  - `definitionOrigin = config` 的 definition 允许被 Codex 更新或停用，但 effective 状态必须通过 override 读取
  - 最新一次管理动作与管理来源上下文必须通过 `ScheduleManagementAction` / `TriggerDefinitionOverride` 投影，而不是依赖可被 config sync 覆盖的 baseline definition 可变字段
  - disabled definition 不得创建新的 `TriggerExecution`

## `TriggerDefinitionOverride`

- **作用**: 表示某条 definition 上由聊天管理动作施加的 durable override，用来覆盖 config baseline 或记录 agent 后续修改。
- **关键字段**:
  - `definitionId`
  - `workspace`
  - `label`
  - `enabled`
  - `scheduleExpr`
  - `timezone`
  - `promptTemplate`
  - `deliveryTarget`
  - `managedBySessionId`
  - `managedByChatId`
  - `managedByUserId`
  - `appliedAt`
- **约束**:
  - 一条 definition 在任意时刻至多存在一个 active override
  - `config` 来源 definition 被聊天更新或停用时，必须创建或更新 override，而不是直接依赖 runtime config 文件落盘
  - `agent` 来源 definition 也可以通过 override 表达后续修改，保证审计格式一致

## `EffectiveManagedSchedule`

- **作用**: scheduler、list presenter、matcher 和内部查询面使用的合成读模型，表示 baseline definition 与 override 合并后的有效值。
- **关键字段**:
  - `definitionId`
  - `definitionOrigin`
  - `sourceType`
  - `workspace`
  - `label`
  - `enabled`
  - `scheduleExpr`
  - `timezone`
  - `promptTemplate`
  - `deliveryTarget`
  - `lastManagedAt`
  - `lastManagementAction`
  - `lastManagedByChatId`
  - `lastTriggeredAt`
  - `lastTriggerStatus`
  - `nextDueAt`
- **约束**:
  - scheduler 只能读取 effective model，不得直接假设 `TriggerDefinition` 行就是最终值
  - operator 查询面需要同时暴露 baseline 来源和 override 事实
  - `lastManagedAt`、`lastManagementAction` 和 `lastManagedByChatId` 必须从最新的 `ScheduleManagementAction` / active override 投影得到，而不是直接复用 baseline definition 可变字段

## `ScheduleManagementAction`

- **作用**: 持久化一次来自 chat 的 schedule 管理请求及其结果，用于 operator-visible 审计。
- **关键字段**:
  - `id`
  - `sessionId`
  - `chatId`
  - `workspace`
  - `userId`
  - `requestedText`
  - `actionType`: `create` | `list` | `update` | `disable`
  - `resolutionStatus`: `executed` | `needs_clarification` | `rejected`
  - `targetDefinitionId`
  - `reason`
  - `responseSummary`
  - `createdAt`
  - `updatedAt`
- **约束**:
  - 每次 schedule 管理尝试都应至少留下一个 `ScheduleManagementAction`
  - `needs_clarification` 和 `rejected` 时不得修改 effective definition
  - `executed` 时必须能反查到受影响 definition

## `ScheduleToolInvocation`

- **作用**: 表示 agent 通过 `carvis-schedule` CLI 对 gateway 发起的一次结构化调用。
- **关键字段**:
  - `actionType`
  - `targetReference`
  - `label`
  - `scheduleExpr`
  - `timezone`
  - `promptTemplate`
  - `deliveryTarget`
  - `reason`
- **约束**:
  - 一次工具调用只表达一个 `create`、`list`、`update`、`disable` 动作
  - 工具参数必须先经由 `carvis-schedule` 显式 flags 传递到 gateway 校验，再进入 `ScheduleManagementService`
  - 工具调用本身不直接入 scheduler queue

## `ScheduleToolResult`

- **作用**: 表示 gateway 对一次 schedule 管理工具调用返回的结构化结果。
- **关键字段**:
  - `status`: `executed` | `needs_clarification` | `rejected`
  - `reason`
  - `question`
  - `targetDefinitionId`
  - `summary`
- **约束**:
  - `needs_clarification` 和 `rejected` 时不得修改 effective definition
  - `executed` 时必须能反查到对应 `ScheduleManagementAction`

## `TriggerExecution`

- **作用**: 保持 `006` 中的 scheduler 触发记录语义，但现在必须引用 effective definition。
- **关键字段**:
  - `id`
  - `definitionId`
  - `sourceType`
  - `status`
  - `runId`
  - `deliveryStatus`
  - `failureCode`
  - `failureMessage`
- **新增约束**:
  - 创建 execution 时读取的是 effective schedule，而不是原始 config baseline
  - execution 视图需要能反查“这次运行是否来自被 Codex 改过的 config definition”

## `Run`

- **作用**: 继续表示一次真正排队或执行中的自动化运行。
- **与本功能的关系**:
  - schedule 管理动作本身不创建 `Run`
  - 被管理后的 schedule definition 在未来 due 时点触发的 run，继续沿用现有 `Run` 语义
  - `triggerExecutionId`、`triggerSource`、`deliveryTarget`、`requestedSessionMode = fresh` 的规则不变

## 关系摘要

1. 一个 `SessionWorkspaceBinding` 解析出当前 chat 的 workspace
2. 一个 chat prompt 触发一次 `ScheduleManagementAction`
3. `ScheduleManagementAction` 通过 `ScheduleToolInvocation` / `ScheduleToolResult` 决定是否修改某条 `TriggerDefinition`
4. 若需要修改，则更新或创建 `TriggerDefinitionOverride`
5. scheduler 读取 `EffectiveManagedSchedule`
6. due 时创建 `TriggerExecution`
7. `TriggerExecution` 再关联到真正执行的 `Run` 与 `OutboundDelivery`

## 状态迁移摘要

1. create:
   - chat 已绑定 workspace
   - Codex 产出 `create` resolution
   - gateway 创建 `ScheduleManagementAction(executed)`
   - 写入 `TriggerDefinition(definitionOrigin = agent)`，必要时无 override

2. list:
   - chat 已绑定 workspace
   - Codex 产出 `list` resolution 或 gateway 直接接受 list 意图
   - gateway 创建 `ScheduleManagementAction(executed)`
   - 只读取 `EffectiveManagedSchedule`，不修改 definition

3. update / disable 唯一匹配:
   - chat 已绑定 workspace
   - matcher 在当前 workspace 内锁定唯一 definition
   - gateway 创建 `ScheduleManagementAction(executed)`
   - 对该 definition 写入或更新 `TriggerDefinitionOverride`

4. update / disable 歧义:
   - gateway 创建 `ScheduleManagementAction(needs_clarification)`
   - 不改 definition，不创建 override

5. 未绑定 workspace:
   - gateway 不会实际触发 `carvis-schedule`
   - 返回与既有 `/bind` 一致的引导结果
   - 不创建 `ScheduleManagementAction`
   - 不改 definition，不创建 override

6. 后续 scheduler 触发:
   - scheduler 从 effective schedule 生成 `TriggerExecution`
   - `Run` 与 `OutboundDelivery` 按 `006` 既有链路运行
