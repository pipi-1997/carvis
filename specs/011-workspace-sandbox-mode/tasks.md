# 任务清单：工作区 Codex Sandbox 模式

**输入**: `/specs/011-workspace-sandbox-mode/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`

**测试要求**: 本功能触及 Feishu 命令解析、Codex bridge、canonical run lifecycle、scheduler / webhook 触发路径、`/status` 用户可见状态和 operator 可观测性，因此每个用户故事都必须包含契约测试与集成测试；对 runtime config、仓储和 CLI transport 补充必要单元测试。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现、独立验证和增量交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 对应用户故事（`[US1]`、`[US2]`、`[US3]`、`[US4]`）
- 每条任务都包含精确文件路径

## Phase 1：初始化（共享夹具与测试支撑）

**目的**: 为工作区 sandbox mode 功能补齐共享测试夹具，避免各用户故事重复搭建配置、chat override 和 trigger 场景。

- [ ] T001 扩展 `tests/support/runtime-harness.ts`，为工作区默认 `codexSandboxMode`、chat sandbox override 和 trigger run 场景提供共享 runtime config fixture
- [ ] T002 [P] 扩展 `tests/support/harness.ts`，加入 sandbox mode 断言辅助、chat override 注入能力和 Codex CLI 参数捕获辅助

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立 sandbox mode 的领域模型、配置、持久化和 bridge 基础契约；本阶段完成前不得开始任何用户故事实现。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 更新 `packages/core/src/domain/models.ts`、`packages/core/src/domain/runtime-models.ts`、`packages/core/src/domain/index.ts` 和 `packages/core/src/index.ts`，新增 `CodexSandboxMode`、`ChatSandboxOverride`、run sandbox 审计字段、状态快照字段和 `/mode` 命令枚举
- [ ] T004 更新 `packages/core/src/config/runtime-config.ts`，为 `workspaceResolver.sandboxModes` 增加 schema 校验、workspace 关联校验和 runtime fingerprint 输入
- [ ] T005 新增 `packages/core/src/storage/migrations/009_chat_sandbox_overrides.sql`，为 chat sandbox overrides、run sandbox 审计字段和 continuation binding 的 `sandbox_mode` 建立持久化 schema
- [ ] T006 实现 `packages/core/src/storage/repositories.ts` 中的 in-memory/Postgres sandbox override 读写、run sandbox 字段映射和 continuation binding `sandboxMode` 回写逻辑
- [ ] T007 [P] 扩展 `tests/unit/runtime-config.test.ts` 和 `tests/unit/postgres-repositories.test.ts`，覆盖 `workspaceResolver.sandboxModes` 校验、sandbox override CRUD、run sandbox 字段和 binding `sandboxMode` 持久化行为
- [ ] T008 [P] 更新 `packages/bridge-codex/src/bridge.ts`、`packages/bridge-codex/src/cli-transport.ts` 和 `tests/unit/bridge-codex-cli-transport.test.ts`，让 bridge 消费 `resolvedSandboxMode` 并按 mode 映射 `codex exec --sandbox ...`

**检查点**: sandbox mode 领域模型、配置、迁移、仓储和 bridge 参数映射基础已就绪，可以开始推进用户故事。

---

## Phase 3：用户故事 1 - 按工作区默认权限执行（优先级：P1）🎯 MVP

**目标**: 每个工作区都能声明自己的默认 `codexSandboxMode`，并让飞书普通消息、scheduled job 和 external webhook 都按目标工作区默认值执行。

**独立验证方式**: 为两个工作区配置不同默认 mode，分别通过飞书普通消息、scheduled job 和 external webhook 触发运行，确认 run 的 `resolvedSandboxMode` 与目标工作区一致。

### 用户故事 1 的测试 ⚠️

- [ ] T009 [P] [US1] 扩展 `tests/contract/bridge-codex.contract.test.ts` 和 `tests/contract/trigger-lifecycle.contract.test.ts`，验证工作区默认 sandbox mode 能进入 canonical run 和 bridge 执行契约
- [ ] T010 [P] [US1] 新增 `tests/integration/feishu-sandbox-mode-default.test.ts` 和 `tests/integration/trigger-sandbox-mode-default.test.ts`，覆盖飞书、scheduled job 和 external webhook 都按工作区默认值执行的闭环

### 用户故事 1 的实现

