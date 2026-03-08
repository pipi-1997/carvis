# 任务清单：本地运行时接入

**输入**: `/specs/002-local-runtime-wiring/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能涉及 Feishu websocket、健康检查、真实依赖接线、运行生命周期与双进程启动流程，因此契约测试与集成测试均为必需；单元测试按配置和启动逻辑复杂度补充。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 任务所属用户故事（如 US1、US2、US3）
- 每条任务都包含明确文件路径

## Path Conventions

- **Gateway app**: `apps/gateway/src/`
- **Executor app**: `apps/executor/src/`
- **Shared packages**: `packages/<name>/src/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/unit/`

## Phase 1：初始化（共享基础设施）

**目的**: 为真实本地运行时接入准备依赖、配置与启动骨架

- [x] T001 更新根依赖与运行脚本以支持真实本地 runtime 在 `package.json`
- [x] T002 [P] 新增本地运行时配置样例、Feishu `websocket` 说明与路径说明在 `specs/002-local-runtime-wiring/quickstart.md`、`AGENTS.md`
- [x] T003 [P] 建立 runtime 测试辅助与环境变量夹具在 `tests/support/runtime-harness.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 在实现任何用户故事前完成共享 runtime wiring 原语

**⚠️ CRITICAL**: 用户故事开发必须在本阶段完成后开始

- [x] T004 实现本地运行时配置加载与校验，并验证 Feishu `websocket` 必要字段在 `packages/core/src/config/runtime-config.ts`
- [x] T005 [P] 定义 `RuntimeConfig`、`FeishuConnectionConfig`、`GatewayRuntimeState`、`ExecutorRuntimeState`、`RuntimeFingerprint`、`ExecutorStartupReport` 类型在 `packages/core/src/domain/runtime-models.ts`
- [x] T006 [P] 实现 Postgres 与 Redis 真实客户端装配入口在 `packages/core/src/storage/postgres-client.ts`、`packages/core/src/runtime/redis-client.ts`
- [x] T007 [P] 实现包含 runtime fingerprint 的启动期结构化日志与状态快照封装在 `packages/core/src/observability/runtime-logger.ts`
- [x] T008 实现 Feishu `websocket` 凭据加载、runtime client / sender 装配入口在 `packages/channel-feishu/src/runtime-sender.ts`
- [x] T009 实现共享 runtime 依赖容器与 wiring 工厂在 `packages/core/src/runtime/runtime-factory.ts`

**检查点**: 配置、真实依赖入口与 runtime 装配能力就绪，用户故事可以开始

---

## Phase 3：用户故事 1 - 启动本地 gateway（Priority: P1）🎯 MVP

**目标**: 用户能够在本地启动真实 `gateway` 进程，暴露健康检查并建立 Feishu websocket 入站

**独立验证方式**: 准备本地配置与环境变量后启动 `gateway`，访问 `/healthz` 并完成一次真实 websocket 入站事件验证，确认健康状态和入站路由正常

### 用户故事 1 的测试 ⚠️

> 先写测试并确认失败，再实现功能。

- [x] T010 [P] [US1] 编写 `GET /healthz` 契约测试在 `tests/contract/runtime-health.contract.test.ts`
- [x] T035 [P] [US1] 编写 Feishu `websocket` 握手、过滤与归一化契约测试在 `tests/contract/feishu-websocket.contract.test.ts`
- [x] T011 [P] [US1] 编写 `gateway` 启动与配置失败集成测试在 `tests/integration/gateway-startup.test.ts`
- [x] T012 [P] [US1] 编写 Feishu `websocket` 接入 wiring 集成测试在 `tests/integration/gateway-feishu-runtime.test.ts`

### 用户故事 1 的实现

