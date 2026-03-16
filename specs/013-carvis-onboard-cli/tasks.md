# 任务清单：Carvis Onboard CLI

**输入**: `/specs/013-carvis-onboard-cli/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`

**测试要求**: 本功能触及本地 runtime 启停、Feishu adapter setup 合同、gateway/executor 启动接缝和 operator 可见性，因此每个用户故事都必须覆盖至少一层 contract 或 integration 测试；对 parser、config writer、state store、doctor 检查器补足 unit 测试。

**组织方式**: 任务按用户故事分组，以支持最小可运行路径优先交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 对应用户故事（`[US1]`、`[US2]`、`[US3]`、`[US4]`）

## Phase 1：初始化（共享夹具与 spec 支撑）

**目的**: 提供 CLI 相关测试夹具和最小包骨架，避免后续故事重复搭环境。

- [ ] T001 新增 `tests/support/carvis-cli-harness.ts`，提供本地 `HOME`、state/log 目录、mock spawn 与 runtime env 夹具
- [ ] T002 [P] 在 `packages/carvis-cli/` 下创建包骨架：`package.json`、`src/bin.ts`、`src/index.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**⚠️ CRITICAL**: 用户故事实现前必须完成

- [ ] T003 新增 `packages/carvis-cli/src/command-parser.ts` 与 `tests/unit/carvis-cli-command-parser.test.ts`，定义 `onboard/start/stop/status/doctor/configure` 命令解析
- [ ] T003A 新增 CLI runtime flags 解析，覆盖 `--json`、`--flow quickstart|manual`、`--yes`
- [ ] T004 新增 `packages/carvis-cli/src/config-writer.ts` 与 `tests/unit/carvis-cli-config-writer.test.ts`，实现 `config.json` / `runtime.env` 写入与默认值推断
- [ ] T005 新增 `packages/carvis-cli/src/state-store.ts` 与 `tests/unit/carvis-cli-state-store.test.ts`，实现 pid/state/log 元数据读写与 stale cleanup
- [ ] T006 新增 `packages/core/src/runtime/local-runtime-state.ts` 并更新 `packages/core/src/index.ts`、`tests/unit/local-runtime-state.test.ts`，提供可选本地 runtime state sink
- [ ] T007 [P] 更新 `apps/gateway/src/index.ts`、`apps/gateway/src/services/runtime-health.ts`、`apps/executor/src/index.ts` 与 `apps/executor/src/services/runtime-readiness.ts`，补充优雅退出信号处理和 CLI 状态文件写入接缝

**检查点**: CLI 基础包、配置写入、本地 state、runtime state sink 和优雅退出接缝都已具备。

---

## Phase 3：用户故事 1 - 首次引导后系统能真正跑起来（优先级：P1）🎯 MVP

**目标**: `carvis onboard` 结束时，系统已生成配置并完成首次启动收敛。

### 用户故事 1 的测试 ⚠️

- [ ] T008 [P] [US1] 新增 `tests/contract/carvis-cli-onboard.contract.test.ts`，覆盖首次引导写配置、已有配置提示和失败短路合同
- [ ] T009 [P] [US1] 新增 `tests/integration/carvis-onboard-cli.test.ts`，覆盖 `onboard -> start` 的最小闭环

### 用户故事 1 的实现

- [ ] T010 [US1] 新增 `tests/contract/feishu-setup.contract.test.ts`，覆盖 setup spec、默认值、错误分类与 probe 合同
- [ ] T011 [US1] 新增 `packages/channel-feishu/src/setup.ts` 并更新 `packages/channel-feishu/src/index.ts`，暴露 Feishu setup spec、输入校验和凭据 probe
- [ ] T012 [US1] 新增 `packages/carvis-cli/src/onboarding.ts`，实现 adapter 选择、Feishu 指引、workspace/default 推断和配置草稿收集
- [ ] T012A [US1] 新增交互式 prompt runtime，使用成熟 prompt 库替代手写 `readline select`
- [ ] T013 [US1] 新增 `packages/carvis-cli/src/process-manager.ts` 与 `tests/unit/carvis-cli-process-manager.test.ts`，实现 gateway 先启动、ready 收敛、再拉 executor 的编排
- [ ] T014 [US1] 更新 `packages/carvis-cli/src/index.ts`，把 `onboard` 与 `start` 串起来，并在失败时回滚已启动进程

**检查点**: 在依赖满足时，`carvis onboard` 能写配置并自动尝试启动本地 runtime。

---

## Phase 4：用户故事 2 - 通过单一 CLI 运维本地 runtime（优先级：P1）

**目标**: `start/stop/status/doctor` 成为稳定的 operator path。

### 用户故事 2 的测试 ⚠️

- [ ] T015 [P] [US2] 新增 `tests/contract/carvis-cli-lifecycle.contract.test.ts`，覆盖 `start/stop/status/doctor` 的稳定输出，以及 `CONFIG_DRIFT`、`CODEX_UNAVAILABLE`、`FEISHU_WS_DISCONNECTED` 等命名失败语义
- [ ] T016 [P] [US2] 新增 `tests/integration/carvis-runtime-lifecycle.test.ts`，覆盖重复启动、stale state 清理、部分失败回滚、安全停止，以及 CLI 介入下既有 runtime lifecycle / queue-lock 语义不变

### 用户故事 2 的实现

- [ ] T017 [US2] 新增 `packages/carvis-cli/src/status.ts` 与 `tests/unit/carvis-cli-status.test.ts`，聚合 `gateway /healthz`、executor state 和本地 process state
- [ ] T018 [US2] 新增 `packages/carvis-cli/src/doctor.ts` 与 `tests/unit/carvis-cli-doctor.test.ts`，复用 `loadRuntimeConfig()`、Codex healthcheck、Feishu probe、连接检查与 healthz
- [ ] T019 [US2] 更新 `packages/carvis-cli/src/process-manager.ts`，实现 `stop` 顺序、超时处理、残留清理与运行中保护
- [ ] T020 [US2] 更新 `packages/carvis-cli/src/index.ts` 与 `packages/carvis-cli/src/bin.ts`，把 `start/stop/status/doctor` 完整暴露为用户命令
- [ ] T020A [US2] 默认输出切换为人类可读格式，仅在 `--json` 时输出结构化结果

**检查点**: 操作者可以只通过 CLI 管理本地 runtime，而不必分别手动操作两个进程。

---

## Phase 5：用户故事 3 - 飞书接入项有明确获取与校验指引（优先级：P2）

**目标**: 飞书配置项与凭据校验由 adapter-owned setup 模块统一提供。

### 用户故事 3 的测试 ⚠️

- [ ] T021 [P] [US3] 扩展 `tests/contract/feishu-setup.contract.test.ts`，覆盖字段说明、默认值、字段级按需提示、完整步骤引导、`allowFrom/chat_id` 指引和 probe 错误分类
- [ ] T022 [P] [US3] 扩展 `tests/integration/carvis-onboard-feishu-guidance.test.ts` 并补 `tests/unit/carvis-cli-configure.test.ts`，覆盖 `onboard/configure` 默认字段级提示、取消前置帮助提问，以及错误凭据提前失败与正确凭据通过探测

### 用户故事 3 的实现

- [ ] T023 [US3] 更新 `packages/channel-feishu/src/setup.ts`，在保留 adapter-owned 完整引导模型的同时补充字段级 `promptHint` / `promptHelpTitle`
- [ ] T024 [US3] 更新 `packages/carvis-cli/src/onboarding.ts`、`packages/carvis-cli/src/configure.ts` 与 `packages/carvis-cli/src/doctor.ts`，统一使用 `channel-feishu` 暴露的 setup/doctor 接口，并把默认展示收敛为字段级按需提示

**检查点**: 飞书所需配置和校验逻辑不再散落在 CLI 本体中。

---

## Phase 6：用户故事 4 - 已有配置可被复用而不是被粗暴覆盖（优先级：P2）

**目标**: `onboard` 和 `start` 能处理已有配置、stale state 和重复启动，并支持 `configure` 做局部重配。

### 用户故事 4 的测试 ⚠️

- [ ] T025 [P] [US4] 扩展 `tests/contract/carvis-cli-onboard.contract.test.ts`、`tests/contract/carvis-cli-lifecycle.contract.test.ts` 并新增 `tests/contract/carvis-cli-configure.contract.test.ts`，覆盖已有配置复用、取消重配、stale state 恢复和 `configure feishu|workspace` 合同
- [ ] T026 [P] [US4] 扩展 `tests/integration/carvis-runtime-lifecycle.test.ts` 并新增 `tests/integration/carvis-configure-cli.test.ts`，覆盖残留 pid/state、部分进程已退出、重复 `onboard` 和局部重配

### 用户故事 4 的实现

- [ ] T027 [US4] 更新 `packages/carvis-cli/src/onboarding.ts`，在已有配置场景提供复用/修改/中止分支
- [ ] T028 [US4] 更新 `packages/carvis-cli/src/process-manager.ts` 与 `packages/carvis-cli/src/state-store.ts`，实现 stale state 检测、重复启动保护和部分进程恢复策略
- [ ] T029 [US4] 新增 `packages/carvis-cli/src/configure.ts` 与 `tests/unit/carvis-cli-configure.test.ts`，实现 `configure feishu` 与 `configure workspace`
- [ ] T029A [US4] `configure` 默认以交互式 section editor 运行
- [ ] T030 [US4] 更新 `packages/carvis-cli/src/index.ts` 与 `packages/carvis-cli/src/config-writer.ts`，把 `configure` 暴露为用户命令并接入现有配置写入流程

**检查点**: 本地 CLI 能稳定处理长期运维中的配置复用和残留状态。

---

## Phase 7：收尾与文档

- [ ] T031 [P] 更新 `specs/002-local-runtime-wiring/quickstart.md`，把手工启动说明切换为 `carvis onboard/start/stop/status/doctor`
- [ ] T032 [P] 新增 `docs/runbooks/local-runtime-cli.md`，记录 `onboard/start/stop/status/doctor`、stale state、命名失败模式与部分失败回滚排障
- [ ] T033 [P] 更新 `docs/architecture.md` 与 `AGENTS.md`，记录新 CLI、adapter-owned setup 模块、本地 state sink 和优雅退出语义
- [ ] T034 运行 `bun run lint`、`bun test`、`git diff --check -- .`，并据此回修文档与 CLI 行为

## 依赖与执行顺序

### Phase Dependencies

- Phase 1：无依赖
- Phase 2：依赖 Phase 1；阻塞全部用户故事
- Phase 3：依赖 Phase 2；这是 MVP
- Phase 4：依赖 Phase 2，并建议在 US1 基础上推进
- Phase 5：依赖 Phase 2；可与 US2 并行
- Phase 6：依赖 US1/US2 的配置与状态主链路
- Phase 7：依赖所有目标用户故事完成

### User Story Dependencies

- **US1（P1）**: 可在 Phase 2 完成后独立开始，是 MVP 主路径
- **US2（P1）**: 可在 Phase 2 完成后开始，但最好复用 US1 已形成的 process manager 与 state 主链路
- **US3（P2）**: 依赖 US1 的 onboarding 主链路和 US2 的 doctor/status 主链路
- **US4（P2）**: 依赖 US1/US2 的已有配置与本地 state 主链路

### Within Each User Story

- 触及 adapter contract、runtime lifecycle、health/readiness 的故事，必须先写 contract/integration 测试并先看到失败
- config/state/model 相关代码先于 orchestration 逻辑
- orchestration 逻辑先于命令对外暴露
- 每个故事完成后都必须能独立验证，再进入下一优先级

### Parallel Opportunities

- `T002` 可与 `T001` 并行
- `T006` 可与 `T003`-`T005` 并行
- `T008` 与 `T009` 可并行
- `T015` 与 `T016` 可并行
- `T021` 与 `T022` 可并行
- `T029` 与 `T030` 可并行
- `T031`、`T032`、`T033` 可并行

## Parallel Example：用户故事 1

```bash
Task: "T008 [US1] 新增 tests/contract/carvis-cli-onboard.contract.test.ts"
Task: "T009 [US1] 新增 tests/integration/carvis-onboard-cli.test.ts"
Task: "T010 [US1] 新增 tests/contract/feishu-setup.contract.test.ts"
```

## Parallel Example：用户故事 2

```bash
Task: "T015 [US2] 新增 tests/contract/carvis-cli-lifecycle.contract.test.ts"
Task: "T016 [US2] 新增 tests/integration/carvis-runtime-lifecycle.test.ts"
Task: "T017 [US2] 新增 packages/carvis-cli/src/status.ts 与 tests/unit/carvis-cli-status.test.ts"
```

## Parallel Example：用户故事 3

```bash
Task: "T021 [US3] 扩展 tests/contract/feishu-setup.contract.test.ts"
Task: "T022 [US3] 新增 tests/integration/carvis-onboard-feishu-guidance.test.ts"
```

## Parallel Example：用户故事 4

```bash
Task: "T025 [US4] 扩展 tests/contract/carvis-cli-onboard.contract.test.ts 与 tests/contract/carvis-cli-lifecycle.contract.test.ts"
Task: "T026 [US4] 扩展 tests/integration/carvis-runtime-lifecycle.test.ts"
Task: "T029 [US4] 新增 packages/carvis-cli/src/configure.ts 与 tests/unit/carvis-cli-configure.test.ts"
```

## 实施策略

### MVP First（仅交付用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 停下来验证 `carvis onboard -> start` 最小闭环

### Incremental Delivery

1. Setup + Foundational 完成后，先交付 US1
2. 在 US1 稳定后交付 US2，建立完整 operator path
3. 再补 US3，把飞书引导和 probe 打磨到 adapter-owned contract
4. 最后补 US4，处理已有配置、重复启动、stale state 和 `configure` 分段重配

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1/2
2. 基础能力就绪后：
   - 开发者 A：推进 US1
   - 开发者 B：推进 US2
   - 开发者 C：推进 US3
3. US4 在主链路稳定后统一推进，避免反复改 process manager、state store 和 config writer
