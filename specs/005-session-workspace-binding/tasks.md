# 任务清单：飞书会话工作区绑定

**输入**: `/specs/005-session-workspace-binding/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`

**测试要求**: 本功能触及 Feishu 适配器、gateway ingress、queueing 决策、`/status`、`/new`、`/bind` 和运行生命周期语义，因此每个用户故事都必须包含契约测试与集成测试；对 workspace 解析与创建逻辑补充必要单元测试。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 对应用户故事（`[US1]`、`[US2]`、`[US3]`）
- 每条任务都包含明确文件路径

## Phase 1：初始化（共享测试与配置脚手架）

**目的**: 为 workspace 绑定功能准备统一的配置夹具和会话测试工具。

- [X] T001 扩展 runtime 配置夹具以支持 `agent.defaultWorkspace`、`workspaceResolver.registry`、`workspaceResolver.chatBindings`、`workspaceResolver.managedWorkspaceRoot` 和 `workspaceResolver.templatePath`，并让默认私聊 workspace 指向托管目录 in `tests/support/runtime-harness.ts`
- [X] T002 [P] 扩展 Feishu 测试 harness 以支持 private/group `chat`、session 级 workspace 断言和最小可工作 template 目录夹具 in `tests/support/harness.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立 session 级 workspace 绑定层、catalog 持久化和 gateway 共享服务抽象。

**⚠️ CRITICAL**: 在本阶段完成前不要开始任何用户故事实现。

- [X] T003 更新 workspace 绑定领域模型、命令类型、状态快照和未来 hint 扩展点 in `packages/core/src/domain/models.ts`
- [X] T004 [P] 更新 runtime config / agent config 模型、schema 校验和 fingerprint 输入以支持 `defaultWorkspace` 与 `workspaceResolver` in `packages/core/src/domain/runtime-models.ts`, `packages/core/src/config/runtime-config.ts`, `packages/core/src/config/agent-config.ts`
- [X] T005 新增 session workspace bindings 与 workspace catalog 的持久化 schema in `packages/core/src/storage/migrations/005_session_workspace_bindings.sql`
- [X] T006 实现 `SessionWorkspaceBindingRepository`、`WorkspaceCatalogRepository` 及其内存/Postgres 实现 in `packages/core/src/storage/repositories.ts`
- [X] T007 [P] 为新配置和仓储能力补充单元测试 in `tests/unit/runtime-config.test.ts`, `tests/unit/postgres-repositories.test.ts`
- [X] T008 创建共享的 workspace 解析与 template 创建服务抽象 in `apps/gateway/src/services/workspace-resolver.ts`, `apps/gateway/src/services/workspace-provisioner.ts`
- [X] T009 将 workspace 解析/创建服务接入 gateway runtime wiring in `apps/gateway/src/bootstrap.ts`, `packages/core/src/runtime/runtime-factory.ts`

**检查点**: core、配置、持久化和 gateway 共享服务已就绪，用户故事可以开始推进。

---

## Phase 3：用户故事 1 - 默认解析工作区（优先级：P1）🎯 MVP

**目标**: 让私聊默认落到 `defaultWorkspace`，让群聊在 `manual/config/unbound` 三种状态下走正确的普通消息路径。

**独立验证方式**: 在一个新私聊和两个新群聊中分别发送普通消息，验证 private 默认执行、group 未绑定拒绝、group 静态映射执行。

### 用户故事 1 的测试 ⚠️

- [X] T010 [P] [US1] 新增私聊默认解析与群聊未绑定/静态映射契约测试 in `tests/contract/feishu-workspace-routing.contract.test.ts`
- [X] T011 [P] [US1] 新增 private default 与 group unbound/config 路由集成测试 in `tests/integration/feishu-workspace-routing.test.ts`

### 用户故事 1 的实现

- [X] T012 [P] [US1] 扩展 Feishu webhook / websocket 入站归一化以输出 `chatType` 和预留 hint 字段 in `packages/channel-feishu/src/adapter.ts`, `packages/channel-feishu/src/websocket.ts`
- [X] T013 [US1] 实现普通消息的 workspace 解析、binding 写入和 `unbound` onboarding 提示 in `apps/gateway/src/services/workspace-resolver.ts`
- [X] T014 [US1] 将 webhook 普通消息路径切换到 resolved workspace queueing，并在未绑定时直接返回提示 in `apps/gateway/src/routes/feishu-webhook.ts`
- [X] T015 [US1] 将 websocket ingress 普通消息路径切换到 resolved workspace queueing，并在未绑定时直接返回提示 in `apps/gateway/src/bootstrap.ts`
- [X] T016 [US1] 扩展 operator-visible 日志和投递记录，标记 `default` / `config` / `unbound` 解析结果 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/routes/feishu-webhook.ts`, `apps/gateway/src/bootstrap.ts`