- [x] T013 [P] [US1] 实现包含 Feishu `websocket` 就绪状态与 fingerprint 的 `gateway` 启动状态模型与健康输出组装在 `apps/gateway/src/services/runtime-health.ts`
- [x] T014 [P] [US1] 实现 `gateway` runtime bootstrap 与配置装配在 `apps/gateway/src/bootstrap.ts`
- [x] T015 [US1] 将健康检查与 Feishu readiness 接入 Hono app 在 `apps/gateway/src/app.ts`
- [x] T016 [US1] 将真实 Feishu sender、allowlist 与 `websocket` runtime 配置接入 gateway 在 `apps/gateway/src/index.ts`
- [x] T037 [US1] 在 `packages/channel-feishu/src/` 实现 Feishu `websocket` 入站客户端、allowlist / mention 过滤和 `InboundEnvelope` 归一化
- [x] T017 [US1] 补充包含 Feishu `websocket` 未就绪原因和 fingerprint 的 `gateway` 启动日志在 `apps/gateway/src/index.ts`、`packages/core/src/observability/runtime-logger.ts`

**检查点**: `gateway` 可独立启动、暴露健康状态并接收合法 websocket 入站事件

---

## Phase 4：用户故事 2 - 启动本地 executor（Priority: P1）

**目标**: 用户能够在本地启动真实 `executor` 进程，连接 Postgres / Redis / Codex CLI 并进入消费循环

**独立验证方式**: 准备配置与依赖后启动 `executor`，验证依赖连接结果、消费循环进入和失败路径暴露

### 用户故事 2 的测试 ⚠️

- [x] T018 [P] [US2] 编写 `executor` 启动配置、依赖校验与结构化启动报告集成测试在 `tests/integration/executor-startup.test.ts`
- [x] T019 [P] [US2] 编写 `executor` 消费循环与依赖失败集成测试在 `tests/integration/executor-runtime-loop.test.ts`

### 用户故事 2 的实现

- [x] T020 [P] [US2] 实现 `executor` 启动状态模型、依赖检查器与结构化启动报告组装在 `apps/executor/src/services/runtime-readiness.ts`
- [x] T021 [P] [US2] 实现 `executor` runtime bootstrap 与真实客户端装配在 `apps/executor/src/bootstrap.ts`
- [x] T022 [US2] 将消费循环、poll interval 与依赖校验接入 `executor` 入口在 `apps/executor/src/index.ts`
- [x] T023 [US2] 将真实 Redis / Postgres / Codex readiness 接入 worker wiring 在 `apps/executor/src/worker.ts`、`packages/core/src/runtime/runtime-factory.ts`
- [x] T024 [US2] 补充带 fingerprint 的 `executor` 启动失败、依赖断连和消费状态日志在 `apps/executor/src/index.ts`、`packages/core/src/observability/runtime-logger.ts`

**检查点**: `executor` 可独立启动、明确依赖状态并进入真实消费循环

---

## Phase 5：用户故事 3 - 完成本地真实联调（Priority: P2）

**目标**: 用户能够按 quickstart 完成本地双进程启动，并通过真实飞书完成一次端到端联调

**独立验证方式**: 依 quickstart 启动 `gateway` 与 `executor`，验证普通消息、`/status`、`/abort` 在真实 runtime wiring 下行为一致

### 用户故事 3 的测试 ⚠️

- [x] T025 [P] [US3] 编写本地双进程 runtime e2e 集成测试在 `tests/integration/local-runtime-e2e.test.ts`
- [x] T026 [P] [US3] 编写基于 runtime fingerprint 的配置漂移与联调失败场景集成测试在 `tests/integration/local-runtime-failure-modes.test.ts`

### 用户故事 3 的实现

- [x] T027 [P] [US3] 实现基于 runtime fingerprint 的本地双进程共享配置与状态对齐检查在 `packages/core/src/runtime/runtime-factory.ts`
- [x] T028 [US3] 保持普通消息、`/status`、`/abort` 在真实 runtime 下语义一致，并覆盖 Feishu `websocket` 入站模式在 `apps/executor/src/run-controller.ts`
- [x] T029 [US3] 实现本地联调专用 quickstart 校验步骤与 Feishu `websocket` 运行说明在 `specs/002-local-runtime-wiring/quickstart.md`
- [x] T030 [US3] 记录配置错误、依赖错误、Feishu `websocket` 鉴权或握手失败和 Codex CLI 不可用的 runbook 信息在 `docs/architecture.md`、`AGENTS.md`
- [x] T036 [US3] 将 `CONFIG_DRIFT` 的 `healthz` 降级与 `executor` 拒绝消费语义接入 runtime wiring 在 `apps/gateway/src/services/runtime-health.ts`、`apps/executor/src/services/runtime-readiness.ts`、`packages/core/src/runtime/runtime-factory.ts`

