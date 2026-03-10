# 功能规格说明：调度器与外部 Webhook 触发

**功能分支**: `006-scheduler-external-webhooks`
**创建日期**: 2026-03-10
**状态**: 草稿
**输入**: 用户描述："实现调度器与外部 Webhook 触发机制：v1 支持预定义 scheduled jobs 和预注册 external webhooks 作为非聊天触发源，统一进入现有 gateway -> queue -> executor -> outbound 执行链路，复用 workspace 锁 / FIFO / heartbeat / 持久化 / 运维可见状态；external webhook 只允许命中预先配置好的 trigger 定义，由固定模板生成运行请求，外部 payload 仅作为参数注入，不允许直接提交任意 prompt。"

## 系统影响 *(必填)*

- **受影响渠道**: Scheduler、External Webhook、Feishu、Admin UI
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, queueing, executor, outbound delivery, admin UI
- **运维影响**: locks, queueing, retries, notifications, admin visibility
- **范围外内容**: 任意 prompt webhook、由 payload 动态切换 workspace 或 agent、错过计划窗口后的自动补跑、trigger 配置的 admin UI 编辑器、跨渠道共享会话记忆、多 bridge 并行选择

## 用户场景与测试 *(必填)*

### 用户故事 1 - 按计划自动运行（优先级：P1）

作为维护内部自动化的 operator，我希望把一个预定义任务绑定到固定 workspace、固定运行模板和固定执行时点，让 Carvis 在没有聊天消息的情况下自动发起运行，并在需要时把结果发送到预设目标，这样我可以把巡检、日报或定时分析任务稳定托管给同一套运行时。

**优先级原因**: `Scheduler` 是计划中已经承诺的 v1 触发源；如果它不能独立触发并复用现有队列/锁语义，非聊天触发能力仍然是不完整的。

**独立验证方式**: 配置一个已启用的 scheduled job，绑定固定 workspace、固定任务模板和可选结果投递目标；等待计划时间到达，验证系统自动创建 trigger execution、生成 run、进入现有队列/执行链路，并在完成后留下可审计结果。

**验收场景**:

1. **Given** 一个已启用的 scheduled job 绑定到现有 workspace 和固定任务模板，**When** 到达计划触发时点，**Then** 系统必须自动创建一次 trigger execution，并生成对应 run 进入既有执行链路。
2. **Given** 该 workspace 已经存在一个活动运行，**When** scheduled job 到达下一次触发时点，**Then** 新 run 必须进入同一 workspace 的 FIFO 队列，而不是抢占当前活动运行。
3. **Given** scheduled job 配置了结果投递目标，**When** 本次 run 终态完成，**Then** 系统必须将终态摘要发送到该目标，或在投递失败时保留清晰的 delivery failure 记录。

---

### 用户故事 2 - 外部事件触发预定义任务（优先级：P1）

作为外部系统的集成方，我希望通过一个预先登记好的 webhook 定义触发 Carvis 执行固定任务，并把事件 payload 作为受控参数填进模板，而不是直接传任意 prompt，这样我可以把构建失败、部署完成、告警升级等事件安全地接入现有运行体系。

**优先级原因**: `External Webhook` 是与 `Scheduler` 并列的核心触发能力；如果 webhook 只能靠自由文本 prompt 工作，v1 的安全边界和运维边界都会失控。

**独立验证方式**: 注册一个 webhook 定义，为其设置固定 workspace、固定任务模板、鉴权规则和允许接收的 payload 字段；发送合法与非法请求，验证只有合法请求会被接受并异步创建 run，且 payload 只能作为模板变量使用。

**验收场景**:

1. **Given** 一个已启用且预注册的 webhook 定义，**When** 外部系统发送通过鉴权校验的合法请求，**Then** 系统必须立即返回已接受结果，并异步创建 trigger execution 和 run。
2. **Given** webhook 定义要求 `event_type` 和 `summary` 两个字段，**When** 外部系统发送缺少必填字段或字段值无效的请求，**Then** 系统必须拒绝该请求，并且不得创建 run。
3. **Given** webhook 请求通过了鉴权校验，**When** 系统生成最终 run request，**Then** run 使用的 workspace、agent 和任务模板必须来自预定义 trigger，而不是由外部 payload 覆盖。
4. **Given** 外部系统请求命中了未知 webhook、已禁用 webhook 或鉴权失败的 webhook，**When** 请求到达 gateway，**Then** 系统必须拒绝该请求、保留审计记录，并且不得进入 executor。

---

### 用户故事 3 - 触发状态可见且可控（优先级：P2）

作为维护运行时的 operator，我希望清楚知道每个 scheduled job 或 webhook definition 当前是否启用、最近一次有没有触发成功、下一次会不会再触发、对应 run 和消息投递结果如何，这样我无需登录宿主机也能判断自动化入口是否健康。

**优先级原因**: 非聊天触发一旦失败，往往没有发起人主动追问；没有 operator-visible 状态，这类功能在真实环境里很快会变成黑盒。

