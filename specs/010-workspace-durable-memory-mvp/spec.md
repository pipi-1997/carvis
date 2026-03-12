# 功能规格说明：Workspace Durable Memory MVP

**功能分支**: `010-workspace-durable-memory-mvp`  
**创建日期**: 2026-03-11  
**状态**: 草稿  
**输入**: 用户描述："基于 009 benchmark，为 Carvis 建立 openclaw-like workspace memo MVP。每个 workspace 拥有独立的 `.carvis/MEMORY.md`，由 agent 在正常 run 中自行决定写入，host/gateway 负责 bounded recall；第一阶段不引入 Postgres memory index、tool-first memory runtime 或新的 memory model。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, executor preflight, bridge request augmentation, compaction path, workspace filesystem
- **运维影响**: benchmark gate、运行日志、workspace 文件可见性、memory flush 可观测性
- **范围外内容**: 显式 `/remember` / `/forget` 命令体系、Postgres memory index / audit、tool-first retrieval、vector/graph memory、独立 memory model、跨 workspace 共享记忆

## Clarifications

### Session 2026-03-11 至 2026-03-12

- Q: remember 的时候，如何解析出要存储的记忆？是否有 agent 参与？ → A: 由 Codex 在正常 run 中参与判断、提炼和写入，不引入新的 memory extraction model。
- Q: 是否应该用 skill + MCP / tool-first 做闭环？ → A: 第一阶段不做 tool-first memory runtime；host 负责 bounded recall，agent 负责文件写入。
- Q: 是否继续以 `/remember` / `/forget` 作为主写入入口？ → A: 不再作为主路径；memory 写入应由 agent 在正常 run 中自行触发。
- Q: 每个 workspace 是否独立持有 memory？ → A: 是；每个 workspace 拥有自己独立的 `.carvis/MEMORY.md` 与 daily memory 文件。
- Q: agent 如何知道应该写 memory？ → A: 通过宿主注入的 workspace memory guidance，让 agent 知道什么该写、写到哪里、何时不该写；不是依赖新的 memory skill 或独立后台 agent。

## 用户场景与测试 *(必填)*

### 用户故事 1 - Agent 在正常 run 中形成 durable memory（优先级：P1）

作为长期在同一 workspace 里协作的用户，我希望 agent 在正常对话和任务执行中，能把稳定的偏好、决策和长期事实主动整理到该 workspace 的 `.carvis/MEMORY.md`，而不是只在当次回复里提到一次，这样换 chat、`/new` 或下次会话时仍然可用。

**优先级原因**: 如果 durable write 仍然依赖显式命令或人工补录，memory 系统就无法成为真实工作流的一部分。

**独立验证方式**: 在同一 workspace 内完成一轮包含长期偏好或项目约定的正常 run，run 结束后检查 `.carvis/MEMORY.md` 是否新增或更新了整理后的条目，且回复没有虚报“已记住”但文件未变。

**验收场景**:

1. **Given** 当前 workspace 下尚不存在 `.carvis/MEMORY.md`，**When** 用户在正常对话中明确表达长期约定，例如“这个项目统一使用 bun”并继续推进任务，**Then** agent 可以在同一 run 中惰性创建 `.carvis/MEMORY.md` 并写入整理后的 durable 条目。
2. **Given** `.carvis/MEMORY.md` 中已经存在旧约定，**When** 后续正常 run 明确形成新的长期结论，**Then** agent 必须更新或替换冲突条目，而不是无限追加相互矛盾的表述。

---

### 用户故事 2 - 普通 run 自动读取 workspace memory（优先级：P1）

作为在同一 workspace 中持续推进任务的用户，我希望普通消息在进入 Codex 前，系统能基于当前 workspace 的 durable memory 执行 bounded recall，把相关的长期记忆和近两天的 daily memory 片段注入上下文，这样 fresh session、`/new` 或换 chat 时也仍能稳定命中该 workspace 的长期上下文。

