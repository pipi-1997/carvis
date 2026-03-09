---

description: "Task list for 004-codex-session-memory"
---

# 任务清单：Codex 会话续聊记忆

**输入**: `/specs/004-codex-session-memory/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（必需）、research.md、data-model.md、contracts/、quickstart.md

**测试要求**: 本功能触及 Feishu adapter、Codex bridge、run lifecycle、queue/run-flow 与用户命令语义；每个用户故事都必须包含契约测试与集成测试。单元测试用于补足 CLI transport、仓储和日志等本地逻辑。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现、独立验证和增量交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 所属用户故事（仅用户故事阶段使用）
- 每条任务都包含精确文件路径

## Phase 1：初始化（共享测试支撑）

**目的**: 先补齐本功能复用的测试夹具与运行时辅助，避免三个用户故事重复造测试环境。

- [X] T001 扩展 `tests/support/harness.ts` 和 `tests/support/runtime-harness.ts`，加入 Codex session continuation 场景的共享 fixture、断言辅助与 fake transport 组装能力

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 完成会话续聊绑定的持久化、领域模型和 bridge 基础契约；本阶段完成前不得开始任何用户故事实现。

- [X] T002 更新 `packages/core/src/domain/models.ts`，新增 `ConversationSessionBinding`、run/session continuation 字段、`/new` 命令枚举和状态类型
- [X] T003 更新 `packages/core/src/domain/index.ts`、`packages/core/src/index.ts` 和 `packages/core/src/storage/repositories.ts`，导出 continuation 领域类型并声明绑定仓储接口
- [X] T004 新增 `packages/core/src/storage/migrations/004_conversation_session_bindings.sql`，为续聊绑定与 run continuation 审计字段建立持久化 schema
- [X] T005 实现 `packages/core/src/storage/repositories.ts` 中的 in-memory/Postgres 续聊绑定读写、run continuation 字段映射和重置/失效回写逻辑
- [X] T006 [P] 扩展 `tests/unit/postgres-repositories.test.ts`，覆盖新 migration、绑定仓储 CRUD、reset/invalidate/recover 持久化行为
- [X] T007 扩展 `packages/bridge-codex/src/bridge.ts` 和 `packages/bridge-codex/src/index.ts`，让 `RunRequest` 可携带 `bridgeSessionId/sessionMode`，并让 bridge 输出 continuation 结果元数据
- [X] T008 [P] 更新 `packages/bridge-codex/src/cli-transport.ts` 和 `tests/unit/bridge-codex-cli-transport.test.ts`，实现 Codex CLI continuation 参数拼装与 session 元数据解析
- [X] T009 [P] 扩展 `packages/core/src/observability/runtime-logger.ts` 和 `tests/unit/runtime-logger.test.ts`，增加 binding established/reset/invalidated/recovered 的结构化日志入口

**检查点**: 续聊绑定模型、迁移、仓储、Codex bridge continuation 输入输出和日志基础已就绪，可以开始交付用户故事。

---

## Phase 3：用户故事 1 - 同会话续聊（优先级：P1）🎯 MVP

**目标**: 同一个飞书 `chat` 的后续普通消息默认续用同一个 Codex 原生 session，而不是每轮都从零开始。

**独立验证方式**: 在同一个飞书 `chat` 连续发送两条明显依赖上下文的消息，第二条消息无需重述背景即可正确延续上文。

### 用户故事 1 的测试 ⚠️

- [X] T010 [P] [US1] 扩展 `tests/contract/bridge-codex.contract.test.ts`，验证 continuation-aware `RunRequest`、bridge 输出 session 元数据和成功回写契约
- [X] T011 [P] [US1] 新增 `tests/integration/feishu-session-continuation.test.ts`，验证同一 `chat` 首轮建绑、次轮续聊，以及多个 `chat` 共享同一 `workspace` 时 binding 仍按 `chat` 隔离且 queue/lock 语义不变

### 用户故事 1 的实现

- [X] T012 [US1] 更新 `apps/gateway/src/routes/feishu-webhook.ts`，在普通消息排队前读取当前 `ConversationSessionBinding` 并构建 continuation-aware `RunRequest`
- [X] T013 [US1] 更新 `packages/core/src/storage/repositories.ts` 和 `packages/core/src/domain/models.ts`，让 queued run 持久化 `requestedSessionMode`、`resolvedBridgeSessionId` 等 continuation 审计字段
- [X] T014 [US1] 更新 `apps/executor/src/run-controller.ts`，把 continuation 字段传入 `CodexBridge.startRun` 并在成功完成后建立或刷新当前 `chat` 的续聊绑定
- [X] T015 [US1] 更新 `apps/executor/src/run-controller.ts` 和 `packages/core/src/observability/runtime-logger.ts`，记录 established/continued operator-visible 日志与结果归因

**检查点**: 用户故事 1 完成后，同一飞书会话已具备可验证的上下文续聊能力，且不改变既有排队和单活动运行语义。

---

## Phase 4：用户故事 2 - 显式开新话题（优先级：P2）

**目标**: 用户可以通过 `/new` 清空当前 `chat` 的续聊绑定，并通过 `/status` 看到当前处于新会话模式还是续聊模式。

**独立验证方式**: 在已有绑定的飞书 `chat` 中执行 `/new`，随后发送一条依赖旧上下文的消息，应表现为新会话；执行 `/status` 可看到 reset/fresh/continued 状态。

### 用户故事 2 的测试 ⚠️

- [X] T016 [P] [US2] 扩展 `tests/contract/channel-feishu.contract.test.ts` 和 `tests/contract/status-command.contract.test.ts`，验证 `/new` 解析和 continuation 状态的用户可见输出契约
- [X] T017 [P] [US2] 新增 `tests/integration/feishu-session-memory-commands.test.ts`，覆盖 `/new` 重置、active run 不受影响、后续新会话和 `/status` 状态展示

### 用户故事 2 的实现

- [X] T018 [US2] 更新 `packages/channel-feishu/src/adapter.ts` 和 `packages/core/src/domain/models.ts`，把 `/new` 纳入 Feishu 入站命令解析与 `CommandName`
- [X] T019 [US2] 新增 `apps/gateway/src/commands/new.ts` 并更新 `apps/gateway/src/routes/feishu-webhook.ts`，实现显式重置续聊绑定且不打断当前 active run 的命令路由与用户响应
- [X] T020 [US2] 更新 `packages/core/src/storage/repositories.ts`，实现 `/new` 对当前 `chat` 绑定的 reset 持久化与最近一次 reset 结果记录
- [X] T021 [US2] 更新 `apps/gateway/src/commands/status.ts` 和 `apps/gateway/src/services/status-presenter.ts`，在 `/status` 中统一展示 `fresh`、`continued`、`recent_reset`、`recent_recovered`、`recent_recovery_failed` 这些续聊状态

**检查点**: 用户故事 2 完成后，使用者已能控制上下文边界，并能在不暴露底层技术细节的前提下看见当前会话记忆状态。

---

## Phase 5：用户故事 3 - 失效后自动恢复（优先级：P3）

**目标**: 当底层 Codex session 已失效时，系统能识别并只自动重试一次新会话，成功后切换绑定，失败则按普通 run.failed 收口。

**独立验证方式**: 人为注入一个不可恢复的 `bridgeSessionId`，随后在同一 `chat` 发起请求；系统应完成一次 fresh-session 自动恢复并在下一轮继续使用新绑定。

### 用户故事 3 的测试 ⚠️

- [X] T022 [P] [US3] 扩展 `tests/contract/bridge-codex.contract.test.ts`，验证 invalid-session 信号、单次自动恢复和非 invalid 错误不清绑的契约
- [X] T023 [P] [US3] 新增 `tests/integration/feishu-session-recovery.test.ts`，覆盖已失效绑定、单次 fresh-session 重试、回写新绑定、重复请求继续命中新绑定，以及“恢复成功但通知投递失败”仍能与 run 失败区分审计

### 用户故事 3 的实现

- [X] T024 [US3] 更新 `packages/bridge-codex/src/bridge.ts` 和 `packages/bridge-codex/src/cli-transport.ts`，识别 Codex invalid-session 错误并把恢复判定结果传回 executor
- [X] T025 [US3] 更新 `apps/executor/src/run-controller.ts`，实现仅一次的 fresh-session 自动重试、旧绑定失效标记和成功后的新绑定切换
- [X] T026 [US3] 更新 `packages/core/src/storage/repositories.ts`、`apps/gateway/src/commands/status.ts`、`apps/gateway/src/services/run-notifier.ts` 和 `packages/core/src/observability/runtime-logger.ts`，持久化 recovery 成败、区分 recovery 与 delivery failure 归因，并向 `/status`/operator 日志暴露 `recent_recovered` 或 `recent_recovery_failed` 状态

**检查点**: 用户故事 3 完成后，续聊能力对底层 session 失效具备一次性自愈能力，同时保持普通失败路径和现有运行生命周期语义不变。

---

## Phase 6：收尾与横切关注点

**目的**: 完成文档、运维说明与最终验证，确保 004 可被独立交付。

- [X] T027 [P] 更新 `docs/architecture.md` 和 `AGENTS.md`，记录 Codex session continuation、`/new`、`/status` 和记忆恢复的最新行为
- [X] T028 [P] 更新 `specs/004-codex-session-memory/quickstart.md`、`specs/004-codex-session-memory/contracts/codex-session-continuation.md` 和 `specs/004-codex-session-memory/contracts/feishu-session-memory-commands.md`，同步最终实现细节与验收步骤
- [X] T029 运行并记录 `bun run lint`、`bun test`、`bunx tsc --noEmit`、`git diff --check -- .`，确认 004 的验证闭环完成

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（初始化）**: 无依赖，可立即开始
- **Phase 2（基础能力）**: 依赖 Phase 1，且阻塞全部用户故事
- **Phase 3（US1）**: 依赖 Phase 2 完成；这是 MVP，建议最先交付
- **Phase 4（US2）**: 依赖 Phase 2；实现上复用 US1 的 binding 能力，但可在 US1 稳定后独立推进
- **Phase 5（US3）**: 依赖 Phase 2 和 US1；因为恢复逻辑建立在 continuation 主链路之上
- **Phase 6（收尾）**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1（P1）**: 无其他用户故事依赖，是本功能的最小可交付闭环
- **US2（P2）**: 依赖基础 continuation/binding 能力，但应能独立验证 `/new` 与 `/status`
- **US3（P3）**: 依赖 continuation 主链路；恢复逻辑不应改变 US1/US2 的外部语义

### Within Each User Story

- 契约测试与集成测试必须先写，并先看到失败，再实现功能
- continuation 领域模型与仓储先于 gateway/executor 流程改动
- bridge/CLI transport 元数据先于恢复逻辑
- 命令解析先于命令处理器和状态渲染
- 自动恢复逻辑完成后再补 `/status` 和 operator 可见结果

### Parallel Opportunities

- Phase 2 中 `T006`、`T008`、`T009` 可与主实现并行推进
- US1 的 `T010`、`T011` 可并行；US1 实现完成后再串起 `T012`-`T015`
- US2 的 `T016`、`T017` 可并行；`T018` 可与 `/status` 展示逻辑部分并行评估
- US3 的 `T022`、`T023` 可并行；恢复判定与 executor 重试实现需顺序推进
- Phase 6 的文档同步 `T027`、`T028` 可并行，最终验证 `T029` 收口

---

## Parallel Example: User Story 1

```bash
# 并行先补测试：
Task: "T010 [US1] 扩展 tests/contract/bridge-codex.contract.test.ts"
Task: "T011 [US1] 新增 tests/integration/feishu-session-continuation.test.ts"

