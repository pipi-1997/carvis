# Phase 0 研究记录

## 决策 1：`0010` 采用 OpenClaw-like 的 file-first 方案

- **Decision**: 第一阶段 durable memory 以 `<workspace>/.carvis/MEMORY.md` 为长期事实源，以 `<workspace>/.carvis/memory/YYYY-MM-DD.md` 为 daily memory，不建设 Postgres memory index、audit 表或 sync 子系统。
- **Rationale**:
  - 基于 `009` benchmark 的多方案对比，OpenClaw-like 路线在命中率、热路径成本和工程复杂度之间最平衡。
  - 用户已经明确偏好“简单、真实、可 benchmark”的文件型记忆，而不是新的 memory 平台。
  - 当前系统已有 workspace 隔离和单活动 run 约束，文件即真相在工程上可成立。
- **Alternatives considered**:
  - 文件 + Postgres 双写索引：治理能力更强，但第一阶段复杂度过高。
  - 只靠 prompt 不落文件：无法形成 durable memory。

## 决策 2：记忆提炼与写入由 Codex 在正常 run 中完成

- **Decision**: memory 的提炼、归类、去重和写入由 Codex 在当前正常 run 中完成；host 不引入单独的 memory extraction model。
- **Rationale**:
  - 用户明确要求所有 durable memory 都应有 agent 参与，避免把原始用户输入不加约束地持久化。
  - 再引入新 model 会放大时延、成本和系统复杂度。
  - OpenClaw 当前真实实现也是“agent 写文件 + host 提供 recall/flush”。
- **Alternatives considered**:
  - host 侧规则写入：实现快，但语义质量和可控性不足。
  - 新增 memory model：理论更强，但第一阶段不经济。

## 决策 3：host 负责 bounded recall，不依赖 tool-first retrieval

- **Decision**: executor 在 `bridge.startRun` 前执行 bounded preflight recall，从 `.carvis/MEMORY.md` 和近两天 daily memory 中抽取片段注入 prompt；第一阶段不提供 tool-first memory retrieval 主路径。
- **Rationale**:
  - `009` benchmark 已显示 tool-first-lite 的 `toolCallCountP95` 和热路径成本明显失控。
  - bounded host recall 能给 benchmark 一个稳定、可重复、低抖动的评测对象。
  - 这也更接近用户想要的“gateway/host recall 有价值”的方向。
- **Alternatives considered**:
  - 完全让 agent 自己读文件：可行，但 recall 触发不可控，benchmark 难稳定评分。
  - tool-first retrieval：功能可达标，但第一阶段成本过高。

## 决策 4：daily memory 进入 MVP，但只做有限时窗 recall

- **Decision**: daily memory 是 MVP 的正式组成部分，路径为 `.carvis/memory/YYYY-MM-DD.md`；普通 run 默认只考虑今天和昨天的 daily memory，不做更长历史窗口自动召回。
- **Rationale**:
  - 用户已经认可 recall 应参考 OpenClaw，把长期记忆和当日记忆一起纳入。
  - today/yesterday 能覆盖绝大多数近期上下文，而不会明显拉高扫描成本。
  - 更长时窗应等 benchmark 证明必要性后再扩展。
- **Alternatives considered**:
  - 只做 `MEMORY.md`：近期上下文覆盖不足。
  - 一上来全量 daily history recall：热路径成本不可控。

## 决策 5：pre-compaction memory flush 是第一版闭环的一部分

- **Decision**: 在会话接近 compaction 时，系统必须提供一次静默 memory flush，让 agent 在压缩前将应保留的信息写入当天的 daily memory。
- **Rationale**:
  - 单靠 agent 在普通 run 中自发写入，无法覆盖长会话尾段。
  - OpenClaw 的实践表明，这个兜底机制是减少“压缩前丢事实”的关键。
  - 用户明确要求记忆读写闭环第一版就要做。
- **Alternatives considered**:
  - 先不做 flush：会在长会话场景下留下明显缺口。
  - flush 直接改写 `MEMORY.md`：风险更高，也不符合 append-first 的近期记忆策略。

## 决策 6：agent 通过宿主 guidance 知道“何时写、写到哪”

- **Decision**: agent 是否写 memory、写到 `MEMORY.md` 还是 daily memory，依赖宿主注入的 workspace memory guidance，而不是依赖新的 memory skill、独立 memory tool 或后台 memory agent。
- **Rationale**:
  - 这是 OpenClaw 当前最接近真实实现的路径：bootstrap/guidance 驱动 agent 决策，文件工具执行写入。
  - guidance 可以在不扩展新的运行时表面的前提下约束误写率。
  - 用户已明确问过这一点，并认可这种方式。
- **Alternatives considered**:
  - 新 memory skill：可以做，但第一阶段没有必要增加额外表面。
  - 独立 memory agent：复杂度过高。

## 决策 7：手工编辑文件后直接生效，不提供 `/memory sync`

- **Decision**: 工程师手工修改 `.carvis/MEMORY.md` 或 daily memory 后，下一次 run 直接读取新内容；MVP 不提供 `/memory sync`。
- **Rationale**:
  - file-first 的成立前提就是“文件即真相”。
  - 去掉 sync 子系统可以显著压缩实现面和操作复杂度。
  - benchmark 也更容易诚实衡量“文件是否真的被读到了”。
- **Alternatives considered**:
  - 保留 `/memory sync`：与 file-first 收敛方向冲突。
  - 禁止人工编辑：削弱文件型 memory 的工程价值。

## 决策 8：workspace 是唯一记忆隔离边界

- **Decision**: memory 的隔离维度是 workspace，而不是 chat；不同 chat 绑定同一 workspace 时，共享同一套 memory 文件，但 continuation 仍保持 chat 级隔离。
- **Rationale**:
  - 用户明确要求“每个工作区独立，有自己的 MEMORY”。
  - 这与当前 workspace queue/lock 模型天然一致。
  - 它比全局 memory 更安全，也比 chat 级 memory 更能支持持续协作。
- **Alternatives considered**:
  - chat 级 memory：复用价值不足。
  - 全局 memory：污染和越界风险更高。

## 决策 9：benchmark 采集必须来自真实 instrumentation

- **Decision**: `toolCallCount`、`toolReadCount`、`toolWriteCount`、`memoryFlushTriggered`、`memoryFlushChanged` 等指标必须由真实 bridge/tool/runtime instrumentation 采集，不允许在 runner 中填静态常量。
- **Rationale**:
  - 用户明确要求“诚实失败”，不能把 benchmark 做绿。
  - `009` gate 已把热路径成本设为硬门槛，采集来源不真实会直接破坏门禁可信度。
- **Alternatives considered**:
  - 用固定常量模拟：简单，但结论失真。

## 决策 10：`009-workspace-memory-benchmark` 是 `0010` 的上线门禁

- **Decision**: `0010` 的 rollout 依据不是主观体验，而是 `009` benchmark 在真实 runtime 下的结果。
- **Rationale**:
  - 用户明确要求 memory 必须有 benchmark，否则容易变成“抽卡式命中”。
  - benchmark 现在不仅衡量 recall，也衡量热路径成本和稳定性。
- **Alternatives considered**:
  - 仅靠集成测试：能证功能，不足以证 rollout 可行性。