**独立验证方式**: 创建启用、禁用、执行成功、执行失败和投递失败的 trigger 样本，验证 operator 能从 gateway 的内部管理查询面或等价持久化视图中区分 definition 状态、trigger execution 状态、run 结果和 delivery 结果。

**验收场景**:

1. **Given** 一个 trigger definition 被 operator 禁用，**When** 到达计划时点或收到匹配 webhook 请求，**Then** 系统不得创建 run，并且 operator 能看到这次触发为何被拒绝或跳过。
2. **Given** gateway 或 scheduler 在某个计划窗口不可用，**When** 系统恢复后继续工作，**Then** operator 能看到该窗口被记录为 missed 或 skipped，且系统只继续等待下一次未来触发时点，而不是自动补跑历史窗口。
3. **Given** 某次 trigger run 已经成功完成，但结果投递失败，**When** operator 查看该次 trigger execution，**Then** 必须能同时看到“run 已成功”和“delivery 失败”这两个不同结论。
4. **Given** 某次 non-chat trigger run 因 heartbeat 丢失而被 reaper 判定失效，**When** operator 查看该次 trigger execution，**Then** 必须能看到 `heartbeat_expired` 或等价失败原因，以及它与 delivery 状态的独立关系。

### 边界与异常场景

- 当同一 workspace 已经有一个活动运行时，新的 scheduled job 或 webhook run 必须进入既有 FIFO 队列，不得绕过锁和串行化规则。
- 当 executor 心跳丢失、Codex 进程异常退出或 run 超时时，trigger execution 必须保留失败结果，并且 definition 的启用状态不得被隐式修改。
- 当 scheduled job 到达计划窗口时 definition 已被禁用，系统必须把本次触发记录为 skipped 或等价的 operator-visible 结果，而不是静默忽略。
- 当 gateway、scheduler 或 webhook ingress 在计划窗口不可用时，系统必须记录 missed 窗口；v1 不自动补跑停机期间错过的历史窗口。
- 当 webhook 请求命中未知定义、定义已禁用、鉴权失败或 payload 缺少必填字段时，系统必须同步拒绝请求，并保留审计记录。
- 当 webhook 发送方重试同一个业务事件但没有提供可区分的事件身份时，v1 可以把每次合法请求都视为独立触发；系统不承诺对任意重复 payload 自动去重。
- 当 trigger definition 没有配置结果投递目标时，run 仍然必须执行并持久化结果，但不会凭空创建聊天会话或临时通知目标。
- 当出站投递重试耗尽时，用户侧可能看不到最终摘要，但 operator 必须仍能区分 run 成败与 delivery 成败。
- 当非聊天触发创建 run 时，系统不得默认复用任意飞书 `chat` 的 continuation；v1 中这些 run 必须以 fresh 语义执行。
- 当 operator 查询 definition 或 execution 状态时，系统必须通过基于 Postgres 的内部管理查询面或等价持久化视图返回结果，而不是要求登录宿主机读日志。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 支持由 operator 预定义并持久化管理的 trigger definition，至少区分 `scheduled job` 与 `external webhook` 两类 source，并为每条定义保存启用状态、固定 workspace、固定 agent、固定任务模板以及可选结果投递目标。
- **FR-002**: System MUST 在没有聊天消息的情况下，根据已启用的 scheduled job 自动创建 trigger execution，并将其转换为一次标准 run 请求。
- **FR-003**: System MUST 让 scheduled job 触发出的 run 复用既有的 `gateway -> queue -> executor -> outbound` 主链路，而不是实现旁路执行流程。
- **FR-004**: System MUST 对每条 scheduled job 记录最近一次触发结果、下一次计划触发时间以及最近一次 missed 或 skipped 结果，使 operator 可以判断调度器是否在按预期工作。
- **FR-005**: System MUST 在计划窗口被错过时把该窗口记录为 operator-visible 的 `missed` 或等价状态，并从下一次未来窗口继续；v1 MUST NOT 自动补跑历史窗口。
- **FR-006**: System MUST 只允许 external webhook 命中预先注册的 webhook definition；系统 MUST NOT 接受由外部请求直接提供的任意 prompt 作为运行输入。
- **FR-007**: System MUST 对 external webhook 执行定义级鉴权校验；对于未知定义、已禁用定义、鉴权失败或 payload 校验失败的请求，系统 MUST 同步拒绝，并且不得创建 run。
- **FR-008**: System MUST 仅将 webhook payload 作为预定义任务模板的参数输入；payload MUST NOT 覆盖或动态改变 definition 绑定的 workspace、agent、触发目标或启用状态。
- **FR-009**: System MUST 对每一次合法 webhook 请求返回同步的接受结果，对每一次非法请求返回同步的拒绝结果；实际 run 执行结果继续通过异步运行链路产生。
- **FR-010**: System MUST 让每一次 scheduler 或 webhook 触发都生成可持久化追踪的 trigger execution，并把 source type、definition 标识、请求时间、输入摘要和最终 run 结果关联起来。
- **FR-011**: System MUST 允许 trigger definition 配置“有结果投递目标”或“无结果投递目标”两种模式；当配置了投递目标时，run 终态摘要必须走既有 outbound delivery 语义；未配置时，结果仍必须对 operator 可见。
- **FR-012**: System MUST 允许 operator 在不删除历史记录的前提下启用或禁用任意 trigger definition，并让 scheduled job 与 external webhook 都遵守该启用状态。
- **FR-013**: System MUST 让所有由 trigger definition 触发的 run 继续遵守现有的单 workspace 单活动运行、FIFO 队列、显式锁、取消、超时与 heartbeat 规则。
- **FR-014**: System MUST 为每个非聊天触发 run 记录明确的 trigger source 元数据，并让 operator 能从 run 结果反查到来源 definition 与 execution。
- **FR-015**: System MUST 让 scheduler 与 webhook 触发出的 run 默认以 fresh 语义执行；v1 MUST NOT 默认复用任何聊天会话的 continuation memory。
- **FR-016**: System MUST 在 trigger definition 缺少可用 workspace、目标 workspace 不可访问或固定任务模板不可解析时拒绝启用或拒绝触发，并返回清晰失败原因。
- **FR-017**: System MUST 提供基于 Postgres 持久化状态的最小内部管理查询面或等价 read model，使 operator 能查询 trigger definition、trigger execution、关联 run 和 delivery 的当前状态与最近结果，而无需登录宿主机。