**优先级原因**: durable memory 的核心价值不在“文件存在”，而在“后续 run 可以稳定、低成本地用起来”。

**独立验证方式**: 先让某个 workspace 产生 durable memory，再通过普通消息触发新 run，检查 bridge request 中存在 bounded memory augmentation，且同一 workspace 的其他 chat 在不复用 continuation 的情况下仍可命中这份记忆。

**验收场景**:

1. **Given** `<workspace>/.carvis/MEMORY.md` 中存在与当前问题相关的条目，**When** 用户发送普通消息，**Then** executor 在调用 bridge 之前必须注入有界的 memory excerpt，而不是完全依赖 agent 自己临时读文件。
2. **Given** `<workspace>/.carvis/memory/` 下存在今天和昨天的 daily memory，**When** 用户发送与近期上下文相关的普通消息，**Then** recall 可以在预算内同时带入相关的 daily memory 片段。
3. **Given** 两个 chat 绑定到同一 workspace，**When** 其中一个 chat 已经形成 durable memory，**Then** 另一个 chat 的后续普通消息也可以命中该 workspace memory，但不得复用前一个 chat 的 continuation。

---

### 用户故事 3 - 接近 compaction 时保住可持久化信息（优先级：P2）

作为持续长会话协作的用户，我希望当上下文接近压缩时，系统能在不打断对话的情况下触发一次静默 memory flush，让 agent 先把应保留的信息写入 daily memory，再进行 compaction，避免“刚讨论完的重要事实因为压缩丢失”。

**优先级原因**: 仅靠正常 run 中的自发写入不足以覆盖长会话尾段；没有 flush，记忆系统仍会在高压上下文下丢关键事实。

**独立验证方式**: 构造接近 compaction 的长会话，检查系统是否在 compaction 前触发静默 memory flush，且只影响 memory 文件，不产生额外用户可见消息。

**验收场景**:

1. **Given** 当前会话已接近 compaction 阈值，**When** 下一次 run 进入压缩前阶段，**Then** 系统必须先触发一次静默的 memory flush 机会，让 agent 将可保留信息写入当天的 daily memory。
2. **Given** 本轮 flush 没有可持久化的新信息，**When** flush 执行完成，**Then** 系统不得向用户发送额外可见回复，也不得伪造 memory 已更新。

---

### 用户故事 4 - 手工编辑 memory 文件后无需 sync 即可生效（优先级：P2）

作为维护 workspace 的工程师，我希望 `.carvis/MEMORY.md` 和 `.carvis/memory/*.md` 是真正的事实源；如果我手工整理或修正文档，下一次 run 就应该直接看到新结果，而不需要额外的 sync 子系统。

**优先级原因**: openclaw-like 方案是否成立，关键就在于“文件即真相”是否足够简单、直接、可审计。

**独立验证方式**: 手工修改 memory 文件后触发下一次普通 run，检查 recall 读取的是新内容而不是任何缓存或隐藏状态。

**验收场景**:

1. **Given** 工程师手工修改了 `.carvis/MEMORY.md`，**When** 下一次普通 run 开始，**Then** executor 读取的是修改后的内容，不要求 `/memory sync`。
2. **Given** 工程师手工整理了 `.carvis/memory/YYYY-MM-DD.md`，**When** 下一次与近期上下文相关的 run 发生，**Then** recall 使用的是整理后的 daily memory 内容。

---

### 用户故事 5 - 用 009 benchmark 证明方案不是“抽卡式命中”（优先级：P3）

作为 feature owner，我希望 `0010` 的上线依据不是主观感受，而是 `009-workspace-memory-benchmark` 对真实文件写入、真实 recall 注入、静默 flush 和热路径成本的客观结果，这样可以区分“看起来会记”与“实际可落地”。

**优先级原因**: 用户已经明确要求 memory 必须有 benchmark，否则很容易演化成只在少数样例里偶尔命中的伪能力。

