# 任务清单：Agent 管理定时任务

**输入**: `/specs/007-agent-managed-scheduling/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`

**测试要求**: 本功能触及 Feishu chat ingress、`carvis-schedule` CLI contract、skill 调用策略、trigger 持久化、scheduler 读路径、queueing 和 run lifecycle，因此每个用户故事都必须包含契约测试与集成测试；对 CLI 参数解析、gateway client、prompt/skill policy 和 effective merge 补充必要单元测试。

## Phase 1：初始化

- [x] T001 扩展 management-mode runtime 配置夹具，支持 CLI 驱动的 management actions in `tests/support/runtime-harness.ts`
- [x] T002 [P] 扩展集成 harness，支持 agent 经由 `carvis-schedule` CLI 调用 schedule 管理动作、workspace-scoped schedule 查询与后续 scheduler 触发断言 in `tests/support/harness.ts`

## Phase 2：基础能力

- [x] T003 更新 managed schedule canonical 类型，保留 CLI 审计所需字段 in `packages/core/src/domain/models.ts`, `packages/core/src/domain/runtime-models.ts`, `packages/core/src/index.ts`
- [x] T004 [P] 保持 managed schedule 持久化 schema 与 override/action 模型稳定，必要时补充 CLI 审计索引 in `packages/core/src/storage/migrations/007_agent_managed_schedules.sql`
- [x] T005 实现 CLI 仍需的 override、management action 和 effective definition 读取仓储 in `packages/core/src/storage/repositories.ts`
- [x] T006 [P] 保持 runtime config 与 definition sync 读取 effective definitions in `packages/core/src/config/runtime-config.ts`, `apps/gateway/src/services/trigger-definition-sync.ts`
- [x] T007 新增 `carvis-schedule` CLI package、命令解析器、gateway client、内部上下文解析和 skill package in `packages/carvis-schedule-cli/*`, `packages/skill-schedule-cli/*`
- [x] T007A [P] 新增统一 CLI contract 测试，覆盖共享 stdout JSON、stderr debug、exit code `0/2/3/4` 语义，以及默认从运行时自动解析 workspace/chat/session/requested-text 上下文 in `tests/unit/carvis-schedule-cli.test.ts`, `tests/contract/carvis-schedule-cli.contract.test.ts`
- [x] T008 [P] 为 effective merge、skill/prompt policy 与 CLI-first prompt 基础逻辑补充单元测试 in `tests/unit/trigger-definition-sync.test.ts`, `tests/unit/schedule-management-prompt.test.ts`
- [ ] T008A [P] (Deferred) 为 schedule tool audit 投影补充单元/契约覆盖，验证 not-invoked、gateway rejected、CLI failure 与 management success 的区分基础 in `tests/unit/run-controller.test.ts`, `tests/contract/internal-managed-schedules.contract.test.ts`
- [x] T009 [P] 新增未绑定 workspace 的 contract / integration 覆盖，验证 CLI-first schedule capability 时仍返回 `/bind` 引导且不会写入 management action 或 definition 变更 in `tests/contract/feishu-schedule-management-binding.contract.test.ts`, `tests/integration/feishu-schedule-management-unbound.test.ts`
- [x] T009A [P] 新增 bridge/executor 的 CLI readiness probe 测试，覆盖 `carvis-schedule` 不可执行时的 `CODEX_UNAVAILABLE` 启动失败语义 in `tests/unit/bridge-codex-cli-transport.test.ts`, `tests/integration/executor-startup.test.ts`

## Phase 3：用户故事 1 - 创建

