# 任务清单：Carvis 托管式本地部署

**输入**: `/specs/016-daemon-deployment/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`

**测试要求**: 本功能触及 CLI 生命周期契约、daemon supervision、local runtime readiness、`CONFIG_DRIFT`、operator-visible 状态、兼容命令迁移和卸载/修复路径，因此每个用户故事都必须包含契约测试与集成测试；对本地状态模型、平台 service manager 适配和输出聚合补充必要单元测试。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现、独立验证和增量交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 对应用户故事（`[US1]`、`[US2]`、`[US3]`）
- 每条任务都包含精确文件路径

## Phase 1：初始化（共享脚手架与测试支撑）

**目的**: 为托管式本地部署补齐新的 daemon app、平台 service manager 适配点和 bundle/安装测试夹具。

- [ ] T001 新增 `apps/daemon/package.json`、`apps/daemon/bin/carvis-daemon.cjs`、`apps/daemon/src/index.ts` 和 `apps/daemon/src/bootstrap.ts`，建立用户级 daemon app 的最小工程骨架
- [ ] T002 [P] 新增 `packages/carvis-cli/src/platform-service-manager.ts`、`packages/carvis-cli/src/install-layout.ts` 和 `packages/carvis-cli/src/daemon-client.ts`，建立平台 service manager、安装目录解析和控制 socket client 的共享入口
- [ ] T003 [P] 新增 `tests/support/carvis-daemon-harness.ts` 并扩展 `tests/support/carvis-cli-harness.ts`，提供 bundle layout、service manager stub、socket RPC 和 layered state fixture

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立安装 manifest、infra/runtime/daemon 状态模型、CLI 命令骨架和分层输出基础；本阶段完成前不得开始任何用户故事实现。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 更新 `packages/core/src/domain/models.ts`、`packages/core/src/domain/runtime-models.ts`、`packages/core/src/domain/index.ts` 和 `packages/core/src/index.ts`，新增 `ManagedInstallManifest`、`ManagedInfraComponentState`、`DaemonServiceState`、`LayeredStatusSnapshot`、`LayeredDoctorReport`、`DaemonControlRequest` 和 `LocalUninstallScope`
- [ ] T005 更新 `packages/core/src/runtime/local-runtime-state.ts`、`packages/core/src/observability/runtime-logger.ts` 和 `packages/core/src/storage/repositories.ts`，补齐 install/infra/daemon/runtime 分层状态快照、错误码和推荐动作的本地持久化读写
- [ ] T006 新增 `packages/carvis-cli/src/install.ts`、`packages/carvis-cli/src/daemon-command.ts`、`packages/carvis-cli/src/infra-command.ts` 和 `packages/carvis-cli/src/uninstall.ts`，建立 `install`、`daemon`、`infra`、`uninstall` 的 service 层骨架
- [ ] T007 更新 `packages/carvis-cli/src/command-parser.ts`、`packages/carvis-cli/src/index.ts` 和 `packages/carvis-cli/src/output.ts`，接入新的命令树、JSON 输出骨架和旧 `start` / `stop` / `status` 兼容分发入口
- [ ] T008 [P] 新增 `tests/unit/carvis-daemon-state.test.ts`、`tests/unit/carvis-cli-install-layout.test.ts` 和 `tests/unit/carvis-cli-platform-service-manager.test.ts`，覆盖分层状态模型、安装目录解析和平台适配器基础行为
- [ ] T009 [P] 更新 `tests/unit/carvis-cli-command-parser.test.ts` 和 `tests/unit/carvis-cli-output.test.ts`，覆盖新命令面、兼容入口和分层 JSON/human 输出基线
- [ ] T010 [P] 新增 `tests/contract/managed-runtime-lifecycle.contract.test.ts` 和 `tests/integration/managed-runtime-lifecycle-regression.test.ts`，显式回归验证 queue FIFO、workspace lock、cancel、timeout、heartbeat 和 delivery retry 在 daemon 托管后保持不变