**检查点**: 本地双进程真实联调路径可独立演示

---

## Phase 6：收尾与横切关注点

**目的**: 完成 cross-cutting 文档、回归验证与交付收口

- [x] T031 [P] 更新运行时接入后的架构说明在 `docs/architecture.md`
- [x] T032 [P] 更新本地运行说明与 feature 文档入口在 `AGENTS.md`、`specs/002-local-runtime-wiring/quickstart.md`
- [x] T033 [P] 运行 quickstart 场景验证并修正文档在 `specs/002-local-runtime-wiring/quickstart.md`
- [x] T034 运行全量 lint / test / 本地启动验证并记录结果在 `specs/002-local-runtime-wiring/quickstart.md`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1**: 无依赖，可立即开始
- **Phase 2**: 依赖 Phase 1 完成；阻塞所有用户故事
- **Phase 3**: 依赖 Phase 2 完成；构成 MVP 的第一半
- **Phase 4**: 依赖 Phase 2 完成；与 Phase 3 在实现上可并行，但联调前必须都完成
- **Phase 5**: 依赖 Phase 3 与 Phase 4 完成
- **Phase 6**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1**: Foundational 完成后即可开始，是本地联调的入口
- **US2**: Foundational 完成后即可开始，是本地联调的执行前提
- **US3**: 依赖 US1 和 US2 都已具备真实 runtime wiring

### Within Each User Story

- 先完成契约/集成测试并确认初始失败
- 再实现配置与 runtime 状态模型
- 然后接入 bootstrap、入口和真实依赖装配
- 最后补日志、文档和联调说明

### Parallel Opportunities

- T002 与 T003 可并行
- T005、T006、T007、T008 可并行
- US1 的 T010、T011、T012、T035 可并行
- T016 与 T037 需要串行，先完成 `channel-feishu` 的 websocket 入站实现，再接入 `gateway`
- US1 的 T013、T014 可并行
- US2 的 T018、T019 可并行
- US2 的 T020、T021 可并行
- US3 的 T025、T026 可并行
- Phase 6 的 T031、T032、T033 可并行

---

## Parallel Example: User Story 1

```bash
Task: "编写 GET /healthz 契约测试在 tests/contract/runtime-health.contract.test.ts"
Task: "编写 Feishu websocket 握手、过滤与归一化契约测试在 tests/contract/feishu-websocket.contract.test.ts"
Task: "编写 gateway 启动与配置失败集成测试在 tests/integration/gateway-startup.test.ts"
Task: "编写 Feishu websocket 接入 wiring 集成测试在 tests/integration/gateway-feishu-runtime.test.ts"
```

---

## 实施策略

### MVP First（先打通 gateway + executor 启动）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：启动本地 gateway
4. 完成 Phase 4：启动本地 executor
5. **停下来验证**：确认双进程都能稳定启动、健康状态正确、依赖接线清晰

### 增量交付

1. 先交付本地 `gateway` 启动与健康检查
2. 再交付本地 `executor` 启动与消费循环
3. 最后交付真实飞书联调与 quickstart
4. 每一阶段都维持独立可验证

### 实现注意事项

- 不要在本轮扩展产品命令面和用户故事
- 不要引入 Docker Compose、systemd、反向代理或云部署编排
- 所有运行时接入都必须保持既有 queue / lock / cancel / heartbeat 语义不变
- 涉及真实依赖接线的任务必须同步维护 operator-visible 状态与 quickstart
