# 功能规格说明：Agent 管理定时任务

**功能分支**: `007-agent-managed-scheduling`
**创建日期**: 2026-03-10
**状态**: 草稿
**输入**: 用户描述："支持 Codex 在当前 chat 绑定 workspace 内根据自然语言或自然语音意图直接创建、查询、修改、停用与重新启用定时任务；Carvis 需要以 `carvis-schedule` CLI 作为 agent 的执行入口，通过 skill 约束何时调用这些命令，同时保持 gateway 为唯一 durable 执行面。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu、Scheduler、internal admin query surface
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, queueing, executor, outbound delivery, internal admin query surface
- **运维影响**: queueing, locks, scheduler, notifications, internal admin visibility
- **范围外内容**: 跨 workspace 管理定时任务、权限控制与审批流、秒级 schedule、批量修改或批量删除、独立图形化管理 UI、多 bridge 选择策略、绕过 `carvis-schedule` 或 gateway 执行面直接写入 durable schedule state、把 skill 当作有副作用执行面

## Clarifications

### Session 2026-03-10

- Q: `Codex` 能否修改或停用 `config` 来源的 schedule？→ A: 可以，`Codex` 可以修改和停用当前 workspace 里的全部 schedule，包括 `config` 来源和 `agent` 来源。

## 用户场景与测试 *(必填)*

### 用户故事 1 - 用自然语言直接创建定时任务（优先级：P1）

作为已经在聊天里绑定到某个 workspace 的用户，我希望直接说“每天早上 9 点帮我检查构建失败”这类自然语言或自然语音意图，就能让 Codex 在当前 workspace 内创建一个正式的定时任务，这样我不需要手写配置或手工维护 cron，也能把重复性工作交给同一套运行系统。

**优先级原因**: 这是把 `006` 已有调度能力变成真正可用产品能力的第一步；如果仍然只能靠手工配置，scheduler 对大多数用户来说仍然不可用。

**独立验证方式**: 在一个已绑定 workspace 的聊天中表达明确的定时意图，验证系统直接创建一个新的 schedule definition，并在后续计划时点通过既有 scheduler 流程生成 trigger execution 和 run。

**验收场景**:

1. **Given** 当前 chat 已绑定到某个 workspace，且用户表达了清晰的创建意图，**When** Codex 在 skill 约束下调用 `carvis-schedule create`，**Then** 系统必须直接在该 workspace 下创建新的 schedule definition，而不要求用户先改配置文件。
2. **Given** 用户通过语音消息表达了可识别的定时意图，**When** 语音内容被转成同一聊天流中的文本语义，**Then** 系统必须按与文本消息一致的规则创建 schedule definition。
3. **Given** 新 schedule definition 已启用，**When** 到达计划时点，**Then** 该任务必须通过既有 scheduler workflow 生成 trigger execution，并进入现有 run 链路。

---

### 用户故事 2 - 查看当前 workspace 的定时任务（优先级：P1）

作为正在某个 workspace 中工作的用户，我希望直接问“我现在有哪些定时任务”，就能看到当前 workspace 下的 schedule 列表、它们的启用状态和最近执行情况，这样我能知道自动化已经配置了什么，而不用切换到宿主机或数据库里查。

**优先级原因**: 没有可查询能力，创建出来的 schedule 很快会变成黑盒；查询是修改和取消之前的必要基础能力。

**独立验证方式**: 在一个已有多个 schedule definition 的 workspace 聊天中发起查询，验证返回结果只包含当前 workspace 的定义，并展示足够判断健康状态的摘要信息。

**验收场景**:

1. **Given** 当前 workspace 下存在多个 schedule definition，**When** Codex 调用 `carvis-schedule list`，**Then** 系统必须只返回当前 workspace 的 definitions，而不包含其他 workspace 的任务。
2. **Given** 某个 schedule 近期执行成功、另一个近期执行失败，**When** 用户查询列表，**Then** 返回结果必须能区分启用状态、下一次计划时间和最近一次执行结果。

---

### 用户故事 3 - 修改已有定时任务（优先级：P2）

作为已经使用定时任务的用户，我希望直接说“把刚才那个改成每 30 分钟一次”或“把日报改到工作日上午 10 点”，让 Codex 修改当前 workspace 下已有的任务，而不用手工找到底层定义再改写。