**检查点**: 私聊可直接运行，未绑定群聊不创建 run，静态映射群聊可正常执行。

---

## Phase 4：用户故事 2 - 绑定或创建工作区（优先级：P1）

**目标**: 让用户通过 `/bind <workspace-key>` 绑定已有 workspace，或按默认 template 创建并绑定新 workspace。

**独立验证方式**: 在群聊中分别执行 `/bind ops`、`/bind feature-a`、缺少 template 的 `/bind feature-b`，并验证 active run 期间拒绝切换。

### 用户故事 2 的测试 ⚠️

- [X] T017 [P] [US2] 新增 `/bind` 已有/创建/拒绝切换的契约测试 in `tests/contract/feishu-bind-command.contract.test.ts`
- [X] T018 [P] [US2] 新增 `/bind` 绑定已有、按 template 创建、template 失败、托管根目录无权限和手动覆盖映射的集成测试 in `tests/integration/feishu-bind-command.test.ts`

### 用户故事 2 的实现

- [X] T019 [P] [US2] 扩展 Feishu webhook / websocket 命令解析以支持 `/bind <workspace-key>` in `packages/channel-feishu/src/adapter.ts`, `packages/channel-feishu/src/websocket.ts`
- [X] T020 [US2] 实现基于默认 template 的 workspace 创建、catalog 注册、托管根目录权限失败处理和全局唯一校验 in `apps/gateway/src/services/workspace-provisioner.ts`
- [X] T021 [US2] 实现 `/bind` 命令处理、幂等提示、active-run 保护和手动覆盖持久化 in `apps/gateway/src/commands/bind.ts`
- [X] T022 [US2] 将 `/bind` 接入 webhook / websocket 命令路由，并复用现有 notifier 投递结果 in `apps/gateway/src/routes/feishu-webhook.ts`, `apps/gateway/src/bootstrap.ts`
- [X] T023 [US2] 扩展 `/bind` 成功、创建失败、权限拒绝和切换拒绝的结构化日志与用户提示 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/commands/bind.ts`

**检查点**: 用户可以在群聊中一次命令完成绑定或创建，且活动运行期间不会发生 workspace 分裂。

---

## Phase 5：用户故事 3 - 查看与保持当前绑定（优先级：P2）

**目标**: 让 `/status` 清晰展示当前 workspace 绑定来源，并保证 `/new` 只重置 continuation 而不影响 workspace 绑定。

**独立验证方式**: 在已绑定 workspace 且已有 continuation 的 session 中执行 `/status`、`/new`，确认 bindingSource 和 workspaceKey 保持不变。

### 用户故事 3 的测试 ⚠️

- [X] T024 [P] [US3] 更新 status 契约测试以覆盖 `workspaceKey`、`bindingSource`、`unbound` 引导和 continuation 并列展示 in `tests/contract/status-command.contract.test.ts`
- [X] T025 [P] [US3] 新增 `/status` 与 `/new` 保持 workspace binding 的集成测试 in `tests/integration/feishu-session-workspace-status.test.ts`

### 用户故事 3 的实现

- [X] T026 [P] [US3] 扩展状态格式化输出以展示 `workspaceKey`、`bindingSource`、`unbound` 提示和 continuation 状态 in `apps/gateway/src/services/status-presenter.ts`
- [X] T027 [US3] 更新 `handleStatusCommand` 以读取 session workspace binding、resolved workspace 队列状态和 continuation 状态 in `apps/gateway/src/commands/status.ts`
- [X] T028 [US3] 更新 `handleNewCommand` 文案与行为边界，确保只重置 continuation 而不改 workspace binding in `apps/gateway/src/commands/new.ts`

**检查点**: `/status` 和 `/new` 的边界清晰可见，用户不会把重置续聊误解为切换工作区。

---

## Phase 6：收尾与横切关注点

**目的**: 补齐跨故事回归、运维文档和最终验证路径。

- [X] T029 [P] 为多 `chat` 共享同一 resolved workspace 的 FIFO 队列语义补充回归测试 in `tests/integration/feishu-shared-workspace.test.ts`
- [X] T030 [P] 为 heartbeat 失效后已绑定 session 的 run 失败与 `/status` 绑定可见性补充集成回归测试 in `tests/integration/run-heartbeat-expiry.test.ts`, `tests/integration/feishu-session-workspace-status.test.ts`
- [X] T031 [P] 为 workspace 解析、template 创建失败和托管根目录权限拒绝补充单元测试 in `tests/unit/workspace-resolution.test.ts`
- [X] T032 更新 operator 验证步骤与本地配置示例，补充权限拒绝与 heartbeat 失效场景 in `specs/005-session-workspace-binding/quickstart.md`, `specs/005-session-workspace-binding/contracts/feishu-workspace-binding.md`

---

## Phase 7：用户故事 4 - 文本命令输入与帮助引导（优先级：P1）

**目标**: 让飞书文本命令在 webhook / websocket 路径上统一识别，并通过 `/help` 和未知 slash 命令提示降低误触发 agent 运行的概率。

**独立验证方式**: 在私聊发送 `/bind ops`，在群聊发送 `@机器人 /bind ops`，同时通过 webhook 与 websocket 验证命令都命中路由；再发送 `/help` 和未知 slash 命令，验证不会进入普通运行链路。

### 用户故事 4 的测试 ⚠️

- [X] T033 [P] [US4] 新增 webhook / websocket 命令归一化一致性与未知 slash 命令契约测试 in `tests/contract/feishu-command-normalization.contract.test.ts`
- [X] T034 [P] [US4] 新增群聊 mention 命令、`/help` 和未知 slash 命令不会触发 run 的集成测试 in `tests/integration/feishu-command-help.test.ts`

### 用户故事 4 的实现

- [X] T035 [US4] 抽取 webhook / websocket 共享的 Feishu 文本命令归一化逻辑，并在 mention 前缀场景下统一识别 `/bind`、`/status`、`/abort`、`/new`、`/help` in `packages/channel-feishu/src/adapter.ts`, `packages/channel-feishu/src/websocket.ts`
- [X] T036 [US4] 新增 `/help` 命令处理与帮助文案，覆盖私聊/群聊推荐输入方式和 workspace onboarding 说明 in `apps/gateway/src/commands/help.ts`, `apps/gateway/src/routes/feishu-webhook.ts`, `apps/gateway/src/bootstrap.ts`
- [X] T037 [US4] 为未知 slash 命令新增明确的帮助提示路由，确保其不会落入普通 prompt 执行 in `packages/core/src/domain/models.ts`, `packages/channel-feishu/src/adapter.ts`, `packages/channel-feishu/src/websocket.ts`, `apps/gateway/src/routes/feishu-webhook.ts`, `apps/gateway/src/bootstrap.ts`
- [X] T038 [US4] 扩展结构化日志，记录命令归一化结果、mention 清洗命中与未知 slash 命令 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/routes/feishu-webhook.ts`, `apps/gateway/src/bootstrap.ts`

