# Phase 0 研究记录

## 决策 1：第一阶段 benchmark 采用离线、可重复执行的 harness 驱动评测

- **Decision**: 复用 `tests/support/harness.ts` 作为 system-under-test，第一阶段只建设离线 benchmark，不依赖真实线上采样或 shadow runtime。
- **Rationale**:
  - 当前仓库已经有覆盖 `gateway`、`executor`、`queue`、`lock`、`bridge` 的受控测试 harness，可稳定回放消息、运行和持久化路径。
  - memory benchmark 的第一阶段目标是建立可靠 gate，而不是还原全部生产分布；离线执行更利于可重复、可回归和定位失败原因。
  - 它不会破坏现有 `ChannelAdapter` / `AgentBridge` 边界，也不会把生产流量采集逻辑提前引入核心运行链路。
- **Alternatives considered**:
  - 直接接入真实线上消息回放：更贴近生产，但会引入脱敏、标注、样本偏斜和不可重复问题。
  - 单纯用纯函数级 scorer：实现更简单，但无法覆盖 queue、workspace、continuation、presentation 等真实运行语义。

## 决策 2：样例集按 `golden` / `replay` / `adversarial` 三类组织

- **Decision**: benchmark fixture 分为 `L1-golden`、`L2-replay`、`L3-adversarial` 三类，且第一阶段以 `L1-golden` 为主 gate。
- **Rationale**:
  - `golden` 适合作为稳定主基线，避免每次回归被生产噪音干扰。
  - `replay` 用于补充真实语料，但在第一阶段只需要少量脱敏样本，不应成为主门禁。
  - `adversarial` 能专门覆盖误写、旧事实污染、冲突 recall 这类 memory 最危险的失败模式。
- **Alternatives considered**:
  - 只保留 golden：回归稳定，但对真实表达变体覆盖不足。
  - 只保留 replay：样本更真实，但难以形成稳定 gate。

## 决策 3：把 benchmark 契约定义为 fixture 契约和 report 契约

- **Decision**: 在 `contracts/` 下同时记录 fixture contract 和 report contract，而不是把 benchmark 视为无契约内部脚本。
- **Rationale**:
  - fixture 是开发者新增 benchmark 样例时要遵守的输入接口。
  - report 是 feature owner / operator 判断是否允许 rollout 的输出接口。
  - 明确这两类契约后，可以把 benchmark 视为产品化工具，而不是一次性测试脚本。
- **Alternatives considered**:
  - 只在代码里定义 TypeScript interface：对开发者足够，但不利于跨角色阅读和审查。
  - 只提供 README 说明：过于松散，难以作为后续 tasks 和验证的稳定基础。

## 决策 4：第一阶段 trace 只采集 memory 评测所需的最小运行工件

- **Decision**: trace 先聚焦 `bridgeRequests`、用户可见结果、memory write / recall 命中、classification 结果、token/latency 指标，不引入全量 raw event dump。
- **Rationale**:
  - benchmark 的目标是判分和定位 memory 回归，不是复制一套完整 observability 系统。
  - 最小 trace 能减少样例维护成本，也更容易定义固定 gate。
  - 若未来需要更深入诊断，可在不破坏现有 scorer 的前提下逐步补字段。
- **Alternatives considered**:
  - 捕获所有 `RunEvent` 和 presentation events：信息更全，但会放大 fixture 和 scorer 复杂度。
  - 仅保留最终 pass/fail：定位失败时信息不足。

## 决策 5：gate 必须同时约束效果正确性和热路径成本

- **Decision**: 第一阶段 gate 以 `false_write_rate`、`stale_recall_rate`、`missed_durable_recall_rate` 为正确性红线，同时增加 `preflight_latency_ms_p95`、`files_scanned_per_sync_p95`、`tool_call_count_p95` 这三类热路径成本红线，并保留 `recall_hit_rate` 与 `augmentation_token_ratio` 作为辅助阈值。
- **Rationale**:
  - 误写 durable memory 和旧事实污染是 memory 系统最危险的两类错误，一旦放过会快速破坏用户信任。
  - durable recall 漏召回则直接削弱这套系统存在的意义。
  - 社区方案对比表明，仅看效果会误放过“需要频繁工具读写或扫描大量文件”的方案；这些方案在真实交互中会因为延迟和成本失控而不可落地。
  - 因此 benchmark 不能只统计成本，而要把最关键的热路径成本直接升格为 gate。
- **Alternatives considered**:
  - 先只看平均准确率：会掩盖最有害的长尾错误。
  - 先只看成本：无法说明 memory 设计本身是否有效。
  - 只记录成本不设 gate：会导致“效果漂亮但调用风暴”的方案被误判为可上线。

## 决策 6：fixture 需要覆盖 repeated recall、large curated memory 与 tool retry 压力场景

- **Decision**: 在 `L2-replay` / `L3-adversarial` 中补充 repeated recall、large curated memory、long-horizon memory growth、update-then-repeated-recall、tool retry read session 等场景。
- **Rationale**:
  - 社区 memory 方案的差异，往往不是在单次命中上，而是在多轮交互和记忆增长后的热路径行为上。
  - 这类样例能更快揭露“每轮都重扫大量文件”“每轮多次工具重读”“更新后旧事实仍被重复召回”这类问题。
  - benchmark 需要对这些方案保持诚实失败，而不是只在最小 golden 语料上看起来通过。
- **Alternatives considered**:
  - 只在 golden 中维持最小语料：更简单，但对方案优劣的区分度不足。
  - 直接依赖线上真实 replay：更真实，但不稳定也不便于持续回归。

## 决策 7：benchmark 不替代契约测试，而是作为 rollout gate 叠加存在

- **Decision**: benchmark 与现有 contract/integration 测试并存，分别承担“接口/运行语义正确性”和“memory 质量门禁”两种职责。
- **Rationale**:
  - 宪法要求 adapter、bridge、run lifecycle 仍需有契约测试和集成测试。
  - benchmark 关注的是“系统是否记对、召回对、成本可控”，这和现有生命周期测试并不等价。
  - 分开建设可以保持测试职责清晰，避免把所有验证都塞进单类测试。
- **Alternatives considered**:
  - 直接把 benchmark case 全部写进 integration test：可行，但会导致判分逻辑、样例契约和运行语义检查混杂在一起。