**独立验证方式**: 运行 `009` benchmark，确认工作区独立 memory、跨 chat recall、旧事实淘汰、热路径成本和 flush 结果来自真实 runtime，而不是 fixture 假数据。

**验收场景**:

1. **Given** workspace durable memory runtime 已接入真实文件读写和 bounded recall，**When** 维护者运行 `009-workspace-memory-benchmark`，**Then** benchmark 必须能依据真实文件 diff 与 bridge augmentation 输出效果和成本结论。
2. **Given** `009` benchmark 的热路径指标超出门限，**When** operator 查看报告，**Then** 系统必须阻止 rollout，即使少量样例看起来命中了记忆。

### 边界与异常场景

- 当 `<workspace>/.carvis/MEMORY.md` 不存在时，agent 可以惰性创建；普通 run 不得因为文件缺失而失败。
- 当 `<workspace>/.carvis/memory/YYYY-MM-DD.md` 或昨日 daily memory 不存在时，recall 应降级为空片段，而不是报错中断 run。
- 当用户只是一次性、情绪化、明显不稳定或不值得持久化的表达时，agent 不得写入 durable memory。
- 当不同 chat 共享同一 workspace 时，共享的是 workspace memory 文件，不是 continuation。
- 当同一 workspace 已有活动运行时，新增请求仍必须遵守现有 FIFO 排队和单活动运行约束；memory 方案不得绕过该安全边界。
- 当 executor 心跳丢失或 run 异常终止时，operator 必须能区分“正常未写入”“flush 未触发”“写入失败”与“recall miss”。
- 当 run 因 timeout 到期而被终止时，system 必须保留与现有运行生命周期一致的 timeout 语义；不得把未完成的 memory write 或 flush 误判为成功，operator 也必须能区分 timeout 与其他失败原因。
- 当静默 memory flush 执行时，不得向用户额外发送一条可见消息，也不得改写非 memory 文件。
- 当 `.carvis/MEMORY.md` 过大时，host 只能注入有界 excerpt，不得整份无界拼接。
- 当 benchmark 未通过时，不得把该 memory 方案宣称为可正式 rollout。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 为每个 workspace 提供独立的 Markdown durable memory，主事实源为 `<workspace>/.carvis/MEMORY.md`。
- **FR-002**: System MUST 允许 agent 在正常 run 中基于用户上下文和任务进展，自主决定是否将稳定偏好、决策和长期事实整理写入该 workspace 的 `.carvis/MEMORY.md`。
- **FR-003**: System MUST 为 agent 注入明确的 workspace memory guidance，使其知道什么应写入 `.carvis/MEMORY.md`、什么应写入 daily memory、什么不应被持久化。
- **FR-004**: System MUST 将 `<workspace>/.carvis/memory/YYYY-MM-DD.md` 作为 daily memory 载体，用于记录当日运行上下文和近期事实。
- **FR-005**: System MUST 在普通 run 调用 bridge 之前执行 bounded preflight recall，从当前 workspace 的 `.carvis/MEMORY.md` 与近两天 daily memory 中抽取固定预算内的相关片段并注入请求。
- **FR-006**: System MUST 让 `/new` 只影响 chat continuation，不影响当前 workspace 的 durable memory 文件。
- **FR-007**: System MUST 在多个 chat 共享同一 workspace 时共享同一份 workspace memory 文件，但不得打破 continuation 的 chat 级隔离。
- **FR-008**: System MUST 把 workspace memory 文件视为唯一 durable truth；手工编辑文件后，下一次 run 必须直接读取新内容，不要求额外 sync。
- **FR-009**: System MUST 在会话接近 compaction 时提供一次静默 memory flush 机会，使 agent 能在压缩前把应保留的信息写入当天的 daily memory。
- **FR-010**: System MUST 约束静默 memory flush 只影响 memory 文件，并且不得生成额外用户可见回复或修改非 memory 文件。
- **FR-011**: System MUST 将 `.carvis/MEMORY.md` 维持为 curated memory 文件；同一语义的 active 记忆不得长期以多条冲突内容共存。
- **FR-012**: System MUST 避免在 MVP 中引入 Postgres memory index、tool-first memory retrieval、显式 `/remember` / `/forget` 工作流或新的 memory model。
- **FR-013**: System MUST 让 `009-workspace-memory-benchmark` 能观测真实文件写入、真实 recall augmentation、真实 flush 行为和真实热路径成本，并以其 gate 作为 rollout 前提。
- **FR-014**: System MUST 将“普通聊天不得误写 durable memory”“旧事实更新后不得继续被召回”“热路径工具/扫描成本受控”视为硬约束。