**优先级原因**: 创建之后很快就会出现调整频率、时间和任务描述的需求；如果只能创建不能修改，用户很容易重新创建重复任务，导致调度混乱。

**独立验证方式**: 对当前 workspace 中已有 schedule 发起自然语言修改请求，验证唯一匹配时系统直接更新 definition；若目标不唯一，则要求澄清而不自动猜测。

**验收场景**:

1. **Given** 当前 workspace 中只有一个与用户描述匹配的 schedule definition，**When** Codex 调用 `carvis-schedule update`，**Then** 系统必须直接更新该 definition，并保留其历史执行记录。
2. **Given** 当前 workspace 中有多个可能匹配的 schedule definition，**When** 用户发起修改请求，**Then** 系统必须要求用户澄清目标，而不是任意选择其中一个 definition。
3. **Given** 用户试图把 schedule 改成当前调度器不支持的时间模式，**When** 系统校验更新请求，**Then** 必须拒绝修改并返回清晰原因。

---

### 用户故事 4 - 取消当前 workspace 的定时任务（优先级：P2）

作为已经不再需要某个自动化任务的用户，我希望直接说“取消每天巡检”或“停掉那个每 5 分钟的检查”，让 Codex 停用当前 workspace 中对应的 schedule，而不是继续让它自动触发。

**优先级原因**: 自动化任务如果不能由聊天上下文安全停用，会持续产生噪音或消耗执行资源；取消能力是最基本的运行控制能力。

**独立验证方式**: 在已有 schedule 的 workspace 中发起取消请求，验证唯一匹配时系统停用 definition 但保留历史记录；若存在歧义或找不到目标，则给出明确反馈。

**验收场景**:

1. **Given** 当前 workspace 中只有一个与用户描述匹配的 schedule definition，**When** Codex 调用 `carvis-schedule disable`，**Then** 系统必须停用该 definition，并保留既有 trigger execution 与 run 历史。
2. **Given** 当前 workspace 中没有任何匹配的 schedule definition，**When** 用户请求取消任务，**Then** 系统必须明确告知未找到目标，而不是修改其他 definition。
3. **Given** 被停用的 schedule 曾经有过成功和失败执行记录，**When** 用户稍后查询定时任务列表，**Then** 系统必须显示该 definition 已停用，并保留最近结果摘要供 operator 和用户查看。

---

### 用户故事 5 - 重新启用已停用的定时任务（优先级：P2）

作为已经停用过某个定时任务的用户，我希望直接说“重新启用日报”或“把每天巡检打开”，让 Codex 在当前 workspace 内把该 schedule 恢复为启用状态，同时不需要我手工找配置或改数据库。

**验收场景**:

1. **Given** 当前 workspace 中存在一个已停用的 schedule definition，**When** Codex 调用 `carvis-schedule enable`，**Then** 系统必须启用该 definition，并保留既有 trigger execution 与 run 历史。
2. **Given** 用户对一个已停用 schedule 发起 update（改时间/改描述），**When** Codex 调用 `carvis-schedule update`，**Then** 系统不得隐式把该 schedule 启用；只有显式 `enable` 才能恢复启用。

### 边界与异常场景