- [ ] T011 [P] [US1] 新增 `apps/gateway/src/services/sandbox-mode-resolver.ts`，实现按 `workspaceKey` 解析默认 sandbox mode 的共享服务
- [ ] T012 [US1] 更新 `apps/gateway/src/routes/feishu-webhook.ts` 和 `apps/gateway/src/bootstrap.ts`，让普通飞书消息在创建 queued run 前解析并写入默认 sandbox mode
- [ ] T013 [US1] 更新 `apps/gateway/src/services/trigger-dispatcher.ts` 和 `apps/gateway/src/routes/external-webhook.ts`，让 scheduled job 与 external webhook 在无 chat 上下文时仍解析并持久化工作区默认 sandbox mode
- [ ] T014 [US1] 更新 `packages/core/src/storage/repositories.ts` 和 `apps/gateway/src/services/trigger-status-presenter.ts`，让 run 与 trigger 查询面持久化并投影 `requestedSandboxMode`、`resolvedSandboxMode` 和 `sandboxModeSource`
- [ ] T015 [US1] 更新 `apps/executor/src/run-controller.ts` 和 `packages/bridge-codex/src/cli-transport.ts`，让 executor / bridge 全链路消费 run 上冻结的 `resolvedSandboxMode`

**检查点**: 用户故事 1 完成后，不同触发路径都能稳定使用工作区默认 sandbox mode，且不改变既有 queue / lock / heartbeat 语义。

---

## Phase 4：用户故事 2 - 在当前 chat 临时切换模式（优先级：P1）

**目标**: 用户可以在 Feishu `chat` 中通过 `/mode` 临时覆盖当前工作区默认 sandbox mode，并通过 `/mode reset` 回到默认值。

**独立验证方式**: 在同一飞书 `chat` 中依次执行 `/mode danger-full-access`、普通消息、`/mode reset`、普通消息，确认前后两次 run 分别使用 chat override 和工作区默认值。

### 用户故事 2 的测试 ⚠️

- [ ] T016 [P] [US2] 扩展 `tests/contract/channel-feishu.contract.test.ts` 和 `tests/contract/status-command.contract.test.ts`，验证 `/mode` 命令解析、非法参数拒绝、现有 allowlist 保护和 `/status` 中的 sandbox mode 展示契约
- [ ] T017 [P] [US2] 新增 `tests/integration/feishu-sandbox-mode-commands.test.ts`，覆盖 `/mode workspace-write`、`/mode danger-full-access`、`/mode reset`、未授权用户拒绝和 30 分钟 override 过期回退

### 用户故事 2 的实现

- [ ] T018 [US2] 更新 `packages/channel-feishu/src/command-normalization.ts`、`packages/channel-feishu/src/adapter.ts` 和 `packages/channel-feishu/src/websocket.ts`，把 `/mode` 纳入 Feishu 命令归一化和未知参数拒绝路径
- [ ] T019 [US2] 新增 `apps/gateway/src/commands/mode.ts` 并更新 `apps/gateway/src/routes/feishu-webhook.ts` 与 `apps/gateway/src/bootstrap.ts`，实现 `/mode` 命令路由、override 建立和 reset 行为
- [ ] T020 [US2] 更新 `packages/core/src/storage/repositories.ts` 和 `apps/gateway/src/services/sandbox-mode-resolver.ts`，实现 chat sandbox override 的解析、固定 30 分钟 TTL 与读时懒过期语义
- [ ] T021 [US2] 更新 `apps/gateway/src/commands/status.ts` 和 `apps/gateway/src/services/status-presenter.ts`，让 `/status` 展示当前 sandbox mode、来源和 override 有效期或已过期结果

**检查点**: 用户故事 2 完成后，Feishu 用户已能显式控制当前 chat 的 sandbox mode，并能从 `/status` 读回实际生效结果。

---

## Phase 5：用户故事 3 - 重开上下文时同步清除临时模式（优先级：P2）

**目标**: `/new` 与工作区切换都清理当前 chat 的 sandbox override，且 sandbox mode 变化后后续普通消息必须 fresh 执行，不跨 mode 续用 continuation。

**独立验证方式**: 在已有 continuation 与 override 的飞书 `chat` 中执行 `/new`，并验证后续消息回到工作区默认 mode；切换 mode 后发送下一条普通消息，验证该 run 从 fresh 会话开始执行。

### 用户故事 3 的测试 ⚠️

- [ ] T022 [P] [US3] 扩展 `tests/contract/channel-feishu.contract.test.ts` 和 `tests/contract/feishu-bind-command.contract.test.ts`，验证 `/new`、`/bind` 对 sandbox override 的清理契约
- [ ] T023 [P] [US3] 扩展 `tests/integration/feishu-session-memory-commands.test.ts`、`tests/integration/feishu-bind-command.test.ts` 和 `tests/integration/feishu-session-continuation.test.ts`，覆盖 `/new` 清理 override、`/bind` 切工作区清理 override 和 mode 变化触发 fresh

### 用户故事 3 的实现

