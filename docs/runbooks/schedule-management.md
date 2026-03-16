# Runbook: Schedule Management

## 1. 适用范围

- 本 runbook 面向 `007-agent-managed-scheduling`
- 适用于 Feishu chat 中经由 agent 管理 `carvis-schedule` 的 create / list / update / disable
- 管理动作只覆盖控制面写入；真正执行仍由既有 `scheduler -> trigger execution -> run -> delivery` 链路负责

## 2. 运行前检查

1. 确认 `gateway` 与 `executor` 使用同一份 `~/.carvis/config.json`
2. 确认 `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 已注入
3. 确认目标 Feishu `chat` 已执行 `/bind <workspace-key>`
4. 确认 `gateway /healthz` 为 ready，且 executor 已进入 `consumerActive = true`
5. 如需验证 `config` baseline 的 override，先在 runtime config 的 `triggers.scheduledJobs` 中声明目标任务
6. 确认 `carvis doctor` 已通过

## 3. 两条执行路径

### A. 正常路径：Codex 会话内

这是默认路径。

- agent 在 Codex 会话内直接执行 `carvis-schedule`
- `bridge-codex` 会注入：
  - `CARVIS_GATEWAY_BASE_URL`
  - `CARVIS_SCHEDULE_SOCKET_PATH`
  - `CARVIS_WORKSPACE`
  - `CARVIS_SESSION_ID`
  - `CARVIS_CHAT_ID`
  - `CARVIS_USER_ID`
  - `CARVIS_REQUESTED_TEXT`
- 因此在正常 agent 路径下，不需要人工补这些上下文

### B. 人工 shell 调试路径

如果你是在仓库根目录手工排障，而不是处在正常 Codex 会话内：

- `./packages/carvis-schedule-cli/bin/carvis-schedule --help` 可以直接运行
- 但 `list/create/update/disable` 不是“裸命令即用”
- 手工执行这些动作时，必须显式提供运行时上下文

至少需要：

- `--session-id`
- `--chat-id`
- `--requested-text`

常见还需要：

- `--workspace`
- `CARVIS_SCHEDULE_SOCKET_PATH` 或 `--gateway-base-url`

## 4. 核心链路

1. 用户在已绑定 workspace 的聊天发送 schedule 管理请求
2. gateway 为普通 prompt 注入 schedule skill prompt，但是否调用 `carvis-schedule` 由 agent 自主判断
3. agent 只能经由 `carvis-schedule create|list|update|disable` 调用 gateway
4. gateway 在 `ScheduleManagementService` 中执行 workspace 校验、目标匹配、override 写入和 action 审计
5. 后续 scheduler tick 读取 effective definition，按既有 trigger/run lifecycle 执行
6. operator 通过 `/internal/managed-schedules` 查询 definition、action、latestExecution、run 与 delivery 投影

## 5. 常用排查面

- 健康检查：`GET /healthz`
- 管理查询面：`GET /internal/managed-schedules?workspace=<workspace-path>`
- 触发查询面：`GET /internal/triggers/definitions`
- 运行日志：关注 `run.failed`、`delivery.failed` 和 `scheduleManagementActions`

## 6. 常见问题

### 6.1 未绑定 workspace

- 现象：聊天里发送“每天 9 点提醒我”，系统只返回 `/bind <workspace-key>` 引导
- 预期：不创建 run，不写 definition，不写 override，不写 management action
- 处理：
  1. 在该 chat 执行 `/bind <workspace-key>`
  2. 重新发送 schedule 请求

### 6.2 CLI 调用失败

- 现象：agent 调用了 `carvis-schedule`，但 CLI 返回 exit code `4`
- 预期：这是调用层失败，不应被误判成业务 `rejected`
- 处理：
  1. 检查 gateway 进程是否在线
  2. 先区分自己是在“Codex 会话路径”还是“人工 shell 路径”
  3. 若是人工 shell 路径，不要直接假设 `carvis-schedule list` 可裸跑；先补齐 `--session-id`、`--chat-id`、`--requested-text` 等上下文
  4. 若正在做人工排障或脱离正常 agent 路径执行，再检查 `CARVIS_GATEWAY_BASE_URL`、`CARVIS_SCHEDULE_SOCKET_PATH` 等调试覆盖项
  5. 重新查看 `/internal/managed-schedules`，确认没有意外写入 action / override

### 6.3 `carvis-schedule` 不可执行

- 现象：executor 启动即报 `CODEX_UNAVAILABLE`
- 预期：这是宿主 `Codex` 运行环境里 `carvis-schedule` 不可执行，不应继续做聊天重试
- 处理：
  1. 先执行 `bun run --filter @carvis/carvis-cli carvis doctor`
  2. 如需手工验证，再在仓库根目录执行 `./packages/carvis-schedule-cli/bin/carvis-schedule --help`
  3. 若仍失败，检查本机 Bun 运行环境与仓库依赖是否完整
  4. 只有当 CLI readiness probe 通过后，才继续做聊天验证

### 6.4 时间表达被拒绝

- 现象：CLI stdout JSON 返回 `reason = unsupported_schedule`
- 原因：当前调度器只支持分钟粒度 cron 形式
- 处理：
  1. 让 agent 改写成标准 cron
  2. 示例：`每天早上 9 点` -> `0 9 * * *`

### 6.5 修改或停用目标不唯一

- 现象：CLI stdout JSON 返回 `status = needs_clarification` 且 `reason = ambiguous_target`
- 预期：不会写 override
- 处理：
  1. 要求用户补充更明确的 label 或 definition
  2. 使用 `/internal/managed-schedules` 查看当前 workspace 中的候选 definition

### 6.6 config baseline 被聊天修改后为何没有丢失

- 说明：runtime config 仍是 baseline，聊天变更会写入 `trigger_definition_overrides`
- 预期：internal query 中 definition 仍显示 `definitionOrigin = config`，同时 `overridden = true`
- 处理：
  1. 查询 `/internal/managed-schedules`
  2. 核对 effective schedule 是否已变更
  3. 重启 gateway 后再次确认 sync 没有覆盖 override

### 6.7 管理动作成功，但后续执行失败

- 现象：`latestAction.resolutionStatus = executed`，但 `latestExecution.status = failed` 或 delivery 为 `failed`
- 说明：这是控制面成功、执行面失败，必须分开处理
- 处理：
  1. 先确认 management action 不需要回滚
  2. 再排查 run failure / delivery failure 的具体错误
  3. 如需停用任务，显式调用 `carvis-schedule disable`

## 7. 验证命令

```bash
bun test tests/contract/schedule-management-tools.contract.test.ts \
  tests/contract/schedule-management-list.contract.test.ts \
  tests/contract/schedule-management-update.contract.test.ts \
  tests/contract/schedule-management-disable.contract.test.ts \
  tests/contract/carvis-schedule-cli.contract.test.ts \
  tests/contract/schedule-skill.contract.test.ts \
  tests/contract/internal-managed-schedules.contract.test.ts \
  tests/contract/feishu-schedule-management-binding.contract.test.ts

bun test tests/integration/feishu-schedule-management-unbound.test.ts \
  tests/integration/feishu-schedule-create.test.ts \
  tests/integration/feishu-schedule-list.test.ts \
  tests/integration/feishu-schedule-update.test.ts \
  tests/integration/feishu-schedule-disable.test.ts \
  tests/integration/managed-schedule-audit-visibility.test.ts

bun run lint
```