### 假设与依赖

- **A-001**: v1 的 trigger definition 由 operator 预先登记和维护；本轮不要求交付专门的 admin UI 编辑器。
- **A-002**: 每条 trigger definition 绑定到一个已存在的受管 workspace 和固定 agent；v1 不要求由 scheduled job 或 webhook 自动创建 workspace。
- **A-003**: external webhook 首版只接收结构化字段作为模板变量；本轮不要求支持文件上传、二进制附件或流式请求体。
- **A-004**: 结果投递目标可以为空；当为空时，operator 依赖持久化状态和管理视图判断 run 结果。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 为 trigger definition 暴露至少 `enabled`、`disabled`、`last_triggered`、`next_due`、`missed/skipped` 这些 operator-visible 状态或等价信息。
- **OR-002**: System MUST 为 trigger execution 暴露至少 `accepted`、`rejected`、`queued`、`running`、`completed`、`failed`、`cancelled`、`delivery_failed` 这些 operator-visible 状态或等价信息，并可追溯到对应 run。
- **OR-003**: System MUST 明确定义 scheduler、webhook ingress、queue、lock、heartbeat、cancel、timeout 与 outbound retry 在本功能中的日志与状态迁移语义。
- **OR-004**: System MUST 让 operator 无需登录执行宿主机，即可从持久化状态或等价管理视图区分“触发未发生”“触发被拒绝”“run 失败”“结果投递失败”这四类不同问题。
- **OR-005**: System MUST 在同一 operator 查询面与结构化日志中暴露 `heartbeat_expired`、timeout、cancel 等 trigger run 失败细节，并保持它们与 `delivery_failed` 状态分离。

### 关键实体 *(涉及数据时填写)*

- **TriggerDefinition**: 一条可被启用或禁用的自动化入口定义，描述 source type、固定 workspace、固定 agent、固定任务模板、鉴权规则和可选结果投递目标。
- **ScheduledJob**: 一类 TriggerDefinition，额外携带计划触发规则、最近一次触发结果和下一次计划触发信息。
- **ExternalWebhookDefinition**: 一类 TriggerDefinition，额外携带外部入口标识、鉴权要求和允许接收的 payload 字段约束。
- **TriggerExecution**: 一次实际触发记录，表示某个 schedule 窗口或 webhook 请求是否被接受、拒绝、跳过或执行，以及它关联的 run 与 delivery 结果。
- **Run / RunEvent / OutboundDelivery**: 复用现有规范运行实体来表达执行生命周期、终态结果和消息投递审计，不因 trigger source 改变其核心语义。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 100% 的已启用 scheduled job 都能在其计划时点附近自动创建 trigger execution，并在 1 分钟内进入 `queued` 或 `running` 状态，无需任何聊天消息。
- **SC-002**: 100% 的 unknown、disabled、鉴权失败或 payload 非法的 webhook 请求都会在创建 run 之前被拒绝，并留下可审计记录。
- **SC-003**: 100% 的 scheduler 和 webhook run 在目标 workspace 已忙时都遵守现有 FIFO 队列与单活动运行约束，不会绕过锁语义。
- **SC-004**: Operator 对任意一次 trigger execution 都能在不登录宿主机的前提下判断其 definition 来源、run 结果和 delivery 结果。
- **SC-005**: 100% 的 webhook 触发 run 都使用预定义 definition 绑定的 workspace、agent 与任务模板；外部 payload 不能把它们改写成其他目标。
- **SC-006**: 95% 的 external webhook 请求都能在 2 秒内返回 accepted 或 rejected 结果，并把实际执行继续交给异步运行链路。