**检查点**: 新的领域模型、CLI 命令骨架、状态快照和测试夹具已就绪，可以开始推进用户故事。

---

## Phase 3：用户故事 1 - 首次安装后即进入低心智负担可用状态（优先级：P1）🎯 MVP

**目标**: 新用户只自备 `Codex CLI` 和飞书凭据，即可通过 `carvis install` + `carvis onboard` 完成本机 bundle 安装、daemon 注册、自启动准备和首次实例收敛。

**独立验证方式**: 在未安装环境中执行 `carvis install` 与 `carvis onboard`，确认 bundle、service definition、Docker-managed Postgres/Redis、daemon 和 runtime 都能进入明确 ready/degraded/failed 结论。

### 用户故事 1 的测试 ⚠️

- [ ] T011 [P] [US1] 更新 `tests/contract/carvis-cli-lifecycle.contract.test.ts` 和 `tests/contract/carvis-cli-onboard.contract.test.ts`，验证 `carvis install`、`carvis install --repair` 与 `carvis onboard` 的输入输出契约、幂等语义和失败归因
- [ ] T012 [P] [US1] 新增 `tests/contract/carvis-daemon-supervision.contract.test.ts`，验证 daemon 作为唯一 OS user service 入口、控制 socket 和自启动恢复契约
- [ ] T013 [P] [US1] 新增 `tests/integration/carvis-managed-install.test.ts` 和 `tests/integration/carvis-daemon-autostart.test.ts`，覆盖首次安装、首次引导、daemon reconcile、自启动恢复和 runtime 收敛闭环

### 用户故事 1 的实现

- [ ] T014 [P] [US1] 新增 `scripts/release/build-runtime-bundle.mjs` 和 `scripts/release/manifest-template.json`，实现版本化 bundle 目录、checksum/manifest 生成和 active version 布局
- [ ] T015 [US1] 更新 `packages/carvis-cli/src/install.ts`、`packages/carvis-cli/src/install-layout.ts` 和 `packages/carvis-cli/src/platform-service-manager.ts`，实现 `carvis install` 的 bundle 安装、目录初始化、service definition 写入与启用逻辑
- [ ] T016 [US1] 更新 `packages/carvis-cli/src/onboarding.ts`、`packages/carvis-cli/src/config-writer.ts` 和 `packages/carvis-cli/src/daemon-client.ts`，让 `carvis onboard` 在写入配置后检查 `codex` / 飞书凭据并请求 daemon 首次 reconcile
- [ ] T017 [US1] 实现 `apps/daemon/src/bootstrap.ts`、`apps/daemon/src/index.ts`、`apps/daemon/src/supervisor.ts` 和 `apps/daemon/src/reconcile.ts`，完成 active manifest 加载、通过 Docker Compose 拉起 Postgres/Redis/`gateway`/`executor` 子进程、健康检查和状态快照刷新
- [ ] T018 [US1] 更新 `apps/gateway/src/services/runtime-health.ts`、`apps/executor/src/services/runtime-readiness.ts` 和 `packages/core/src/runtime/local-runtime-state.ts`，让 supervised 启动路径继续输出既有 readiness、startupReport 和 `CONFIG_DRIFT` 语义

**检查点**: 用户故事 1 完成后，首次安装与首次引导已形成最小闭环，且主机重启或用户重新登录后能够自动恢复或明确失败。

---

## Phase 4：用户故事 2 - 用分层命令管理本地基础设施与运行时（优先级：P1）

**目标**: 操作者可以使用 `carvis infra ...`、`carvis daemon ...`、`carvis status` 和 `carvis doctor` 清晰区分安装层、基础设施层、外部依赖层、daemon 层和 runtime 层，并执行受控运维动作。

**独立验证方式**: 在已安装环境中分别制造 infra down、daemon running/runtime degraded、外部依赖失败和 `CONFIG_DRIFT` 场景，确认状态与诊断输出都能正确归因并返回建议动作。

### 用户故事 2 的测试 ⚠️

