# 实施计划：Workspace Durable Memory MVP

**分支**: `[010-workspace-durable-memory-mvp]` | **日期**: 2026-03-12 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/spec.md)  
**输入**: 来自 `/specs/010-workspace-durable-memory-mvp/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能将 `carvis` 的 `0010` durable memory 收敛为 OpenClaw-like 的 workspace memory MVP。核心方案是：每个 workspace 拥有自己独立的 `.carvis/MEMORY.md` 与 `.carvis/memory/YYYY-MM-DD.md`；Codex 在正常 run 中基于宿主注入的 memory guidance 决定是否写入长期记忆或 daily memory；executor 在 `bridge.startRun` 前执行 bounded preflight recall，把长期记忆和近两天 daily memory 的小片段注入 prompt；当上下文接近 compaction 时，再提供一次静默 memory flush 机会，把应保留的信息落到当天 daily memory。整个方案继续复用现有 queue/lock/run lifecycle，不引入新的 memory model、index 或独立 memory runtime，并以 `009-workspace-memory-benchmark` 作为 rollout gate。

## 技术上下文

- **语言/版本**: Bun 1.3.9、TypeScript 5.x
- **主要依赖**: Hono、Node.js `fs/promises` / `path` / `crypto`、现有 `packages/core` 运行模型、`packages/bridge-codex`
- **存储**: workspace filesystem（`<workspace>/.carvis/MEMORY.md` + `<workspace>/.carvis/memory/YYYY-MM-DD.md`）；MVP 不新增 memory 专用 Postgres 表
- **测试**: `bun test`、`bun run lint`、`bun run test:memory-benchmark`
- **目标平台**: 本地单机双进程 runtime（`gateway` + `executor`）和 CI 离线测试执行
- **项目类型**: gateway + executor + shared package + benchmark support
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `gateway` 继续做 ingress、workspace resolve、queueing；`executor` 负责 memory guidance、preflight recall、静默 flush 和文件观测；one active run per workspace 语义保持不变，且不得改变既有 timeout/cancel/heartbeat 行为
- **可观测性**: runtime logger、benchmark trace、memory before/after diff、bridge request augmentation 摘要、flush 触发/结果、基于 bridge/harness instrumentation 的 tool-count
- **性能目标**: 以 `009-workspace-memory-benchmark` gate 为准，要求 `preflightLatencyMsP95 <= 30`、`filesScannedPerSyncP95 <= 6`、`toolCallCountP95 <= 2`
- **约束条件**: Preserve `ChannelAdapter` / `AgentBridge` boundaries；Postgres 仍是现有 run lifecycle 的 durable state；Redis 只做 coordination；MVP 不做 memory index、显式 `/remember` 主工作流、tool-first retrieval
- **规模/范围**: 覆盖 agent-managed write、bounded recall、today/yesterday daily memory、手工改文件直接生效、静默 flush、benchmark real runtime gate；不覆盖 vector/graph memory、全局跨 workspace 记忆、独立 memory model

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 变更集中在 `apps/executor` 的 memory 服务、preflight recall / guidance / flush 注入，以及少量 `packages/core` 的共享类型与 `tests/support` benchmark 观测；不会在共享运行时中引入 Feishu 或 Codex 特定控制流泄漏。
- [x] **Durable Lifecycle**: durable truth 明确为 workspace 文件；run 级 recall、write、flush 观测都已建模。
- [x] **Workspace Safety**: memory 写入、recall 和 flush 继续复用现有普通 run 和单 workspace 串行语义；没有第二套 memory worker。
- [x] **Operability**: runtime logger、benchmark trace 和 workspace 文件本身构成 operator 可见状态；能够区分“未写入”“无需写入”“flush 未触发”“flush 失败”“recall miss”“benchmark blocked”。
- [x] **Verification**: 已识别 guidance 注入、`MEMORY.md`/daily memory diff、preflight augmentation、`/new` 后 recall、flush 静默性、benchmark real runtime gate 的 contract/integration/unit 测试。

## 项目结构

### 文档产物（本功能）

```text
specs/010-workspace-durable-memory-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── workspace-memory-commands.md
│   └── workspace-memory-benchmark-runtime.md
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