- 当用户所在 chat 尚未绑定 workspace 时，系统不得创建、查询、修改或取消 schedule，而必须先要求用户建立 workspace 上下文。
- 当用户表达的内容不需要 schedule 管理时，agent 应继续按普通聊天处理，不得因为 `carvis-schedule` 默认可用就调用该 CLI。
- 当普通 coding、debugging 或仓库分析对话仅提到 `schedule`、`cron` 等词汇但不构成 schedule 管理意图时，skill 不得调用 `carvis-schedule`。
- 当创建请求缺少可操作的时间信息、频率信息或任务描述时，系统必须要求澄清，而不是创建含糊 definition。
- 当修改或取消请求在当前 workspace 中命中多个可能目标时，系统必须要求澄清，不得批量处理或默认挑选最近一个。
- 当当前 workspace 已有一个活动运行时，schedule 后续触发出的 run 必须继续进入既有 FIFO 队列，不得因为是 agent 创建的 definition 就绕过锁语义。
- 当 agent 管理的 schedule 到达计划时点但 executor 心跳丢失、智能体进程异常退出或 run 超时时，系统必须按现有 run lifecycle 标记失败，并保留与 definition、execution 的关联。
- 当 agent 创建或修改的 schedule 不再有效时，系统必须阻止其启用或触发，并让用户与 operator 都能看到失败原因。
- 当用户通过自然语音发起 schedule 操作时，系统按与文本相同的业务语义处理，但不要求保留原始音频作为 schedule 定义的一部分。
- 当 `carvis-schedule` 调用失败、命令不可执行、超时或 gateway 调用失败时，系统必须把这次 schedule 管理尝试作为一次明确失败返回给用户，并保留 operator 可见的失败记录。
- 当出站投递重试耗尽时，用户可能收不到终态摘要，但 operator 与后续查询结果仍必须能区分“run 成功”与“delivery 失败”。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 支持由 Codex 代表当前 chat 在当前绑定 workspace 内创建新的 schedule definition，并让该 definition 成为既有 scheduler 可以调度的正式自动化入口。
- **FR-002**: System MUST 在用户表达出明确 schedule 意图时默认直接创建 schedule definition，而不是强制二次确认。
- **FR-003**: System MUST 仅允许 Codex 在当前 chat 已绑定的 workspace 范围内创建、查询、修改或取消 schedule；v1 MUST NOT 允许通过同一聊天直接跨 workspace 管理任务。
- **FR-004**: System MUST 提供统一的 `carvis-schedule` CLI contract，使 Codex 能执行 `create`、`list`、`update`、`disable`、`enable` 这几类 schedule 管理动作；该 CLI MUST 成为 agent 侧唯一允许修改 schedule durable state 的执行入口。
- **FR-005**: System MUST 让 `carvis-schedule` CLI 仅作为 gateway 内部 schedule 管理 route 的 shell facade；CLI MUST NOT 直接写数据库、Redis、definition override 或 management action，真正业务写入 MUST 仍由 gateway 执行。
- **FR-006**: System MUST 提供一层显式的、可安装的 schedule management skill package，用于约束 agent 在何时调用 `carvis-schedule`、何时要求澄清、何时拒绝；是否调用 CLI 的判断 MUST 由 agent 基于用户请求自主完成，而不是由 gateway 侧启发式 intent detector 预先决定是否暴露这些能力；skill MUST NOT 直接修改 schedule durable state。
- **FR-006A**: System MUST 让 `carvis-schedule` 在普通 agent 调用路径下从当前 `Codex` 运行时自动解析 workspace、chat/session、trigger user 和原始用户请求等上下文，并由 gateway 继续做最终校验；显式 CLI flags 仅用于调试、测试或人工排障，系统 MUST NOT 要求 agent 在 prompt 中手工拼接这些运行时参数，也 MUST NOT 依赖 external `MCP` server env 作为主接线方式。
- **FR-007**: System MUST 让 agent 创建的 schedule definition 与配置来源的 definition 明确区分，并保证配置同步流程不会隐式覆盖、删除或停用 agent 创建的 definition；同时，Codex 在当前 workspace 内 MUST 能查询、修改或停用这两类来源的 definition。
- **FR-008**: System MUST 让用户通过自然语言或自然语音表达日常的重复时间意图，例如每日、每周、每几小时或每几分钟，并将其转成当前调度器支持的 schedule 定义；对于超出当前调度能力的表达，系统 MUST 明确拒绝。
- **FR-009**: System MUST 在创建 schedule 时记录固定 workspace、固定任务描述、计划规则、启用状态以及来源于当前聊天的创建上下文，使后续执行和查询都能追溯来源。
- **FR-010**: System MUST 让用户查询当前 workspace 的 schedule 列表，并返回每条 definition 的名称或描述、启用状态、下一次计划时间以及最近一次执行结果摘要。
- **FR-011**: System MUST 在修改请求唯一匹配到当前 workspace 中某个 definition 时直接更新其 schedule 或任务描述，同时保留该 definition 的历史 trigger execution 和 run 记录；update MUST NOT 隐式启用已停用 schedule。
- **FR-012**: System MUST 在取消请求唯一匹配到当前 workspace 中某个 definition 时停用该 definition，而不是删除其历史记录。
- **FR-012A**: System MUST 在启用请求唯一匹配到当前 workspace 中某个 definition 时启用该 definition，而不是要求用户重新创建；启用必须 durable 化并进入 effective model。
- **FR-013**: System MUST 在修改或取消请求匹配到多个可能 definition 时要求用户澄清目标，而不是自动猜测或批量处理。
- **FR-014**: System MUST 在修改或取消请求没有匹配目标时明确告知未找到可操作的 schedule，而不是默默忽略或误操作其他 definition。
- **FR-015**: System MUST 让所有由 agent 创建或更新的 schedule definition 在到达计划时点后继续复用既有 `scheduler -> trigger execution -> run -> outbound` 主链路，而不是走单独的快捷执行路径。
- **FR-016**: System MUST 让 agent 管理的 schedule run 继续遵守现有单 workspace 单活动运行、FIFO 队列、显式锁、取消、超时和 heartbeat 规则。
- **FR-017**: System MUST 让用户和 operator 都能从持久化状态中反查某条 schedule definition 是由哪个 chat/workspace 上下文发起、最近触发了哪些 executions、以及这些 executions 对应的 run 与 delivery 结果。
- **FR-018**: System MUST 在 schedule 创建、修改、停用和查询过程中保留清晰的 operator-visible 审计记录与状态变化，使 operator 能通过统一查询面判断 agent 是否正确管理了定时任务。
- **FR-019**: System MUST 在当前 chat 未绑定 workspace、schedule 请求信息不足、时间表达无法落入支持范围、目标 definition 不唯一或 `carvis-schedule` 调用失败时，返回清晰且可执行的澄清或拒绝信息。
- **FR-020**: System MUST 让 agent 在成功或失败的 `carvis-schedule` 调用之后继续形成用户可读的最终答复，而不是把 CLI 输出直接等同于最终用户回复。
- **FR-021**: System MUST 在 executor / bridge 启动期执行一次 `carvis-schedule` readiness probe；若当前 `Codex` runtime 无法执行该 CLI，系统 MUST 显式进入 `CODEX_UNAVAILABLE` 或等价失败状态，而不是继续运行并让 agent 在对话中声称命令不存在。
- **FR-022**: System MUST 为 `carvis-schedule` 定义稳定的参数、stdout JSON 与 exit code 契约，使 agent、测试和 operator 能以一致方式解释 `executed`、`needs_clarification`、`rejected` 与 transport/internal failure。