- [ ] T019 [P] [US2] 更新 `tests/contract/runtime-health.contract.test.ts`、`tests/contract/status-command.contract.test.ts` 和 `tests/contract/carvis-cli-lifecycle.contract.test.ts`，验证分层 status/doctor、`carvis infra ...`、`carvis daemon ...`、兼容入口以及 daemon socket 不可达 fallback 的稳定契约
- [ ] T020 [P] [US2] 新增 `tests/integration/carvis-layered-status.test.ts` 和 `tests/integration/carvis-infra-lifecycle.test.ts`，覆盖 infra unavailable、daemon running/runtime not ready、external dependency failed、`CONFIG_DRIFT` 和 daemon socket 不可达时的分层可见性

### 用户故事 2 的实现

- [ ] T021 [P] [US2] 新增 `apps/daemon/src/infra-manager.ts` 和 `apps/daemon/src/process-supervisor.ts`，实现 Docker Compose 托管的 Postgres/Redis 的启停、健康检查、受控重启和独立于 runtime 的状态聚合
- [ ] T022 [US2] 更新 `packages/carvis-cli/src/daemon-command.ts`、`packages/carvis-cli/src/infra-command.ts` 和 `packages/carvis-cli/src/daemon-client.ts`，实现 `daemon status/start/stop/restart`、`infra status/start/stop/restart/rebuild` 和 socket 不可达时的控制面降级
- [ ] T023 [US2] 更新 `packages/carvis-cli/src/status.ts`、`packages/carvis-cli/src/doctor.ts`、`packages/carvis-cli/src/output.ts` 和 `packages/carvis-cli/src/daemon-client.ts`，实现安装层、基础设施层、外部依赖层、daemon 层和 runtime 层的统一聚合，以及 daemon 不可达时基于持久化快照 + direct probe 的 fallback 输出
- [ ] T024 [US2] 更新 `apps/gateway/src/commands/status.ts`、`apps/gateway/src/services/status-presenter.ts` 和 `apps/gateway/src/services/trigger-status-presenter.ts`，补齐 runtime 侧的 drift、readiness 和 operator-visible 错误投影，避免 daemon running 被误报为整体 ready
- [ ] T025 [US2] 更新 `packages/carvis-cli/src/index.ts`、`packages/carvis-cli/src/process-manager.ts` 和 `packages/carvis-cli/src/status.ts`，把旧 `start` / `stop` / `status` 迁移为 `daemon` 子命令兼容壳层并输出明确迁移结果

**检查点**: 用户故事 2 完成后，操作者已能不用看宿主机脚本，就区分 install/infra/external/daemon/runtime 五层并执行稳定运维操作。

---

## Phase 5：用户故事 3 - 既有安装可以修复和安全卸载（优先级：P2）

**目标**: 已安装环境可以通过 `carvis install --repair`、`carvis daemon restart`、`carvis uninstall` 和 `carvis uninstall --purge` 完成漂移修复、重建和安全卸载，且默认保留数据。

**独立验证方式**: 模拟 manifest 漂移、service definition 缺失、陈旧 state/pid、配置变更未重载和卸载场景，确认 repair/restart/uninstall 都能给出明确且保守的结果。

### 用户故事 3 的测试 ⚠️

- [ ] T026 [P] [US3] 更新 `tests/contract/carvis-cli-lifecycle.contract.test.ts` 和 `tests/contract/status-command.contract.test.ts`，验证 `install --repair`、`uninstall`、`uninstall --purge`、配置漂移提示和默认保留数据契约
- [ ] T027 [P] [US3] 新增 `tests/integration/carvis-repair-recovery.test.ts` 和 `tests/integration/carvis-uninstall.test.ts`，覆盖 bundle/service drift 修复、陈旧 state 清理、daemon restart 后收敛和默认卸载/显式 purge 闭环

### 用户故事 3 的实现