- [ ] T024 [US3] 更新 `apps/gateway/src/commands/new.ts` 和 `apps/gateway/src/commands/bind.ts`，让 `/new` 与工作区切换同步清理当前 chat 的 sandbox override
- [ ] T025 [US3] 更新 `apps/gateway/src/services/continuation-binding.ts` 和 `apps/gateway/src/routes/feishu-webhook.ts`，在 continuation 解析时比较 binding `sandboxMode` 与当前 `resolvedSandboxMode`，不一致时强制 fresh
- [ ] T026 [US3] 更新 `apps/executor/src/run-controller.ts` 和 `packages/core/src/storage/repositories.ts`，在 run 成功后回写 continuation binding 的 `sandboxMode`，并让 reset / invalidation 与 sandbox mode 保持一致

**检查点**: 用户故事 3 完成后，“开新会话”“切工作区”“切 sandbox mode” 都有清晰的上下文边界，不会把旧权限或旧 continuation 静默带入下一轮请求。

---

## Phase 6：用户故事 4 - 让用户与运维看清实际执行模式（优先级：P2）

**目标**: 用户和 operator 能从 `/status`、trigger 查询面和结构化日志中明确看出 run 的实际 sandbox mode、来源和过期回退结果。

**独立验证方式**: 制造工作区默认值、chat override、override 过期、scheduled job 和 external webhook 运行场景，确认 `/status`、trigger visibility 和日志都能解释 mode 来源。

### 用户故事 4 的测试 ⚠️

- [ ] T027 [P] [US4] 扩展 `tests/contract/status-command.contract.test.ts` 和 `tests/contract/trigger-visibility.contract.test.ts`，验证 sandbox mode 在 `/status` 与 trigger/operator 查询面中的契约输出
- [ ] T028 [P] [US4] 扩展 `tests/integration/status-command.test.ts` 和 `tests/integration/trigger-visibility.test.ts`，覆盖工作区默认值、chat override、override 过期回退和 non-chat `workspace_default` 可见性

### 用户故事 4 的实现

- [ ] T029 [US4] 更新 `packages/core/src/domain/models.ts`、`apps/gateway/src/commands/status.ts` 和 `apps/gateway/src/services/status-presenter.ts`，完善 `StatusSnapshot` 的 sandbox mode 聚合与渲染
- [ ] T030 [US4] 更新 `apps/gateway/src/services/trigger-status-presenter.ts` 和 `apps/gateway/src/routes/internal-triggers.ts`，让 trigger/operator 查询面暴露 run 的 sandbox mode 与来源
- [ ] T031 [US4] 更新 `packages/core/src/observability/runtime-logger.ts`、`apps/gateway/src/routes/feishu-webhook.ts` 和 `apps/executor/src/run-controller.ts`，增加 sandbox mode 解析、override set/reset/expired 和 mode-forced fresh 的结构化日志

**检查点**: 用户故事 4 完成后，用户和运维都能无歧义地解释“这条 run 为什么以当前 sandbox mode 执行”。

---

## Phase 7：收尾与横切关注点

**目的**: 处理文档、回归和最终验证，确保本功能可独立交付。

- [ ] T032 [P] 更新 `specs/011-workspace-sandbox-mode/quickstart.md`、`specs/011-workspace-sandbox-mode/contracts/codex-sandbox-resolution.md` 和 `specs/011-workspace-sandbox-mode/contracts/feishu-sandbox-mode-commands.md`，同步最终实现语义与本地验证步骤
- [ ] T033 [P] 更新 `docs/architecture.md` 和 `AGENTS.md`，记录工作区 `codexSandboxMode`、`/mode`、mode 变化 fresh 边界和 operator 可见性
- [ ] T034 运行 `bun test`、`bun run lint`、`bunx tsc --noEmit` 和 `git diff --check -- .`，根据结果回修 `specs/011-workspace-sandbox-mode/quickstart.md` 中的最终验证步骤

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（初始化）**: 无依赖，可立即开始
- **Phase 2（基础能力）**: 依赖 Phase 1；阻塞全部用户故事
- **Phase 3（US1）**: 依赖 Phase 2；这是 MVP，建议优先完成
- **Phase 4（US2）**: 依赖 Phase 2；实现上复用基础 resolver 与 override repository
- **Phase 5（US3）**: 依赖 Phase 2，并建议在 US1 / US2 之后实现，因为要复用 continuation 和 override 主链路
- **Phase 6（US4）**: 依赖 Phase 2，并建议在 US1 / US2 完成后推进，以便复用完整的状态与日志输出
- **Phase 7（收尾）**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1（P1）**: 无其他用户故事依赖，是最小可交付闭环
- **US2（P1）**: 依赖基础能力，但应能独立验证 `/mode` 与 `/status`
- **US3（P2）**: 依赖 US1 的 continuation 主链路和 US2 的 override 能力
- **US4（P2）**: 依赖前述用户故事产生的状态与日志，但应能独立验证可见性

### Within Each User Story