- [x] T010 [P] [US1] 新增 `carvis-schedule create` CLI 契约测试，覆盖 workspace 作用域、create 字段校验、stdout/exit code 返回一致性 in `tests/unit/carvis-schedule-cli.test.ts`, `tests/contract/carvis-schedule-cli.contract.test.ts`
- [x] T011 [P] [US1] 新增 chat create 的 skill -> CLI -> gateway -> durable definition -> 后续 scheduler trigger 集成测试 in `tests/integration/feishu-schedule-create.test.ts`
- [ ] T011A [P] [US1] (Deferred) 新增语音 transcript 与文本 schedule create 等价的集成覆盖，验证同一语义入口得到相同 definition 与后续 trigger 行为 in `tests/integration/feishu-schedule-create.test.ts`, `tests/integration/gateway-feishu-runtime.test.ts`
- [x] T012 [P] [US1] 实现 create path 的 definition label 生成、agent-origin definition 创建和 management action 审计 in `apps/gateway/src/services/schedule-management-service.ts`, `packages/core/src/storage/repositories.ts`
- [x] T013 [US1] 将 create path 的 skill policy 与 CLI 接线接入普通 prompt 路径，并通过 gateway route / CLI gateway client / bridge shell command 打通 agent / executor / gateway 的 create 往返 in `apps/gateway/src/bootstrap.ts`, `apps/gateway/src/routes/internal-run-tools.ts`, `apps/executor/src/run-controller.ts`, `packages/bridge-codex/src/cli-transport.ts`, `packages/carvis-schedule-cli/*`
- [x] T014 [US1] 新增 managed schedule presenter 与内部查询 route，暴露新建 definition 的 effective 状态 in `apps/gateway/src/services/managed-schedule-presenter.ts`, `apps/gateway/src/routes/internal-managed-schedules.ts`, `apps/gateway/src/app.ts`
- [x] T015 [US1] 补充 create 相关结构化日志和 operator-visible 审计状态 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/services/schedule-management-service.ts`

## Phase 4：用户故事 2 - 查询

- [x] T016 [P] [US2] 新增 `carvis-schedule list` CLI 契约测试，覆盖 workspace-scoped 返回、origin 可见性、列表字段约束和 stdout/exit code 返回一致性 in `tests/contract/schedule-management-list.contract.test.ts`, `tests/contract/carvis-schedule-cli.contract.test.ts`
- [x] T017 [P] [US2] 新增当前 workspace schedule list 的 skill -> CLI -> gateway 集成测试，覆盖 `config` + `agent` definitions 同时可见 in `tests/integration/feishu-schedule-list.test.ts`
- [x] T018 [P] [US2] 实现 effective schedule list presenter，投影 `label`、origin、enabled、`nextDueAt` 和 `lastTriggerStatus` in `apps/gateway/src/services/managed-schedule-presenter.ts`
- [x] T019 [US2] 实现 list path 的 service 逻辑与 management action 审计 in `apps/gateway/src/services/schedule-management-service.ts`, `packages/core/src/storage/repositories.ts`
- [x] T020 [US2] 将 `carvis-schedule list` 的 skill policy / CLI path 接入 chat management orchestration 与内部查询 route 过滤 in `apps/gateway/src/bootstrap.ts`, `apps/gateway/src/routes/internal-managed-schedules.ts`, `packages/carvis-schedule-cli/*`

## Phase 5：用户故事 3 - 修改

- [x] T021 [P] [US3] 新增 `carvis-schedule update` CLI 契约测试，覆盖 unique match、config override、不支持时间表达拒绝和 stdout/exit code 返回一致性 in `tests/contract/schedule-management-update.contract.test.ts`, `tests/contract/carvis-schedule-cli.contract.test.ts`
- [x] T022 [P] [US3] 新增 update 的 skill -> CLI -> gateway 集成测试，覆盖 agent/config definitions 更新、effective 读取和后续 scheduler 触发 in `tests/integration/feishu-schedule-update.test.ts`
- [x] T023 [P] [US3] 实现 definition matcher 与目标唯一性解析 in `apps/gateway/src/services/schedule-definition-matcher.ts`, `apps/gateway/src/services/schedule-management-service.ts`
- [x] T024 [US3] 实现 update path 的 durable override 写入、label/prompt/schedule 变更和 management action 审计 in `apps/gateway/src/services/schedule-management-service.ts`, `packages/core/src/storage/repositories.ts`
- [x] T025 [US3] 更新 scheduler / presenter / query logic 以读取 override 后的 effective definition，并显式展示 `config` definition 已被 Codex 修改 in `apps/gateway/src/services/trigger-definition-sync.ts`, `apps/gateway/src/services/managed-schedule-presenter.ts`, `apps/gateway/src/routes/internal-managed-schedules.ts`
- [x] T026 [US3] 补充 `carvis-schedule update` 的结构化日志、CLI 澄清结果、CLI 失败语义、skill 最终回复与 operator-visible rejection 原因 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/bootstrap.ts`, `packages/carvis-schedule-cli/*`

## Phase 6：用户故事 4 - 停用

- [x] T027 [P] [US4] 新增 `carvis-schedule disable` CLI 契约测试，覆盖 unique match、clarification、no-future-trigger 语义和 stdout/exit code 返回一致性 in `tests/contract/schedule-management-disable.contract.test.ts`, `tests/contract/carvis-schedule-cli.contract.test.ts`
- [x] T028 [P] [US4] 新增 disable 的 skill -> CLI -> gateway 集成测试，覆盖 agent/config definitions 停用和后续 scheduler 不再创建 run in `tests/integration/feishu-schedule-disable.test.ts`
- [x] T029 [US4] 实现 disable path、目标歧义澄清与未找到目标拒绝逻辑 in `apps/gateway/src/services/schedule-management-service.ts`, `apps/gateway/src/services/schedule-definition-matcher.ts`
- [x] T030 [US4] 更新 scheduler loop、effective merge 和仓储写路径，确保 disabled override 不再产出新的 `TriggerExecution` 且历史保留 in `apps/gateway/src/services/scheduler-loop.ts`, `apps/gateway/src/services/trigger-definition-sync.ts`, `packages/core/src/storage/repositories.ts`
- [x] T031 [US4] 在 managed schedule presenter 和内部查询 route 中展示 disabled 状态、最近管理动作和历史执行摘要 in `apps/gateway/src/services/managed-schedule-presenter.ts`, `apps/gateway/src/routes/internal-managed-schedules.ts`

## Phase 7：收尾

- [x] T032 [P] 为 definition matcher、CLI gateway client、always-on skill policy 和 schedule management orchestration 补充单元/契约测试，覆盖普通对话不误调用 CLI 与 workspace hard gate in `tests/unit/schedule-definition-matcher.test.ts`, `tests/unit/carvis-schedule-cli.test.ts`, `tests/unit/schedule-management-service.test.ts`, `tests/contract/schedule-skill.contract.test.ts`
- [ ] T033 [P] (Deferred) 新增 management audit visibility 的 contract / integration 覆盖，验证 create/update/disable/needs_clarification 在查询面上的投影，以及未调用 schedule CLI / gateway reject / CLI failure / management success / run failure / delivery failure 的区分 in `tests/contract/internal-managed-schedules.contract.test.ts`, `tests/integration/managed-schedule-audit-visibility.test.ts`
- [x] T034 [P] 更新 quickstart、contracts、架构文档与运维 runbook，覆盖 `carvis-schedule` CLI、skill 策略、未绑定 workspace 拒绝路径、config override、CLI 故障排查与 operator 查询面 in `specs/007-agent-managed-scheduling/quickstart.md`, `specs/007-agent-managed-scheduling/contracts/schedule-management-tools.md`, `specs/007-agent-managed-scheduling/contracts/schedule-management-service.md`, `specs/007-agent-managed-scheduling/contracts/schedule-skill.md`, `docs/architecture.md`, `docs/runbooks/schedule-management.md`
- [x] T035 运行 `bun test`、`bun run lint` 并根据结果修正最终验证步骤 in `specs/007-agent-managed-scheduling/quickstart.md`
- [x] T036 删除旧 MCP 路径、安装脚本、probe 与相关文档漂移引用 in `packages/mcp-schedule/*`, `packages/skill-schedule-management/*`, `packages/bridge-codex/src/healthcheck-mcp-server.ts`, `scripts/install-codex-schedule-tools.ts`, `docs/runbooks/schedule-management.md`, `specs/007-agent-managed-scheduling/contracts/*`

## Notes

- 本功能显式要求真实 `CLI-first`；`Codex` 必须通过 `carvis-schedule` 调用 gateway，而不是输出结构化终态文本让 gateway 二次解释
- `carvis-schedule` 在普通 agent 路径下应默认从当前运行时自动解析上下文；显式 flags 只用于调试、测试与人工排障
- `config` 来源 definition 的聊天修改必须 durable 化，不能在下次 sync 时被静默覆盖
- schedule 管理动作本身不是 `Run`，真正执行仍通过后续 scheduler 触发进入既有 run lifecycle
- operator-visible 状态必须能区分未调用 schedule CLI、create/update/disable 的管理审计，以及后续 `TriggerExecution` / `Run` / `Delivery` 结果
- Deferred tasks:
  - `T008A`: 当前已有部分 tool-call 失败覆盖，但未补齐完整审计投影断言
  - `T011A`: 当前不交付语音 transcript 与文本等价的专门自动化覆盖
  - `T033`: 当前已有部分 management audit visibility 覆盖，但未补齐全部状态区分