### 假设与依赖

- **A-001**: 自然语音输入在进入 schedule 识别前，已经能够作为与普通文本等价的聊天语义被系统处理。
- **A-002**: v1 的自然语言调度只覆盖当前 scheduler 已支持的重复时间模式，不引入秒级触发或复杂日历规则。
- **A-003**: 默认直接创建只适用于“明确的创建意图”；对信息不足、目标不唯一或 `carvis-schedule` 不可用的修改、取消请求仍然允许要求澄清或拒绝。
- **A-004**: operator 仍然可以通过既有配置来源维护部分 schedule definitions；本轮不要求统一成单一来源，也不要求交付图形化编辑器。
- **A-005**: 尽管 definition 可以来自配置来源或 agent 来源，v1 允许 Codex 在当前 workspace 内对两类 definition 执行相同的查询、修改和停用动作。
- **A-006**: v1 的 skill 主要用于 CLI 调用策略与澄清约束；普通非 schedule 对话仍然按既有 chat run 处理，但前提是宿主 `Codex` 环境已经可以执行 `carvis-schedule`。
- **A-007**: `Codex` 所在宿主的 shell command 能力由宿主提供；Carvis v1 通过启动期 CLI probe 和显式失败来界定支持边界。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 让 operator 在统一查询面中区分 schedule definition 的来源、启用状态、当前 workspace、最近一次变更动作以及最近一次执行结果，并能看出某条 `config` 来源 definition 是否曾被 Codex 修改或停用。
- **OR-002**: System MUST 让 operator 能够区分“schedule 已成功创建或更新”“schedule 请求因澄清不足被拒绝”“schedule 已停用”“schedule 触发后的 run 失败”这几类不同状态。
- **OR-003**: System MUST 为 agent 管理 schedule 的创建、查询、修改和停用动作保留结构化日志与持久化审计记录，并与后续 trigger execution、run、delivery 结果可关联，以支撑告警、排障和 runbook 操作。
- **OR-004**: System MUST 保持 agent 管理 schedule 触发后的 queue、lock、cancel、timeout、heartbeat 和 outbound retry 语义与现有非聊天 trigger 一致。
- **OR-005**: System MUST 让 operator 从持久化状态中区分“definition 管理成功但执行失败”“run 成功但 delivery 失败”“schedule 因目标不唯一而未变更”这些不同结论。
- **OR-006**: System MUST 让 operator 能区分“当前轮次未调用 schedule CLI”“CLI 调用被 gateway 拒绝”“CLI 调用失败”“CLI 执行成功但后续 run 失败”这几类不同状态；这种区分 MUST 基于持久化的 tool-call / management audit / run 状态投影，而不是仅依赖终态聊天文案推断。
- **OR-007**: System MUST 让 operator 能区分“CLI 未安装或不可执行”“CLI 已执行但 gateway 不可达”“CLI 调用已到达 gateway 但被拒绝”这几类不同安装/接线失败状态。