- [ ] T028 [P] [US3] 更新 `packages/carvis-cli/src/install.ts`、`packages/carvis-cli/src/install-layout.ts` 和 `packages/carvis-cli/src/state-store.ts`，实现 repair 时的 manifest 对齐、陈旧 state/pid 清理和 bundle/service definition 修复
- [ ] T029 [US3] 更新 `apps/daemon/src/reconcile.ts`、`apps/daemon/src/process-supervisor.ts` 和 `packages/core/src/observability/runtime-logger.ts`，在配置变更未重载、组件异常退出和 repair 后 restart 场景下输出明确 drift/recovery 原因
- [ ] T030 [US3] 更新 `packages/carvis-cli/src/uninstall.ts`、`packages/carvis-cli/src/output.ts` 和 `packages/carvis-cli/src/platform-service-manager.ts`，实现默认卸载保留数据、`--purge` 显式删除数据目录与范围提示
- [ ] T031 [US3] 更新 `packages/carvis-cli/src/doctor.ts` 和 `packages/carvis-cli/src/status.ts`，在 repair/uninstall 前后统一展示建议动作、保留范围和已清理范围

**检查点**: 用户故事 3 完成后，repair、restart、默认卸载和显式 purge 都已可独立验证，且默认行为不会误删持久化数据。

---

## Phase 6：收尾与横切关注点

**目的**: 处理文档、架构说明和最终回归，确保托管式本地部署可独立交付。

- [ ] T032 [P] 更新 `specs/016-daemon-deployment/quickstart.md`、`specs/016-daemon-deployment/contracts/carvis-managed-lifecycle-cli.md`、`specs/016-daemon-deployment/contracts/carvis-daemon-supervision.md` 和 `specs/016-daemon-deployment/contracts/carvis-layered-status-and-doctor.md`，同步最终命令语义、失败层级、daemon fallback 和验证步骤
- [ ] T033 [P] 更新 `docs/architecture.md`、`docs/runbooks/local-managed-deployment.md` 和 `AGENTS.md`，记录 `apps/daemon`、版本化 bundle、平台 service manager、自启动恢复、分层状态、daemon 不可达 fallback 与默认保留卸载策略
- [ ] T034 运行 `bun test`、`bun run lint`、`bun run --filter @carvis/carvis-cli carvis install --json`、`bun run --filter @carvis/carvis-cli carvis doctor --json` 和 `git diff --check -- .`，根据结果回修 `specs/016-daemon-deployment/quickstart.md` 中的最终验证步骤

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（初始化）**: 无依赖，可立即开始
- **Phase 2（基础能力）**: 依赖 Phase 1；阻塞全部用户故事
- **Phase 3（US1）**: 依赖 Phase 2；这是 MVP，建议最先完成
- **Phase 4（US2）**: 依赖 Phase 2，并建议在 US1 的 daemon/install 闭环就绪后推进
- **Phase 5（US3）**: 依赖 Phase 2，并建议在 US1/US2 的 install、status、daemon 命令主链稳定后实现
- **Phase 6（收尾）**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1（P1）**: 无其他用户故事依赖，是最小可交付闭环
- **US2（P1）**: 依赖基础能力和 US1 的 daemon/install 主链，但应能独立验证 status/doctor/infra/daemon 命令
- **US3（P2）**: 依赖 US1 的安装闭环和 US2 的分层状态聚合，才能可靠实现 repair/uninstall

### Within Each User Story

- 契约测试与集成测试必须先写，并先看到失败，再实现功能
- 安装 manifest / 本地状态模型 / 控制协议先于 CLI 命令细节
- daemon supervision 先于分层 status/doctor
- repair / uninstall 依赖 install、daemon、infra 主链已经稳定
- 每个故事完成后都应按 `quickstart.md` 中对应步骤做独立验证

### Parallel Opportunities

- Phase 1 中 `T002`、`T003` 可并行
- Phase 2 中 `T008`、`T009`、`T010` 可在 `T004`-`T007` 的模型与骨架确定后并行推进
- US1 中 `T011`、`T012`、`T013` 可并行；`T014` 可与测试并行
- US2 中 `T019`、`T020`、`T021` 可并行
- US3 中 `T026`、`T027`、`T028` 可并行
- 收尾阶段 `T032`、`T033` 可并行，`T034` 最终收口

