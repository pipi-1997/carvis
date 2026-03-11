# 合同：Schedule CLI

## 1. 适用范围

- 该合同定义 `carvis-schedule` 这一组 CLI 子命令
- 这些 CLI 子命令是 agent 侧唯一允许修改 schedule durable state 的执行入口
- 自然语音在被转成与文本等价的 prompt 后，复用同一合同

## 2. CLI 集合

- Carvis 必须提供以下 CLI：
  - `carvis-schedule create`
  - `carvis-schedule list`
  - `carvis-schedule update`
  - `carvis-schedule disable`
- CLI 只是一层 shell facade，真正 durable 写入仍由 gateway 执行
- skill 可以决定是否调用 CLI，但 skill 不得替代 CLI 执行持久化修改

## 3. CLI 上下文

- `carvis-schedule` 在普通 agent 调用路径下必须从当前 `Codex` 运行时自动解析 workspace、session、chat、user 与原始用户请求
- 显式 flags 只用于调试、测试或人工排障，不得成为 agent 正常路径必须手工拼接的契约
- CLI 执行时必须遵守：
  - “不得跨 workspace 管理”
  - “目标不唯一时必须要求澄清”
  - “不得直接创建旁路 run”
- `carvis-schedule list` 必须基于当前 workspace 的 effective schedule 视图返回结果

## 4. CLI 入参

- 所有 CLI 调用都必须能在不显式传 flags 的情况下完成当前会话上下文解析
- 可选调试 flags 包括但不限于：
  - `--gateway-base-url`
  - `--workspace`
  - `--session-id`
  - `--chat-id`
  - `--requested-text`
  - `--user-id`
- 各子命令额外字段：
  - `carvis-schedule create`:
    - `label`
    - `scheduleExpr`
    - `timezone`
    - `promptTemplate`
    - 可选 `deliveryTarget`
  - `carvis-schedule list`:
    - 无需目标 definition
  - `carvis-schedule update`:
    - `targetReference` 或 `definitionId`
    - 需要变更的字段集合
  - `carvis-schedule disable`:
    - `targetReference` 或 `definitionId`

## 5. gateway 校验与执行

- gateway 必须校验：
  - 解析出的 `workspace` 必须与当前 chat 绑定 workspace 一致
  - CLI action 必须属于允许集合
  - `scheduleExpr` 必须落入当前 scheduler 支持范围
  - `carvis-schedule update` / `carvis-schedule disable` 的目标必须在当前 workspace 内唯一匹配
  - 任何 CLI 调用都不能请求跨 workspace 管理
- 未绑定 workspace 时，gateway 必须在执行前拒绝整个 schedule management mode，且不得写入任何 definition 变更
- 校验失败时，gateway 必须返回结构化 CLI result，并写入 `ScheduleManagementAction(rejected)`

## 6. CLI result

- gateway 对每次 CLI 调用必须返回结构化结果：
  - `status = executed` | `needs_clarification` | `rejected`
  - `reason`
  - `question`（仅 `needs_clarification`）
  - `targetDefinitionId`
  - `summary`
- `needs_clarification` 或 `rejected` 时不得修改任何 definition

## 7. 成功执行结果

- `carvis-schedule create` / `carvis-schedule update` / `carvis-schedule disable` 成功后，gateway 必须：
  - 写入或更新对应的 durable definition / override
  - 记录 `ScheduleManagementAction(executed)`
  - 返回用户可读结果摘要
- `carvis-schedule list` 成功后，gateway 必须：
  - 返回当前 workspace 的 effective schedule 列表
  - 记录 `ScheduleManagementAction(executed)`

## 8. 非目标行为

- schedule 管理 CLI 调用不得直接创建 `TriggerExecution`
- schedule 管理 CLI 调用不得直接创建旁路 `Run`
- 任何真正的自动执行都必须等后续 scheduler tick 按 effective definition 触发
- skill 或其他 agent 接线不得绕过 CLI -> gateway 直接修改 schedule durable state
