# 功能规格说明：Carvis 托管式本地部署

**功能分支**: `016-daemon-deployment`  
**创建日期**: 2026-03-19  
**状态**: 草稿  
**输入**: 用户描述："优化 carvis 的本地安装、部署与运维体验。用户只自备 Codex CLI、飞书应用凭据以及兼容 Docker API 的宿主环境；Carvis 负责安装自身、守护进程、自启动，以及通过 daemon + Docker Compose 托管 Postgres 和 Redis。希望形成类似 OpenClaw 的低心智负担体验，并保留现有 gateway/executor、ChannelAdapter/AgentBridge 边界，以及 Postgres durable state、Redis coordination only、单 workspace 单 active run、operator-visible lifecycle/heartbeat/error 语义不变。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu
- **受影响桥接器**: Codex
- **受影响执行路径**: install、onboard、infra lifecycle、daemon lifecycle、runtime bootstrap、status/doctor 运维查询、卸载与修复路径
- **运维影响**: 本地安装、依赖托管、自启动、修复、分层诊断、数据保留与清理策略、日志与状态可见性
- **范围外内容**: 代装或代管 Codex CLI、代创建飞书应用或代填写飞书凭据、Windows 原生服务支持、远程托管控制面、Kubernetes、改变现有 run queue / lock / heartbeat 语义、把 `gateway` 或 `executor` 合并成单进程

## 用户场景与测试 *(必填)*

### 用户故事 1 - 首次安装后即进入低心智负担可用状态（优先级：P1）

作为第一次在本机部署 `carvis` 的操作者，我希望只要准备好 `Codex CLI` 和飞书应用凭据，就能通过少量命令把 `carvis`、本地依赖、自启动和运行时一起收敛到可用状态，而不需要自己分别安装数据库、缓存、后台服务和双进程运行角色。

**为什么这个优先级**: 这是产品价值的核心。如果用户仍需自己安装和维护多类本机依赖，部署体验仍然停留在工程接线层。

**独立验证方式**: 在一台未安装 `carvis` 的机器上，只准备好 `Codex CLI` 和飞书凭据，执行 `carvis install` 与 `carvis onboard`，确认本机依赖、后台服务和 runtime 都能进入明确的 ready、degraded 或 failed 状态。

**验收场景**:

1. **Given** 当前机器尚未安装 `carvis`，且用户已自备 `Codex CLI` 与飞书凭据，**When** 操作者执行 `carvis install`，**Then** 系统会完成本机可代管依赖、后台服务和本地目录结构的安装准备，并给出明确的后续步骤。
2. **Given** 当前机器已完成安装准备，**When** 操作者执行 `carvis onboard` 并输入飞书配置，**Then** 系统会在不要求用户手工安装 Postgres、Redis、daemon 或双进程 runtime、也不再需要他们提供具体连接串的前提下，依赖 Docker 托管 infra 把实例收敛到可用状态。
3. **Given** 当前主机已完成安装并启用本地托管服务，**When** 主机重启或用户重新登录，**Then** `carvis` 会按本地安装策略自动恢复，或给出明确的失败结论和修复指引。

---

### 用户故事 2 - 用分层命令管理本地基础设施与运行时（优先级：P1）

作为日常维护 `carvis` 的操作者，我希望能够清晰地区分安装层、本地基础设施层、外部依赖层、daemon 层和 runtime 层，并通过一组稳定命令完成启动、停止、重启、状态查询、诊断和受控运维，而不需要理解底层进程编排或依赖接线细节。

**为什么这个优先级**: 当系统开始代管本地依赖后，命令边界如果不清晰，运维体验会比纯 daemon-first 更混乱。

**独立验证方式**: 在已安装配置的机器上，依次执行 `carvis infra status`、`carvis daemon status`、`carvis status`、`carvis doctor` 等命令，确认操作者能够明确判断故障位于安装层、基础设施层、外部依赖层、daemon 层还是 runtime 层。

**验收场景**:

1. **Given** 本地基础设施未运行但 daemon 已安装，**When** 操作者执行状态或诊断命令，**Then** 系统必须把问题表述为基础设施不可用，而不是笼统表述为 runtime 失败。
2. **Given** daemon 已运行但 `gateway` 或 `executor` 尚未 ready，**When** 操作者执行 `carvis daemon status` 或 `carvis doctor`，**Then** 输出必须区分服务层状态与 runtime 可用性，而不是仅显示“running”。
3. **Given** 操作者需要单独管理本地依赖或 runtime，**When** 操作者执行 `carvis infra ...` 或 `carvis daemon ...`，**Then** 系统必须返回稳定、可判定的结果，而不要求直接接触底层进程或宿主机脚本。

---

### 用户故事 3 - 既有安装可以修复和安全卸载（优先级：P2）

