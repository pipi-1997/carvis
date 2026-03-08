# 功能规格说明：本地运行时接入

**功能分支**: `002-local-runtime-wiring`
**创建日期**: 2026-03-08
**状态**: 草稿
**输入**: 用户描述："让 Feishu + Codex MVP 支持本地单机双进程真实联调：gateway 和 executor 分别启动，读取同一份本地配置，连接真实 Postgres / Redis，并可接收真实 Feishu 入站事件。结构化运行配置放 ~/.carvis/config.json，敏感信息与连接信息放环境变量。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu（websocket）
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, queueing, executor, outbound delivery
- **运维影响**: locks, queueing, retries, notifications, admin visibility
- **范围外内容**: Docker Compose、systemd 或 launchd 配置、Feishu webhook 接入、反向代理与 HTTPS 自动化、多 agent 管理、多 workspace 运行时切换、云部署说明、admin UI 扩展

## 用户场景与测试 *(必填)*

### 用户故事 1 - 启动本地 gateway（优先级：P1）

作为本地运行 Carvis 的工程师，我希望在准备好本地配置和环境变量后能直接启动 `gateway` 进程，并暴露健康检查地址以及 Feishu `websocket` 接入所需的就绪状态，这样我才能把飞书事件真正接入本机运行时。

**优先级原因**: 没有真实启动的入站服务，就无法进行任何后续联调；这是本轮本地可用性的第一前提。

**独立验证方式**: 准备本地配置、环境变量和依赖服务后，启动 `gateway` 进程，并通过健康检查地址以及一次真实 Feishu 入站事件验证它已完成配置加载、入站校验和会话路由准备。

**验收场景**:

1. **Given** 本地配置文件和必要环境变量齐备，**When** 用户启动 `gateway` 进程，**Then** 系统成功监听 HTTP 地址，并暴露可访问的健康检查端点。
2. **Given** 飞书应用凭据有效，**When** `gateway` 进程启动完成，**Then** 系统建立真实 `websocket` 长连接并将入站事件进入正常路由流程。
3. **Given** 本地配置缺失或环境变量不完整，**When** 用户尝试启动 `gateway`，**Then** 系统拒绝启动并返回明确错误，而不是静默进入不可用状态。

---

### 用户故事 2 - 启动本地 executor（优先级：P1）

作为本地运行 Carvis 的工程师，我希望单独启动 `executor` 进程，并让它连接真实 Postgres、Redis 和本机 Codex CLI，这样它能持续消费任务并完成真实执行。

**优先级原因**: 即使入站服务可用，没有独立运行的执行器也无法完成真实端到端联调。

**独立验证方式**: 在本地配置和依赖服务准备完毕的前提下启动 `executor`，确认它成功连接协调与持久化依赖、进入消费循环，并能对真实排队任务作出响应。

**验收场景**:

1. **Given** 本地配置、数据库、缓存和 Codex CLI 都可用，**When** 用户启动 `executor`，**Then** 系统进入可持续运行的消费状态，并记录启动成功的运维可见状态。
2. **Given** Redis 或 Postgres 不可用，**When** 用户尝试启动 `executor`，**Then** 系统拒绝进入消费状态，并暴露明确失败原因。
3. **Given** `executor` 正在运行，**When** 真实任务被写入队列，**Then** 系统获取工作区锁、执行任务并保持运行状态可查询。

---

### 用户故事 3 - 完成本地真实联调（优先级：P2）

作为本地运行 Carvis 的工程师，我希望在本机准备好 Feishu、Postgres、Redis、Codex CLI 和配置后，能够通过飞书真实发送消息并看到完整运行结果，这样我可以确认系统已经具备本地可用性。

**优先级原因**: 这是本轮工作的最终交付结果，但它建立在两个进程已能分别稳定启动的前提上。

**独立验证方式**: 按 quickstart 在本地分别启动 `gateway` 和 `executor`，再从真实飞书会话发送普通消息、`/status` 和 `/abort`，验证端到端链路可用。

**验收场景**:

1. **Given** 本地 `gateway` 与 `executor` 已启动且外部依赖可用，**When** 用户在真实飞书会话中发送普通消息，**Then** 系统完成入站、排队、执行和结果回推的完整闭环。
2. **Given** 端到端链路已工作，**When** 用户发送 `/status` 或 `/abort`，**Then** 系统返回与持久化状态一致的真实结果。

### 边界与异常场景

