# 合同：Schedule Management Service

## 1. 服务职责

- `ScheduleManagementService` 是 gateway 内部唯一允许修改 managed schedule durable state 的入口
- 该服务必须统一处理：
  - `create`
  - `list`
  - `update`
  - `disable`
  - workspace 作用域限制
  - definition 匹配
  - override 应用
  - 管理动作审计

## 2. 作用域规则

- 每个请求都必须携带当前 chat 解析出的 workspace
- 服务只允许读取或修改该 workspace 内的 definitions
- 任何跨 workspace 目标都必须被拒绝

## 3. create

- 输入至少包含：
  - `workspace`
  - `label`
  - `scheduleExpr`
  - `timezone`
  - `promptTemplate`
  - `managedBySessionId`
  - `managedByChatId`
- create 成功后必须：
  - 创建新的 `TriggerDefinition(definitionOrigin = agent)`
  - 写入 `ScheduleManagementAction(executed, actionType = create)`
  - 让新 definition 立即进入 effective read model

## 4. list

- list 只能返回当前 workspace 的 effective schedules
- list 结果至少包含：
  - `definitionId`
  - `label`
  - `definitionOrigin`
  - `enabled`
  - `scheduleExpr`
  - `timezone`
  - `nextDueAt`
  - `lastTriggerStatus`
  - `lastManagedAt`
- list 必须基于 effective model，而不是只读 config baseline

## 5. update

- update 只允许修改当前 workspace 中唯一匹配的 definition
- 若目标是 `config` 来源 definition，服务必须写入或更新 override，而不是要求修改 runtime config 文件
- 若目标是 `agent` 来源 definition，服务可以直接更新 definition 或统一通过 override 表达，但 operator 视图必须保持同一语义
- update 成功后必须：
  - 保留历史 `TriggerExecution` 与 `Run`
  - 更新 effective schedule
  - 写入 `ScheduleManagementAction(executed, actionType = update)`

## 6. disable

- disable 只允许停用当前 workspace 中唯一匹配的 definition
- disable 不删除 definition，也不删除历史 execution / run
- 对 `config` 来源 definition 的 disable 必须 durable 化，避免下次 sync 直接恢复 enabled
- disable 成功后必须写入 `ScheduleManagementAction(executed, actionType = disable)`

## 7. 歧义与拒绝

- 多个候选目标时，服务必须返回 `needs_clarification`
- 无匹配目标时，服务必须返回 `rejected` 或等价明确结果
- 未绑定 workspace、时间表达不支持、字段缺失、字段非法或 `carvis-schedule` 调用上下文不完整时，服务必须拒绝请求
- 被拒绝或要求澄清时，不得修改 effective definition

## 8. scheduler 读取一致性

- scheduler loop 与 internal presenter 必须共享同一 effective definition 读取逻辑
- effective definition 一旦被 create/update/disable 修改，后续 scheduler tick 必须读取到最新值
- 若 definition 已被 disable，scheduler 不得继续创建新的 `TriggerExecution`

## 9. operator 可见性

- operator 查询面至少要能看出：
  - definition 来源：`config` / `agent`
  - definition 是否被 Codex 修改或停用
  - 最近一次管理动作及时间
  - 最近一次管理动作结果：`executed` | `needs_clarification` | `rejected`
  - 最近一次 trigger result
  - 后续 run 和 delivery 结果
- operator 查询面必须能区分：
  - “管理动作成功，但后续 run 失败”
  - “run 成功，但 delivery 失败”
  - “管理动作因目标不唯一而未变更”
  - “skill 未调用 tool” 或 “tool 调用被拒绝 / 失败”