- 契约测试与集成测试必须先写，并先看到失败，再实现功能
- runtime config / domain model / repository 先于 gateway / executor / bridge 路径改动
- sandbox mode 必须在 run 入队前解析并冻结
- mode 变化 fresh 边界要在 status / logging 可见性之前实现
- 每个故事完成后都应按 quickstart 中对应步骤做独立验证

### Parallel Opportunities

- Phase 1 中 `T002` 可与 `T001` 并行
- Phase 2 中 `T007`、`T008` 可在 `T003`-`T006` 明确模型后并行推进
- US1 中 `T009`、`T010`、`T011` 可并行
- US2 中 `T016`、`T017`、`T018` 可并行
- US3 中 `T022`、`T023` 可并行；`T024`、`T025`、`T026` 需顺序推进
- US4 中 `T027`、`T028`、`T031` 可并行
- 收尾阶段 `T032`、`T033` 可并行，`T034` 最终收口

---

## Parallel Example：用户故事 1

```bash
# 并行先补测试和默认值解析：
Task: "T009 [US1] 扩展 tests/contract/bridge-codex.contract.test.ts 和 tests/contract/trigger-lifecycle.contract.test.ts"
Task: "T010 [US1] 新增 tests/integration/feishu-sandbox-mode-default.test.ts 和 tests/integration/trigger-sandbox-mode-default.test.ts"
Task: "T011 [US1] 新增 apps/gateway/src/services/sandbox-mode-resolver.ts"
```

## Parallel Example：用户故事 2

```bash
# 并行推进命令侧测试和归一化：
Task: "T016 [US2] 扩展 tests/contract/channel-feishu.contract.test.ts 和 tests/contract/status-command.contract.test.ts"
Task: "T017 [US2] 新增 tests/integration/feishu-sandbox-mode-commands.test.ts"
Task: "T018 [US2] 更新 packages/channel-feishu/src/command-normalization.ts、packages/channel-feishu/src/adapter.ts 和 packages/channel-feishu/src/websocket.ts"
```

## Parallel Example：用户故事 3

```bash
# 并行先写 reset / bind / fresh 边界测试：
Task: "T022 [US3] 扩展 tests/contract/channel-feishu.contract.test.ts 和 tests/contract/feishu-bind-command.contract.test.ts"
Task: "T023 [US3] 扩展 tests/integration/feishu-session-memory-commands.test.ts、tests/integration/feishu-bind-command.test.ts 和 tests/integration/feishu-session-continuation.test.ts"
```

## Parallel Example：用户故事 4

```bash
# 并行补可见性测试和日志：
Task: "T027 [US4] 扩展 tests/contract/status-command.contract.test.ts 和 tests/contract/trigger-visibility.contract.test.ts"
Task: "T028 [US4] 扩展 tests/integration/status-command.test.ts 和 tests/integration/trigger-visibility.test.ts"
Task: "T031 [US4] 更新 packages/core/src/observability/runtime-logger.ts、apps/gateway/src/routes/feishu-webhook.ts 和 apps/executor/src/run-controller.ts"
```

---

## 实施策略

### MVP First（仅交付用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 运行 US1 的契约测试与集成测试，确认三条触发路径都按工作区默认 mode 执行
5. 如需尽快交付，可先上线“工作区默认 sandbox mode”能力，再继续 `/mode`

### Incremental Delivery

1. Setup + Foundational 完成后，先交付 US1，建立默认 sandbox mode 的最小闭环
2. 在 US1 稳定后交付 US2，让 Feishu chat 具备临时 override 能力
3. 再交付 US3，收紧 reset / bind / fresh 边界
4. 最后交付 US4，完善 `/status`、trigger 查询面和日志可见性
5. 每个故事完成后都运行对应 contract / integration 覆盖，再合并到主线

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1 和 Phase 2
2. 基础能力就绪后：
   - 开发者 A：推进 US1 的 resolver 与 trigger/default path
   - 开发者 B：推进 US2 的 `/mode` 命令与 override 存储
   - 开发者 C：推进 US4 的状态与 operator 可见性
3. US3 在 US1 / US2 收敛后统一实现，避免 continuation 与 override 边界反复返工

---

## Notes

- `[P]` 任务表示可以并行，但前提是不共享未完成前置依赖
- 所有触及 Feishu 命令、Codex bridge、scheduler / webhook、run lifecycle 和 operator 可见性的故事都已显式列出 contract / integration 测试
- sandbox mode 只允许在 `gateway` 入队前解析；executor 与 bridge 不得重新决定策略
- 不允许跨 `workspace-write` / `danger-full-access` 直接 resume 同一个底层 Codex session
- scheduled job 与 external webhook 永远只使用工作区默认 sandbox mode，不读取 chat override
- `/new` 与工作区切换都必须清理当前 chat override，避免旧权限静默泄漏到新上下文