- 当 `~/.carvis/config.json` 不存在、内容不合法或与环境变量冲突时，系统必须拒绝启动并指出具体配置问题。
- 当飞书应用凭据缺失、权限不足或 `websocket` 握手失败时，系统必须拒绝声明 Feishu 入站已就绪，并暴露明确失败原因。
- 当 `executor` 连接到 Redis 或 Postgres 失败时，系统必须拒绝进入消费循环，并保留清晰的启动失败状态。
- 当 `gateway` 和 `executor` 使用了不一致的本地配置时，系统必须将其标记为 `CONFIG_DRIFT`，并阻止 `executor` 继续进入或保持 `consumer_active` 状态。
- 当本地 Codex CLI 不可执行或权限不足时，系统必须在真实联调中返回明确失败结果，并保持 run 状态可查询。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 支持用户在本地单机环境分别启动 `gateway` 和 `executor` 两个独立进程，而不是要求单进程合并运行。
- **FR-002**: System MUST 从 `~/.carvis/config.json` 读取结构化运行配置，并对缺失、冲突或非法配置给出明确启动失败结果。
- **FR-003**: System MUST 从环境变量读取敏感信息和环境相关连接信息，并在缺失时阻止对应进程进入“看似可用”的状态。
- **FR-004**: System MUST 在 `gateway` 启动后暴露可访问的健康检查端点，并明确表示 Feishu `websocket` 入站是否已准备就绪以及导致未就绪的原因。
- **FR-005**: System MUST 让 `gateway` 使用真实 Feishu `websocket` 长连接接收入站事件，并在完成校验后将合法请求路由到既有会话与运行路径。
- **FR-006**: System MUST 让 `executor` 连接真实持久化与协调依赖，并在启动成功后持续消费运行任务。
- **FR-007**: System MUST 在本地运行模式下保持既有的单工作区单活动运行、FIFO 队列、取消、超时和 heartbeat 失效语义不变。
- **FR-008**: System MUST 在真实联调中维持普通消息、`/status` 和 `/abort` 三条已定义交互路径的一致行为。
- **FR-009**: System MUST 在任一关键依赖不可用时提供明确启动或运行失败结果，并保留 operator-visible 状态与原因。
- **FR-010**: Users MUST be able to 按 quickstart 完成本地准备、双进程启动和一次真实飞书端到端联调，而无需修改源代码。
- **FR-011**: System MUST 为 `gateway` 和 `executor` 计算并暴露同一套 runtime fingerprint，使操作者能够识别 agent、workspace、Feishu `websocket` 配置和依赖目标不一致造成的配置漂移。
- **FR-012**: System MUST 在检测到 `CONFIG_DRIFT` 时，让 `gateway` 的健康状态返回 `ready = false` 且包含明确错误码，并让 `executor` 输出 `CONFIG_DRIFT` 结构化状态事件且拒绝进入 `consumer_active = true`。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 明确暴露本地 `gateway` 与 `executor` 的启动成功、启动失败、依赖连接状态和健康检查结果；其中 `gateway` 通过 HTTP 健康检查暴露状态，`executor` 通过结构化启动报告与运行状态日志暴露状态。
- **OR-002**: System MUST 在本地运行模式下保留现有 cancel、timeout、retry、delivery failure 和 heartbeat expiry 的运维可见状态。
- **OR-003**: System MUST 让操作者能够区分配置错误、依赖连接失败、Feishu `websocket` 鉴权或握手失败、Codex CLI 不可用和正常运行中断这几类问题。
- **OR-004**: System MUST 为 Feishu `websocket` adapter 提供可验证的握手、过滤和归一化契约，以便 adapter 变更仍能保持边界稳定。

### 关键实体 *(涉及数据时填写)*

- **RuntimeConfig**: 本地单机运行时所需的结构化配置视图，包含 agent 固定配置及进程级运行参数。
- **FeishuConnectionConfig**: Feishu `websocket` 入站与最小接入策略的配置视图。
- **GatewayRuntimeState**: `gateway` 启动后对外暴露的健康、配置校验和 Feishu 入站就绪状态。
- **ExecutorRuntimeState**: `executor` 启动后对外暴露的依赖连接、消费循环和运行中断状态。
- **RuntimeFingerprint**: 由共享配置与环境派生出的稳定摘要，用于识别 `gateway` / `executor` 的配置漂移。
- **Session / Run / RunEvent / OutboundDelivery**: 继续沿用既有执行闭环实体，但在本轮中必须通过真实本地运行时接入。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 用户在本地准备好配置与依赖后，可在 10 分钟内分别启动 `gateway` 和 `executor`，且两个进程都进入可用状态。
- **SC-002**: `gateway` 在启动后的 5 秒内能够返回健康检查结果，并明确指示 Feishu `websocket` 入站是否已准备就绪以及未就绪原因。
- **SC-003**: `executor` 在启动后的 10 秒内能够明确暴露依赖连接成功或失败结果，而不是停留在不确定状态。
- **SC-004**: 用户可在一次本地真实联调中，从飞书发送普通消息并在同一会话收到完整运行结果，无需访问源代码或手工注入任务。
- **SC-005**: 当配置错误、依赖缺失、`CONFIG_DRIFT`、Feishu `websocket` 鉴权或握手失败或 Codex CLI 不可用时，操作者可在 2 分钟内从进程输出、健康状态或持久化状态判断失败原因。
