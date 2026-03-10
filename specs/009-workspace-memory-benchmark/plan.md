# 实施计划：Workspace Memory Benchmark

**分支**: `[009-workspace-memory-benchmark]` | **日期**: 2026-03-11 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/spec.md)
**输入**: 来自 `/specs/009-workspace-memory-benchmark/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能为 `carvis` 的 workspace memory 建立第一阶段 benchmark 能力，用于在修改记忆写入、召回和自然语言记忆意图识别后，提供一套离线、可重复、可聚合判分的 gate。方案以现有 `tests/support/harness.ts` 为运行底座，新增 benchmark domain model、fixture corpus、trace collection、scorer、gate evaluator 和 suite 级报告输出；第一阶段以 `L1-golden` 为硬门槛，同时预留 `L2-replay` 与 `L3-adversarial` 的扩展空间。benchmark 复用测试中的 `gateway -> queue -> executor -> bridge` 路径来采集信号，但不改变任何生产执行拓扑。

## 技术上下文

- **语言/版本**: Bun 1.3.9、TypeScript 5.x
- **主要依赖**: Hono、`pg`、`redis`、`zod`，以及现有 `tests/support/harness.ts`、`packages/core` 领域模型
- **存储**: benchmark 自身以测试 fixture 文件为输入，运行时复用 in-memory repositories；生产语义仍映射 Postgres、Redis 和 workspace files
- **测试**: `bun test`，覆盖 `tests/unit`、`tests/integration`、`tests/contract`
- **目标平台**: 本地开发环境与 CI 中的离线测试执行
- **项目类型**: shared package + gateway/executor test harness + test support artifacts
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: 复用现有 `gateway -> queue -> executor -> bridge` 测试路径进行受控观测；新增 benchmark runner、scorer、gate，但不引入新的生产执行路径
- **可观测性**: 输出 case 级和 suite 级报告，记录 classification、writes、recalls、bridgeRequests、userVisibleOutputs、runtimeOutcome、token/latency 指标和 gate 失败原因，并明确哪些信号来自测试替身
- **性能目标**: benchmark 报告必须直接暴露 `classifierLatencyMs`、`recallLatencyMs`、`preflightLatencyMs`、`augmentationTokens`、`augmentationTokenRatio`、`filesScannedPerSync` 等指标，并支持 P50/P95 聚合
- **约束条件**: 保持 `ChannelAdapter` / `AgentBridge` 边界；不绕过现有 workspace queue/lock 语义；不把 benchmark 误当作线上 telemetry；one active run per workspace 语义保持不变
- **规模/范围**: 第一阶段覆盖 `L1-golden` 主集和少量 `L2-replay`、`L3-adversarial` 样例；优先支持 memory benchmark 离线运行，不包含生产流量采样

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 变更集中在 `packages/core` 的 benchmark domain、`tests/support` 的 harness/runner/scorer、`tests/{unit,integration}` 的 benchmark 测试，以及必要的脚本命令；不会把 Feishu 或 Codex 平台分支泄漏到共享运行时逻辑。
- [x] **Durable Lifecycle**: 计划文档、`data-model.md` 与 `contracts/` 已记录 benchmark 如何观察 run、write、recall、`/new` 后 durable recall 和 operator-visible gate 结果。
- [x] **Workspace Safety**: benchmark 复用现有 queue/lock/heartbeat 语义，且明确为离线受控执行；不会改变取消、超时、锁释放和 heartbeat 机制，只测量其对 memory 评测的影响。
- [x] **Operability**: benchmark 输出会明确给出 suite 汇总、失败案例、红线指标和 rollout 建议；operator 不需要进入 shell 逐条比对原始日志。
- [x] **Verification**: 计划已识别 benchmark domain model、fixture loader、trace collection、runner、scorer、gate evaluator 对应的 unit/integration 测试，并保留现有 contract/integration 测试职责不变。

## 项目结构

### 文档产物（本功能）

```text
specs/009-workspace-memory-benchmark/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── benchmark-fixture-contract.md
│   └── benchmark-report-contract.md
└── tasks.md
```

### 源码结构（仓库根目录）

```text
apps/
├── gateway/
└── executor/

packages/
├── core/
├── channel-feishu/
└── bridge-codex/

tests/
├── contract/
├── integration/
├── support/
└── unit/
```

**结构决策**:

- `packages/core`
  - 新增 benchmark 领域模型和必要导出，作为 fixture、trace 和 report 的共享类型源
- `tests/support`
  - 新增 fixture loader、trace 类型、runner、scorer、gate evaluator
  - 扩展 `harness.ts` 提供 benchmark 可消费的稳定 trace，包括分类、写入、召回、用户可见结果和成本工件
- `tests/fixtures`
  - 新增 memory benchmark 样例集，按 `L1-golden`、`L2-replay`、`L3-adversarial` 分层
- `tests/unit` / `tests/integration`
  - 新增 benchmark 相关单元和集成回归测试
- `package.json`
  - 新增 benchmark 运行脚本和 gate 脚本

## Phase 0：研究结论

- 第一阶段 benchmark 应采用离线、可重复的 harness 驱动评测
- fixture 与 report 需要成为显式契约
- red-line gate 先固定在误写、旧事实污染和 durable recall 漏召回
- benchmark 是 rollout gate，不替代现有 contract/integration 测试

详见 [research.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/research.md)。

## Phase 1：设计产物

- [data-model.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/data-model.md)
  - 定义 `Benchmark Case`、`Expectation`、`Trace`、`Suite Report`、`Gate Profile`
- [contracts/benchmark-fixture-contract.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/contracts/benchmark-fixture-contract.md)
  - 定义输入样例契约
- [contracts/benchmark-report-contract.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/contracts/benchmark-report-contract.md)
  - 定义输出报告契约
- [quickstart.md](/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/quickstart.md)
  - 定义实现顺序和本地运行方式

## 实施方向

### 代码变更面

1. `packages/core`
   - 增加 benchmark domain model 与导出
2. `tests/support`
   - 增加 fixture loader、trace collector、runner、scorer、默认 gate profile 与 gate evaluator
3. `tests/fixtures`
   - 增加 benchmark 样例
4. `tests/unit` / `tests/integration`
   - 为 benchmark 各层增加验证
5. `package.json`
   - 增加 benchmark 命令

### 不变项

- 不新增生产 adapter 或 bridge 包
- 不改变真实运行中的 queue/lock 行为
- 不在第一阶段引入生产流量采样或 shadow 执行路径

## 验证策略

- **单元测试**
  - benchmark domain model
  - fixture loader
  - scorer
  - cost aggregation
  - gate evaluator
- **集成测试**
  - harness trace capture
  - benchmark runner end-to-end
  - operator-facing gate summary and test-double boundary reporting
- **现有回归**
  - `bun test`
  - `bun run lint`

## Phase 1 后宪法复检

- [x] `ChannelAdapter` / `AgentBridge` 边界仍保持清晰
- [x] run lifecycle 和 operator-visible 输出已通过 report contract 建模
- [x] workspace 串行化和 heartbeat 语义被明确说明为“复用现有机制，不变更生产行为”
- [x] benchmark 的 operator-visible gate 和失败原因已在 contract 中定义
- [x] 计划已识别 contract/integration/unit 验证范围

## 复杂度追踪

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | N/A | N/A |