### 假设

- MVP 继续依赖现有 one-active-run-per-workspace 语义，因此 memory 文件写入不会引入新的并发写通道。
- Codex 已具备正常文件编辑能力；MVP 通过 guidance 驱动 agent 使用现有文件能力，不引入新的 memory-specific MCP 或 sidecar service。
- `.carvis/MEMORY.md` 需要被长期保持在可人工阅读和可人工整理的规模内，bounded recall 依赖这一前提。
- 近两天 daily memory 足以覆盖第一阶段的近期上下文需求；更长时窗的召回不属于 MVP 必保范围。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 在运行日志和 benchmark trace 中记录 memory excerpt 注入规模、命中的文件类型、memory flush 是否触发以及相关失败原因。
- **OR-002**: System MUST 让 operator 能区分“文件未变更”“agent 判定无需写入”“memory flush 未触发”“memory flush 失败”“recall miss”“run timeout”“benchmark gate blocked”这几类结果。
- **OR-003**: System MUST 把 hot-path 成本暴露给 benchmark，包括 `preflightLatencyMs`、`filesScannedPerSync`、`toolCallCount`、`toolReadCount`、`toolWriteCount`。
- **OR-004**: System MUST 明确说明 durable truth 是 workspace 文件，而不是数据库隐藏状态，方便 operator 直接检查。
- **OR-005**: System MUST 保持 memory 方案对现有锁、队列、心跳、取消和 timeout 语义透明，不得削弱 operator 已有的运行生命周期可见性。

### 关键实体 *(涉及数据时填写)*

- **Workspace Memory File**: `<workspace>/.carvis/MEMORY.md`，表示该 workspace 当前生效的长期记忆文件。
- **Workspace Daily Memory File**: `<workspace>/.carvis/memory/YYYY-MM-DD.md`，表示该 workspace 当日运行上下文和近期事实的追加式记忆文件。
- **Workspace Memory Excerpt**: 表示某次普通 run 从长期记忆与近两天 daily memory 中抽取并注入 prompt 的 bounded 片段。
- **Workspace Memory Write Observation**: 表示一次 run 前后 workspace memory 文件 diff 的结果，用于判断是否发生 durable write。
- **Workspace Memory Flush Observation**: 表示一次 compaction 前静默 flush 的触发、执行和结果记录。
- **Run**: 现有执行单元；memory 写入和 recall 都发生在现有 run 生命周期内，而不是新的 memory 队列。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 在正常 run 中出现明确长期偏好、决策或稳定事实时，`>= 95%` 的 benchmark 样例能在对应 workspace 的 memory 文件中看到整理后的 durable 内容。
- **SC-002**: 在同一 workspace 的 fresh session、`/new` 后续 run 或不同 chat 中，相关长期事实的 recall 命中率达到 `>= 0.95`。
- **SC-003**: 旧事实被更新或移除后，stale recall rate 保持为 `0`。
- **SC-004**: `009-workspace-memory-benchmark` 的默认 gate 中，`preflightLatencyMsP95 <= 30`、`filesScannedPerSyncP95 <= 6`、`toolCallCountP95 <= 2`。
- **SC-005**: 手工修改 workspace memory 文件后，无需额外 sync，下一次 run 即可读取新内容。
- **SC-006**: 静默 memory flush 在需要时能于 compaction 前触发，并保持用户可见额外消息数为 `0`。