# 基础能力就绪后，可并行准备实现支撑：
Task: "T013 [US1] 更新 packages/core/src/storage/repositories.ts 和 packages/core/src/domain/models.ts"
Task: "T015 [US1] 更新 apps/executor/src/run-controller.ts 和 packages/core/src/observability/runtime-logger.ts"
```

---

## Parallel Example: User Story 2

```bash
# 并行补命令侧测试：
Task: "T016 [US2] 扩展 tests/contract/channel-feishu.contract.test.ts 和 tests/contract/status-command.contract.test.ts"
Task: "T017 [US2] 新增 tests/integration/feishu-session-memory-commands.test.ts"

# `/new` 解析和 `/status` 呈现可分头准备：
Task: "T018 [US2] 更新 packages/channel-feishu/src/adapter.ts 和 packages/core/src/domain/models.ts"
Task: "T021 [US2] 更新 apps/gateway/src/commands/status.ts 和 apps/gateway/src/services/status-presenter.ts"
```

---

## Parallel Example: User Story 3

```bash
# 并行先写恢复路径测试：
Task: "T022 [US3] 扩展 tests/contract/bridge-codex.contract.test.ts"
Task: "T023 [US3] 新增 tests/integration/feishu-session-recovery.test.ts"

# 恢复实现按 bridge -> executor -> status/logging 收口：
Task: "T024 [US3] 更新 packages/bridge-codex/src/bridge.ts 和 packages/bridge-codex/src/cli-transport.ts"
Task: "T025 [US3] 更新 apps/executor/src/run-controller.ts"
Task: "T026 [US3] 更新 packages/core/src/storage/repositories.ts、apps/gateway/src/commands/status.ts 和 packages/core/src/observability/runtime-logger.ts"
```

---

## 实施策略

### MVP First（只交付 US1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 运行 `quickstart.md` 中的同会话续聊验证
5. 如果通过，就可以先演示/交付“上下文不断档”的 MVP

### Incremental Delivery

1. Setup + Foundational 完成后，先交付 US1 的续聊主链路
2. 在 US1 稳定后交付 US2，让用户获得显式重置与状态可见性
3. 最后交付 US3，让 invalid-session 场景具备一次性自愈能力
4. 每个故事完成后都要单独通过契约测试、集成测试和 quickstart 对应验收

### Parallel Team Strategy

1. 一人推进 Phase 2 的领域模型、迁移和仓储
2. 一人推进 `bridge-codex` 的 continuation 输入输出与 CLI transport 测试
3. 一人推进 Feishu 命令和状态呈现
4. 在 Phase 2 稳定后，再按 US1 → US2 → US3 汇总到 run-flow

---

## Notes

- `[P]` 任务表示文件边界清晰、可并行推进，但前置依赖仍需满足
- 所有用户故事都必须保留现有 queue/lock/cancel/timeout/heartbeat 语义
- `/new` 只影响后续新请求，不中断当前 active run
- US3 的自动恢复只能发生一次，不能形成隐式重试循环
- 完成每个故事后都应检查 operator-visible 状态、日志和持久化字段是否可审计