作为已经运行过 `carvis` 的操作者，我希望在配置漂移、安装产物失效、依赖状态异常或需要卸载时，可以通过标准命令完成修复、重建或清理，并且默认保留重要数据，避免每次都靠手工 shell 排障或误删本地状态。

**为什么这个优先级**: 一旦 `carvis` 开始代管本机依赖，修复与卸载路径就不再是附属能力，而是产品契约的一部分。

**独立验证方式**: 在已有安装上模拟配置漂移、依赖异常和入口失效，再执行修复、重启和卸载路径，确认系统能恢复到可判定状态，且默认不会误删本地持久化数据。

**验收场景**:

1. **Given** 当前安装产物仍在但入口、环境或服务定义发生漂移，**When** 操作者执行 `carvis install --repair`、`carvis doctor` 或 `carvis daemon restart`，**Then** 系统必须识别问题并给出明确修复结果。
2. **Given** 操作者修改了影响运行的配置，**When** 配置写入完成，**Then** 系统必须明确提示需要重新启动相关托管层，而不是让运行状态悄悄失配。
3. **Given** 操作者需要卸载 `carvis`，**When** 执行默认卸载，**Then** 系统必须卸载运行入口并停止托管服务，但默认保留重要数据；只有明确执行清空操作时才删除本地持久化数据。

### 边界与异常场景

- 当宿主机缺少 `carvis` 所要求的本地基础设施宿主前提时，安装必须失败在安装层，并给出明确补救动作。
- 当宿主机缺少兼容 Docker API 的环境（`docker` / `docker compose` 可用）时，安装必须在安装层提前失败，并指出需要准备 Docker 运行时；不应继续尝试部署 infra。
- 当本地基础设施存在但不可用时，系统必须把问题归因为基础设施层，而不是误报为 daemon 或 runtime 问题。
- 当 daemon 已运行但 `gateway`、`executor`、Feishu 凭据或 `Codex CLI` 任一条件不满足时，系统不得伪装成“实例已可用”。
- 当配置已经变更但相关托管层尚未重载时，系统必须能区分“安装存在”和“当前运行配置已漂移”。
- 当存在陈旧 state、陈旧 pid、失效安装产物或残留日志时，修复路径必须先安全清理，再继续诊断或启动。
- 当操作者执行默认卸载时，系统不得误删业务持久化数据；当操作者执行清空操作时，系统必须明确表述清理范围。
- 当操作者仍尝试使用历史上的直接 `start`、`stop` 或 `status` 入口时，系统必须给出明确迁移结果，不得留下未定义行为。
- 本功能不得改变现有单 workspace 单 active run、FIFO 队列、锁释放、取消处理、timeout、heartbeat 与投递重试语义。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 提供新的本地安装主入口，使操作者可以把 `carvis` 自身、本机可代管依赖和后台服务收敛为一个统一的安装流程。
- **FR-002**: System MUST 将 `Codex CLI` 与飞书应用凭据视为用户自备的外部前提，而不是本功能负责代装或代办的对象。
- **FR-003**: System MUST 代管 `carvis` 在本机运行所需的可本地托管依赖，至少覆盖持久化状态依赖和协调依赖，使操作者不需要手工安装这些依赖。
- **FR-004**: System MUST 提供 `onboard` 入口，让已完成安装准备的机器能够继续完成飞书配置检查、外部依赖检查与首次实例可用化。
- **FR-005**: System MUST 提供独立的本地基础设施运维命令面，使操作者能够单独查询、启动、停止、重建和诊断被 `carvis` 代管的本机依赖层。
- **FR-006**: System MUST 保留 daemon-first 的运行时托管模型，使后台服务继续负责托管本地 runtime，而不要求操作者直接启动 `gateway` 或 `executor`。
- **FR-007**: System MUST 提供 `carvis doctor` 的分层诊断能力，至少区分安装层、基础设施层、外部依赖层和 runtime 层。
- **FR-008**: System MUST 在状态与诊断输出中保留 `CONFIG_DRIFT`、外部依赖不可用、渠道未就绪、依赖不可达等既有 operator-visible 失败语义。
- **FR-009**: System MUST 在本地持久化足够的安装层、基础设施层和 daemon 层状态，使 CLI 在重启后仍能判断当前托管层级和最近失败原因。
- **FR-010**: System MUST 为安装、启动、停止、重启、修复、卸载、状态查询和排障路径提供人类可读输出，并在需要时提供稳定 JSON 输出。
- **FR-011**: System MUST 在配置变更后提供明确的重载或重启指引，避免出现“配置已写入但当前托管层仍运行旧配置”的隐式状态。
- **FR-012**: System MUST 提供安全的修复路径，在检测到入口失效、安装产物漂移、旧 pid 或旧 state 时执行安全清理或明确提示修复动作。
- **FR-013**: System MUST 提供默认保守的数据保留卸载路径；若操作者未明确要求清空，系统不得删除本地持久化数据。
- **FR-014**: System MUST 提供显式的全量清理路径，使操作者在明确确认后可以删除本地持久化数据、状态和日志。
- **FR-015**: System MUST 保持现有 `ChannelAdapter` 与 `AgentBridge` 边界，不得把渠道逻辑或 bridge 逻辑转移到安装器、daemon 或 CLI 中。
- **FR-016**: System MUST 保持 Postgres 作为 durable state、Redis 作为 coordination only 的角色不变；安装与托管层不得引入新的业务事实来源。
- **FR-017**: System MUST 保持现有单 workspace 单 active run、FIFO 队列、锁、取消、timeout 和 heartbeat 语义不变。
- **FR-018**: System MUST 允许历史上的直接 `start`、`stop`、`status` 入口返回稳定迁移结果，但这些入口不得继续作为主契约。
- **FR-019**: System MUST 让安装流程具备幂等性；当操作者重复执行安装或修复命令时，结果应是对齐、补齐或恢复，而不是制造新的未定义状态。
- **FR-020**: System MUST 让操作者在不阅读宿主机 shell 脚本的前提下，就能通过标准命令完成首次安装、日常运维、修复和卸载。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 定义并呈现安装层、基础设施层、外部依赖层、daemon 层和 runtime 层的 operator-visible 状态，且这些层之间不得相互混淆。
- **OR-002**: System MUST 让运维侧能够明确区分“安装层损坏”“本地基础设施不可用”“daemon 不可用”“外部依赖不可用”和“runtime 未 ready”这五类问题。
- **OR-003**: System MUST 说明并保留默认保守的数据保留策略，以及显式清空时的数据删除范围。
- **OR-004**: System MUST 说明本功能不会改变 run lifecycle、workspace lock、queue、cancel、timeout、heartbeat 和 delivery retry 的既有语义。
- **OR-005**: System MUST 让运维侧能够从持久化状态、诊断输出或日志中判断失败发生层级，而不需要先登录宿主机做进程级排查。

