# 功能规格说明：Carvis Onboard CLI

**功能分支**: `013-carvis-onboard-cli`
**创建日期**: 2026-03-15
**状态**: 草稿
**输入**: 用户描述："考虑给这个项目配置一键配置的 cli，参考 openclaw 和 copaw；最简配置起码能跑起来；需要 `start` 和 `stop`，适配器例如飞书需要引导式选择并输入必要配置，飞书配置引导能力可考虑集成到飞书适配器内；使用 git worktree 和 spec kit。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu
- **受影响桥接器**: Codex
- **受影响执行路径**: runtime bootstrap, gateway startup, executor startup, operator control path
- **运维影响**: startup, shutdown, readiness, logs, status visibility, local operator workflow
- **范围外内容**: Docker-first 部署路径、Web UI onboarding、`carvis-schedule` 合并进总入口 CLI、非 Feishu 渠道的真实接入实现

## 用户场景与测试 *(必填)*

### 用户故事 1 - 首次引导后系统能真正跑起来（优先级：P1）

作为第一次安装 `carvis` 的操作者，我希望通过一个引导式命令完成飞书接入和本地运行依赖配置，并在流程结束后直接把系统启动到可用状态，这样我不需要手工编辑隐藏文件或分别敲两个进程的启动命令。

**优先级原因**: 这是本功能的最小闭环；如果 `onboard` 结束后系统仍然不能运行，就没有解决用户当前最痛的问题。

**独立验证方式**: 在一台只有仓库代码、`codex` CLI、Postgres、Redis、Feishu 应用配置的机器上，仅执行 `carvis onboard`，确认流程结束后 `gateway` 与 `executor` 均进入可用状态。

**验收场景**:

1. **Given** 当前机器尚未存在 `carvis` 本地配置，**When** 操作者执行 `carvis onboard` 并完成飞书与依赖信息录入，**Then** 系统会生成所需配置并自动启动本地 runtime。
2. **Given** `carvis onboard` 收集到的输入足以支持启动，**When** 引导流程完成，**Then** 操作者无需再手工执行额外启动命令即可获得可用实例，其中“可用”明确定义为 `gateway /healthz` 返回 `ready = true` 且 executor startup report 为 `ready`。
3. **Given** 操作者在交互式终端执行 `carvis onboard`，**When** CLI 进入引导流程，**Then** 它必须以向导式交互逐步收集配置，而不是要求用户记忆命令参数或阅读 JSON 输出。

---

### 用户故事 2 - 通过单一 CLI 运维本地 runtime（优先级：P1）

作为本地运行 `carvis` 的操作者，我希望通过统一的 `start`、`stop`、`status` 和 `doctor` 命令管理本地实例，这样我可以明确知道系统是否真的 ready，而不是只看到进程还活着。

**优先级原因**: 一键配置之后的日常运维频率最高；如果缺少稳定的启停、状态和诊断路径，首轮 onboarding 的价值会迅速下降。

**独立验证方式**: 在已有配置的机器上依次执行 `carvis start`、`carvis status`、`carvis doctor`、`carvis stop`，确认每条命令都能稳定反映和控制系统状态。

**验收场景**:

1. **Given** 当前本地配置已存在且依赖可用，**When** 操作者执行 `carvis start`，**Then** 系统会启动 `gateway` 与 `executor` 并给出明确的 ready 或 failed 结论。
2. **Given** 当前进程已经存活但某一子系统未 ready，**When** 操作者执行 `carvis status`，**Then** 结果必须区分“进程存活”和“系统未 ready”。
3. **Given** 当前本地 runtime 正在运行，**When** 操作者执行 `carvis stop`，**Then** 系统必须安全停止相关进程并清理本地运行状态。

---

### 用户故事 3 - 飞书接入项有明确获取与校验指引（优先级：P2）

作为要把 `carvis` 接到飞书的操作者，我希望 CLI 能明确告诉我需要哪些飞书信息、去哪里获取、哪些值可以使用默认值，并在启动前提前验证凭据是否有效，这样我不会在启动时才碰到模糊错误。

**优先级原因**: 当前唯一真实接入渠道是 Feishu，且飞书配置错误会直接影响 `gateway` ready；没有清晰指引，首次引导的失败率会很高。

**独立验证方式**: 在未预先阅读项目文档的前提下，仅根据 CLI 提示完成飞书配置，并通过凭据校验拿到明确的成功或失败结果。

**验收场景**:

1. **Given** 操作者选择 Feishu 作为接入方式，**When** CLI 展示配置步骤，**Then** 它会按当前字段提供短提示，明确说明所需字段、默认值和获取方式，而不是默认整页输出全部说明。
2. **Given** 操作者输入了错误的飞书凭据，**When** CLI 执行校验，**Then** 它会在启动前返回明确错误，而不是让系统进入模糊的半启动状态。
3. **Given** 操作者此前没有阅读项目文档，**When** CLI 进入 Feishu 引导并逐项录入字段，**Then** 它必须在对应字段前给出所需准备方式，包括 App ID / App Secret、机器人能力、websocket/长连接事件接收，以及 `allowFrom` / `chat_id` 的获取或收敛方式。

---

### 用户故事 4 - 已有配置可被复用而不是被粗暴覆盖（优先级：P2）

作为已经运行过 `carvis` 的操作者，我希望在重新执行 `onboard` 或 `start` 时，系统能够检测并复用现有配置、识别陈旧状态、并提示我是否需要重配；如果我只想修改局部配置，也可以通过独立的 `configure` 路径完成，而不是每次都重新填完整配置。

**优先级原因**: 本地运维是持续行为；如果 CLI 不能处理已存在配置和残留状态，使用成本会随着时间快速升高。

**独立验证方式**: 在已有配置和旧 state 文件的机器上重新执行 `carvis onboard` 与 `carvis start`，确认系统会复用配置、清理 stale state，并阻止重复启动。

**验收场景**:

1. **Given** 当前已经存在可解析的本地配置，**When** 操作者重新执行 `carvis onboard`，**Then** CLI 必须优先提示复用或局部修改，而不是强制重填。
2. **Given** 当前只需要修改飞书或 workspace 段配置，**When** 操作者执行 `carvis configure`，**Then** 系统必须允许只更新对应 section，而不要求重走完整 onboarding。
3. **Given** 当前存在旧 pid/state 但实际进程已经退出，**When** 操作者执行 `carvis start`，**Then** 系统必须清理残留状态后继续启动，而不是永久卡住。

### 边界与异常场景