---

## Phase 8：托管默认私聊 workspace 与默认 starter template

**目标**: 让默认私聊 workspace 与 `/bind` 新建 workspace 统一落到 `.carvis` 托管目录，并让默认 template 提供一个最小可工作的 starter 骨架。

**独立验证方式**: 使用本地 runtime 配置启动 gateway/executor，验证私聊默认 workspace 路径位于 `managedWorkspaceRoot` 下；执行 `/bind feature-a` 后新目录含 starter 文件，而不是只有占位 README。

- [X] T039 调整 runtime/Feishu 测试夹具，使默认私聊 workspace 指向托管目录，并让 template 夹具包含 README、`.gitignore` 和 workspace 约定文件 in `tests/support/runtime-harness.ts`, `tests/support/harness.ts`
- [X] T040 更新 operator 配置、quickstart 与 contract 文档，使 `defaultWorkspace`、`managedWorkspaceRoot`、`templatePath` 一致收敛到 `.carvis` 托管目录 in `specs/005-session-workspace-binding/spec.md`, `specs/005-session-workspace-binding/plan.md`, `specs/005-session-workspace-binding/quickstart.md`, `specs/005-session-workspace-binding/contracts/feishu-workspace-binding.md`, `/Users/pipi/.carvis/config.json`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1：初始化**: 无依赖，可立即开始
- **Phase 2：基础能力**: 依赖 Phase 1 完成；阻塞所有用户故事
- **Phase 3：US1**: 依赖 Phase 2；这是 MVP，建议最先完成
- **Phase 4：US2**: 依赖 Phase 2，并建议在 US1 的 resolved workspace 普通消息路径完成后推进
- **Phase 5：US3**: 依赖 Phase 2，并建议在 US1 完成后推进；若需要展示 `manual/created` 来源，则以 US2 完成为准
- **Phase 6：收尾**: 依赖所有目标用户故事完成
- **Phase 7：US4**: 依赖 Phase 2，建议在 US1/US2 完成后推进，因为需要复用已有命令路由和 onboarding 文案

### User Story Dependencies