### 关键实体 *(涉及数据时填写)*

- **Managed Local Installation**: 表示 `carvis` 在当前宿主机上的安装准备状态，包括本地目录、托管入口、依赖托管前提与最近修复结果。
- **Managed Local Infrastructure**: 表示由 `carvis` 代管的本机依赖层状态，包括是否已安装、是否可用、是否需要重建以及最近失败原因。
- **Daemon Service State**: 表示后台服务最近一次运行结果、当前状态、最近失败原因和本地状态快照。
- **Runtime Readiness Summary**: 表示 `gateway` 与 `executor` 聚合后的当前可用性结论，以及对应的 operator-visible 错误信息。
- **Local Uninstall Scope**: 表示一次卸载操作的数据保留或清空范围，用于明确默认卸载与显式清空的边界。

## 假设与依赖

- 当前交付范围面向本地单机安装与系统级自启动体验，不涵盖远程托管控制面。
- `Codex CLI` 的安装、登录与可用性由用户自行负责；本功能负责提示与检查，不负责代办。
- 飞书应用创建、权限配置和凭据获取由用户自行负责；本功能负责引导输入、校验和诊断。
- 本地被代管依赖的具体宿主方式属于实现选择，不改变“由 `carvis` 负责本机依赖托管”的产品边界。
- 后台服务和基础设施托管层是运维能力，不是新的业务执行边界；业务审计与运行状态真相仍由既有持久化运行模型负责。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 新操作者在只自备 `Codex CLI` 和飞书凭据的前提下，能够仅通过标准安装与引导路径把实例收敛到明确的 ready、degraded 或 failed 结论，无需手工安装本机数据库、缓存或后台服务。
- **SC-002**: 100% 的状态与诊断输出都能区分安装层、基础设施层、外部依赖层和 runtime 层，不出现把某一层存活误判为整体可用的结果。
- **SC-003**: 100% 的重复安装或修复路径都能给出稳定、可判定结果，不因重复执行而制造新的未定义状态。
- **SC-004**: 当本地基础设施不可用、飞书凭据错误、`Codex CLI` 不可用或 runtime 未 ready 时，操作者能够仅依赖标准命令判断问题层级，而不需要先阅读宿主机脚本。
- **SC-005**: 在主机重启或用户重新登录后的正常场景下，托管服务能够自动恢复或给出明确失败结论，操作者不需要重新执行完整引导。
- **SC-006**: 默认卸载路径 100% 保留本地持久化数据；只有显式清空路径才会删除这些数据，且删除范围对操作者可见。
- **SC-007**: 引入托管式本地部署后，现有单 workspace 单 active run、FIFO 队列、取消、timeout 和 heartbeat 行为不出现可观察语义回归。