- `apps/executor/src/services/workspace-memory.ts`
  - 负责 memory 路径解析、读取、today/yesterday 选择、excerpt 裁剪、文件 diff 观测
- `apps/executor/src/services/workspace-memory-guidance.ts`
  - 负责注入给 Codex 的 memory 规则，包括什么写入长期记忆、什么写入 daily memory、什么拒绝持久化
- `apps/executor/src/services/workspace-memory-flush.ts`
  - 负责接近 compaction 时的静默 flush 触发条件、目标文件和结果观测
- `apps/executor/src/run-controller.ts`
  - 在 `bridge.startRun` 前注入 guidance + bounded excerpt，并记录 preflight 与 flush 成本
- `tests/support`
  - 扩展 harness 与 benchmark trace，观测真实文件变更、augmentation、flush 和 tool counts
- `packages/core`
  - 仅增量扩展 benchmark / observability 共享类型；不新增 memory 专用 durable schema
- `apps/gateway`
  - 不新增 memory 专用 work item 或 memory command handler，继续沿用普通 run 路径
- `tests/contract` + `tests/integration`
  - 额外验证 memory 接入后不改变现有 queue/lock/heartbeat/cancel/timeout 语义，并对 scope guard 做防漂移约束

## Phase 0：研究结论

- `009` benchmark 的多方案对比已经证明：OpenClaw-like 的 file-first 方案比 tool-first-lite 更适合作为第一版落地路线
- durable memory 的提炼与写入由 Codex 在正常 run 中完成，不引入新的 memory extraction model
- host 只负责 bounded recall 与 pre-compaction flush，不负责复杂 memory decision engine
- memory 的隔离边界是 workspace；不同 chat 共享同一 workspace 时共享同一套 memory 文件，但 continuation 仍隔离
- `.carvis/MEMORY.md` 是长期事实源，today/yesterday 的 daily memory 提供近期上下文
- 手工编辑 memory 文件后下一次 run 直接生效，不提供 `/memory sync`
- benchmark 必须对真实 write / recall / flush / tool cost 做 instrumentation，不允许假绿
- 必须通过 contract/integration 明确证明 memory 接入没有引入独立 memory worker、tool-first retrieval surface 或新的 queue/lock/timeout 语义

详见 [research.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/research.md)。

## Phase 1：设计产物

- [data-model.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/data-model.md)
  - 定义 `WorkspaceMemoryFile`、`WorkspaceDailyMemoryFile`、`WorkspaceMemoryExcerpt`、`WorkspaceMemoryWriteObservation`、`WorkspaceMemoryFlushObservation`
- [contracts/workspace-memory-commands.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/contracts/workspace-memory-commands.md)
  - 定义普通 run 中的用户可见 memory 契约
- [contracts/workspace-memory-benchmark-runtime.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/contracts/workspace-memory-benchmark-runtime.md)
  - 定义 benchmark 需要看到的真实文件 diff、augmentation、flush 和热路径成本字段
- [quickstart.md](/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/quickstart.md)
  - 定义实现顺序和验证命令

## Phase 1 后宪法复检

- [x] `ChannelAdapter` / `AgentBridge` 边界保持不变，memory 逻辑主要落在 executor preflight、flush 和 workspace 文件
- [x] run lifecycle 继续复用现有 queue/lock/heartbeat/cancel 语义，没有第二条 memory 执行通道
- [x] operator-visible 事实源从设计阶段起就收敛为 workspace 文件和 benchmark 报告
- [x] 未新增 memory 专用 Postgres durable 表或独立 runtime，复杂度明显低于旧版 `0010` 草案
- [x] contract/integration/unit 验证范围已覆盖 governed seams

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | N/A | N/A |