### 关键实体 *(涉及数据时填写)*

- **ManagedScheduleDefinition**: 由配置来源或 agent 来源维护的定时任务定义，表示固定 workspace 中的一条可启用、可停用、可查询的自动化入口。
- **ScheduleManagementAction**: 一次由当前 chat 发起的创建、查询、修改或停用动作，用于表达用户意图、管理结果和审计上下文。
- **ScheduleCliInvocation**: agent 在 `Codex` shell 环境中对 `carvis-schedule` 发起的一次结构化命令调用，携带 `create`、`list`、`update`、`disable` 或 `enable` 请求。
- **ScheduleCliResult**: `carvis-schedule` 对一次命令调用输出的结构化结果，表达 `executed`、`needs_clarification` 或 `rejected`，并驱动后续用户反馈与 operator 审计。
- **ScheduleManagementSkill**: 约束 agent 在自然语言或自然语音场景下何时调用 `carvis-schedule`、何时澄清、何时拒绝的策略层。
- **ScheduleCliFacade**: Carvis 提供给 agent 的本地 `carvis-schedule` CLI，可从当前运行时自动解析上下文并调用 gateway 的内部执行面，但不持有 durable 写规则。
- **ScheduleToolAudit**: 由 tool call、tool result、management action 和后续 run 状态共同投影出的审计视图，用于区分 schedule CLI 未调用、被拒绝、调用失败、管理成功及后续执行/投递失败。
- **TriggerExecution**: 某条 ManagedScheduleDefinition 在计划时点产生的一次实际触发记录，用于连接 definition、run 和 delivery 结果。
- **Run / OutboundDelivery / WorkspaceBinding**: 复用现有规范实体来表达执行生命周期、结果投递和聊天到 workspace 的作用域约束。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 在验收 quickstart 与对应集成测试中，明确的 schedule 创建意图都能在单轮对话内通过 `carvis-schedule create` 成功创建当前 workspace 的 schedule definition，无需修改配置文件。
- **SC-002**: 100% 的 agent 创建 schedule 都会在后续计划时点进入既有 scheduler workflow，并继续遵守单 workspace 单活动运行与 FIFO 队列约束。
- **SC-003**: 100% 的 schedule 查询结果都只包含当前 chat 已绑定 workspace 的 definitions，不会泄露其他 workspace 的任务。
- **SC-004**: 100% 的歧义修改或取消请求都会在实际变更前要求澄清，而不是误改或误停其他 schedule definition。
- **SC-005**: 在 skill contract、chat integration 和未绑定 workspace 覆盖中，明确 schedule 管理意图会被正确引导到匹配的 CLI 调用，而普通非 schedule 对话不会因为这些命令可用而被错误调用。
- **SC-006**: Operator 对任意一条 agent 管理的 schedule definition，都能在不登录宿主机的前提下判断其来源、当前启用状态、最近一次执行结果以及关联 run 和 delivery 结果。
- **SC-007**: 100% 的不受支持时间表达、缺少 workspace 上下文、信息不足或 `carvis-schedule` 调用失败的 schedule 请求，都会返回明确可执行的澄清或拒绝结果，而不是创建含糊或不可执行的任务。