- 当 `codex` CLI 或 `carvis-schedule` CLI 不可执行时，系统必须在启动前或启动时给出明确错误，不得假装 ready。
- 当 Postgres 或 Redis 不可连接时，系统必须给出可诊断的失败结果，不得把配置写成功误导为系统已可运行。
- 当飞书凭据错误或 websocket 接入未 ready 时，系统必须把结果暴露为未就绪状态，而不是只显示 `gateway` 进程仍然存活。
- 当 `gateway` 已启动但 `executor` 启动失败时，系统必须把整体结果标记为失败或降级，并停止或清晰标注已启动的部分。
- 当操作者在已有活动进程的情况下再次执行 `carvis start` 时，系统必须阻止重复启动，避免制造多实例冲突。
- 当 `carvis stop` 遇到残留 state 或部分进程已退出时，系统必须尽可能完成清理，并明确指出未清理项。
- 当工作区中已有活动运行时，本功能不得改变现有 FIFO、单活动运行、锁、取消和 heartbeat 语义。
- 当出站投递失败、心跳过期或 `CONFIG_DRIFT` 出现时，本功能必须保留现有 operator-visible 行为，不得将其隐藏在 CLI 之下。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 提供一个面向操作者的总入口 CLI，用于执行首次引导和本地 runtime 运维。
- **FR-002**: Users MUST be able to 通过 `carvis onboard` 完成首次引导，并在同一流程中录入当前唯一真实支持的接入方式所需配置。
- **FR-003**: System MUST 在 `carvis onboard` 期间收集启动本地 runtime 所必需的信息，并对其进行校验后再写入本地配置。
- **FR-004**: System MUST 在首次引导完成后自动尝试启动本地 runtime，而不是仅生成配置文件后要求操作者继续手工执行多个命令。
- **FR-005**: System MUST 提供 `carvis start` 与 `carvis stop` 两个命令，用于启动和停止本地 runtime。
- **FR-006**: System MUST 提供 `carvis status`，并明确区分“进程活着”“系统 ready”“系统 degraded/failed”这几类状态。
- **FR-007**: System MUST 提供 `carvis doctor`，用于检查本地配置、运行依赖、飞书接入、Codex 可执行性和当前 runtime 就绪状态。
- **FR-008**: System MUST 在 CLI 结果中暴露 `gateway` 和 `executor` 的独立状态，而不是只给出单个模糊的总状态。
- **FR-009**: System MUST 在本地保存足够的运行状态信息，使 `status` 与 `stop` 能够在 CLI 重启后继续工作。
- **FR-010**: System MUST 在检测到已有活动进程时阻止重复启动，并在检测到陈旧运行状态时允许安全清理和恢复。
- **FR-011**: System MUST 让飞书适配器提供 adapter-owned 的 setup/doctor 信息，包括必填字段、默认值、获取指引、分步骤引导、`allowFrom` / `chat_id` 策略说明和输入校验。
- **FR-012**: System MUST 在当前仅支持 Feishu 的前提下，保留“选择接入适配器”的交互位置，以支撑未来增加其他 adapter。
- **FR-013**: System MUST 保持现有 `gateway`、`executor`、`ChannelAdapter`、`AgentBridge` 边界，不得把渠道业务逻辑或 bridge 逻辑搬进 CLI。
- **FR-014**: System MUST 保持现有 Postgres durable state、Redis coordination only、单 workspace 单活动运行、锁、队列、取消、timeout、heartbeat 语义不变。
- **FR-015**: System MUST 在本地运行 CLI 时支持优雅停止，避免 `stop` 变成无差别强杀导致的脏状态。
- **FR-016**: System MUST 提供 `carvis configure`，并至少支持 `feishu` 与 `workspace` 两个 section 的局部重配，而不要求重走完整 onboarding。
- **FR-017**: System MUST 在交互式终端中默认输出人类可读结果；结构化 JSON 输出只能在显式 `--json` 场景下启用。
- **FR-018**: System MUST 为 `onboard` 至少提供 `quickstart` 与 `manual` 两条交互流，以兼顾最简启动与高级配置。
- **FR-019**: System MUST 使用成熟的交互式 prompt runtime，而不是继续扩展手写 `readline` 选择器。
- **FR-020**: System MUST 将飞书引导默认收敛为字段级按需提示，并取消额外的“是否查看指引”前置提问；默认流程中不得一次性整页渲染全部说明。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 定义并输出本地 runtime 的 operator-visible 状态，包括 `gateway` 健康、`executor` startup report、ready/degraded/failed 结论，以及相关错误码。
- **OR-002**: System MUST 保持现有 `CONFIG_DRIFT`、Feishu websocket 未就绪、`CODEX_UNAVAILABLE`、依赖不可达等错误在 CLI 中可见且可解释。
- **OR-003**: System MUST 说明本功能不会改变 run lifecycle、workspace lock、queue、cancel、timeout、heartbeat、delivery retry 的既有语义。

### 关键实体 *(涉及数据时填写)*

- **Carvis CLI Configuration**: 表示操作者通过引导式 CLI 维护的本地运行配置，包括结构化运行配置和敏感环境变量。
- **Adapter Setup Contract**: 表示某个接入适配器对外声明的 setup/doctor 需求、默认值、校验规则和获取指引。
- **Local Runtime Process State**: 表示本地 `gateway` 与 `executor` 进程的 pid、角色、最近状态、日志路径和错误摘要。
- **Runtime Status Summary**: 表示 CLI 聚合出的本地 runtime 总体状态，用于 `status`、`doctor` 和启动收敛结果。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 新操作者无需手工编辑配置文件，即可在一次引导流程后把本地 runtime 启动到明确的 ready、degraded 或 failed 状态，其中 `ready` 明确定义为 `gateway /healthz.ready = true` 且 executor startup report `status = ready`。
- **SC-002**: `carvis status` 在 100% 的场景下都能区分“进程存活”和“系统 ready”。
- **SC-003**: `carvis stop` 在 100% 的正常停止场景下都不会留下活动 pid/state 伪影。
- **SC-004**: 飞书配置错误时，操作者可以在启动前或启动时获得明确错误，而不是依赖阅读运行日志猜测问题。
- **SC-004A**: 操作者即使未提前阅读文档，也能仅依赖 CLI 内嵌引导完成飞书接入准备，并知道 `App ID`、`App Secret`、机器人能力、websocket/长连接事件接收与 `allowFrom/chat_id` 应该去哪里准备。
- **SC-005**: 操作者无需 shell 级别手工排障，即可通过 `status` 或 `doctor` 判断 `gateway`、`executor`、Feishu、Codex、Postgres、Redis 中哪一环导致系统不可用。