---

## Parallel Example：用户故事 1

```bash
# 并行先补 install/onboard/daemon 的测试与 bundle 脚本：
Task: "T011 [US1] 更新 tests/contract/carvis-cli-lifecycle.contract.test.ts 和 tests/contract/carvis-cli-onboard.contract.test.ts"
Task: "T012 [US1] 新增 tests/contract/carvis-daemon-supervision.contract.test.ts"
Task: "T013 [US1] 新增 tests/integration/carvis-managed-install.test.ts 和 tests/integration/carvis-daemon-autostart.test.ts"
Task: "T014 [US1] 新增 scripts/release/build-runtime-bundle.mjs 和 scripts/release/manifest-template.json"
```

## Parallel Example：用户故事 2

```bash
# 并行推进分层状态测试和 infra supervision：
Task: "T019 [US2] 更新 tests/contract/runtime-health.contract.test.ts、tests/contract/status-command.contract.test.ts 和 tests/contract/carvis-cli-lifecycle.contract.test.ts"
Task: "T020 [US2] 新增 tests/integration/carvis-layered-status.test.ts 和 tests/integration/carvis-infra-lifecycle.test.ts"
Task: "T021 [US2] 新增 apps/daemon/src/infra-manager.ts 和 apps/daemon/src/process-supervisor.ts"
```

## Parallel Example：用户故事 3

```bash
# 并行先写 repair/uninstall 测试并补 repair 基础：
Task: "T026 [US3] 更新 tests/contract/carvis-cli-lifecycle.contract.test.ts 和 tests/contract/status-command.contract.test.ts"
Task: "T027 [US3] 新增 tests/integration/carvis-repair-recovery.test.ts 和 tests/integration/carvis-uninstall.test.ts"
Task: "T028 [US3] 更新 packages/carvis-cli/src/install.ts、packages/carvis-cli/src/install-layout.ts 和 packages/carvis-cli/src/state-store.ts"
```

---

## 实施策略

### MVP First（仅交付用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 运行 US1 的 contract / integration 覆盖，验证首次安装、首次引导和自启动恢复
5. 如需尽快交付，可先上线 `install + onboard + daemon` 的最小闭环

### Incremental Delivery

1. 先完成 Setup + Foundational，稳定 daemon、bundle 和状态模型
2. 交付 US1，建立首次安装和首次引导闭环
3. 交付 US2，完善分层运维命令、daemon fallback 和 operator 可见性
4. 交付 US3，补齐 repair、restart、uninstall 和 purge 路径
5. 每个故事完成后都运行对应 contract / integration 覆盖，再继续下一个故事

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1 和 Phase 2
2. 基础能力就绪后：
   - 开发者 A：推进 US1 的 bundle/install/onboard/daemon 主链
   - 开发者 B：推进 US2 的 infra supervision、status/doctor 聚合和兼容命令迁移
   - 开发者 C：推进 US3 的 repair/uninstall 测试与保留数据策略
3. 最后统一做文档、runbook 和全量回归

---

## Notes

- `[P]` 任务表示可并行，但前提是不共享未完成前置依赖
- 所有触及 CLI 生命周期、daemon supervision、runtime readiness、`CONFIG_DRIFT` 和 operator 可见性的故事都已显式列出 contract / integration 测试
- `apps/daemon` 只能做本地托管与监督，不得吸收 Feishu 或 Codex 专有控制流
- Postgres 必须继续是 durable state，Redis 必须继续是 coordination only；部署层改动不得引入新的业务事实来源
- 引入 daemon 后，`gateway` / `executor` 的 queue、lock、cancel、timeout、heartbeat 和 delivery retry 语义不得回归
- 默认卸载必须保留数据，只有显式 `--purge` 才删除持久化目录和历史状态