- **US1 (P1)**: 无用户故事级前置依赖，是最小可交付闭环
- **US2 (P1)**: 依赖基础能力；为了验证“绑定后后续普通消息进入目标 workspace”，建议接在 US1 后实现
- **US3 (P2)**: 依赖基础能力；为了完整展示 `bindingSource`，建议在 US1 和 US2 之后完成
- **US4 (P1)**: 依赖基础能力；为了复用 workspace onboarding 与 `/bind` 文案，建议在 US1 和 US2 之后完成

### Within Each User Story

- 先写契约测试和集成测试，并确认其在实现前失败
- 先改 adapter / domain contract，再改 gateway 服务与命令路由
- 先完成核心绑定/解析逻辑，再补 observability 和用户提示
- 每个故事完成后先做独立验证，再进入下一个故事

### Parallel Opportunities

- Phase 1 中 `T002` 可与 `T001` 并行
- Phase 2 中 `T004` 与 `T007` 可在 `T003` 明确类型后分头推进
- US1 中 `T010`、`T011`、`T012` 可并行
- US2 中 `T017`、`T018`、`T019` 可并行
- US3 中 `T024`、`T025`、`T026` 可并行
- 收尾阶段 `T029`、`T030`、`T031`、`T032` 可并行
- US4 中 `T033`、`T034`、`T035` 可并行

---

## Parallel Example：用户故事 1

```bash
# 先并行准备测试与入站归一化
Task: "T010 [US1] 新增私聊默认解析与群聊未绑定/静态映射契约测试 in tests/contract/feishu-workspace-routing.contract.test.ts"
Task: "T011 [US1] 新增 private default 与 group unbound/config 路由集成测试 in tests/integration/feishu-workspace-routing.test.ts"
Task: "T012 [US1] 扩展 Feishu webhook / websocket 入站归一化以输出 chatType 和预留 hint 字段 in packages/channel-feishu/src/adapter.ts, packages/channel-feishu/src/websocket.ts"
```

## Parallel Example：用户故事 2

```bash
# 先并行准备 bind 的测试和命令解析
Task: "T017 [US2] 新增 /bind 已有/创建/拒绝切换的契约测试 in tests/contract/feishu-bind-command.contract.test.ts"
Task: "T018 [US2] 新增 /bind 绑定已有、按 template 创建、template 失败和手动覆盖映射的集成测试 in tests/integration/feishu-bind-command.test.ts"
Task: "T019 [US2] 扩展 Feishu webhook / websocket 命令解析以支持 /bind <workspace-key> in packages/channel-feishu/src/adapter.ts, packages/channel-feishu/src/websocket.ts"
```

## Parallel Example：用户故事 3

```bash
# 先并行准备状态测试和状态渲染
Task: "T024 [US3] 更新 status 契约测试以覆盖 workspaceKey、bindingSource、unbound 引导和 continuation 并列展示 in tests/contract/status-command.contract.test.ts"
Task: "T025 [US3] 新增 /status 与 /new 保持 workspace binding 的集成测试 in tests/integration/feishu-session-workspace-status.test.ts"
Task: "T026 [US3] 扩展状态格式化输出以展示 workspaceKey、bindingSource、unbound 提示和 continuation 状态 in apps/gateway/src/services/status-presenter.ts"
```

---

## 实施策略

### MVP First（仅交付用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 运行 US1 的契约测试与集成测试，确认 private/group 路由闭环成立
5. 如果需要尽快交付，可先上线 private default + group unbound/config mapping

### Incremental Delivery

1. Setup + Foundational 完成后，先交付 US1，建立 chat 级 workspace 解析闭环
2. 在 US1 稳定后交付 US2，让群聊具备自助 `/bind` 能力
3. 最后交付 US3，完善 `/status` 与 `/new` 的可见性和行为边界
4. 每个故事交付后都运行对应 contract / integration 覆盖，再合并到主线

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1 和 Phase 2
2. 基础能力就绪后：
   - 开发者 A：推进 US1 的 routing 和 unbound 提示
   - 开发者 B：推进 US2 的 `/bind` 与 template 创建
   - 开发者 C：推进 US3 的 `/status` 与 `/new`
3. 最后统一完成收尾回归与运维文档

---

## Notes

- [P] 任务表示可以并行，但前提是不共享未完成前置依赖
- 所有涉及 adapter、queueing、run lifecycle 的故事都已经显式列出 contract / integration 测试
- `chat_id -> session` 语义在本任务清单中保持不变；不引入群内 thread/conversation 路由
- `/new` 与 `/bind` 分属不同责任域：前者只影响 continuation，后者只影响 workspace binding
- 收尾前必须验证共享 workspace 的 FIFO 队列语义没有被 workspace 绑定层破坏
