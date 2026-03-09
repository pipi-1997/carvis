# 功能规格说明：飞书会话工作区绑定

**功能分支**: `005-session-workspace-binding`
**创建日期**: 2026-03-09
**状态**: 草稿
**输入**: 用户描述："实现飞书 chat 级独立 session 的 workspace 解析与绑定：私聊默认使用 defaultWorkspace，群聊与其他新 session 需要通过配置映射或 /bind 绑定；/bind 有则绑定无则创建并绑定，群聊未绑定时普通消息不入队而是返回引导提示；workspace 全局唯一，并预留未来 thread/conversation hint 扩展。"

## Clarifications

### Session 2026-03-09

- Q: 新 workspace 的默认初始化策略是什么？ → A: 新 workspace 必须按默认 template 初始化；没有 template 时不得创建。
- Q: 当前 session 有活动运行时是否允许 `/bind` 切换 workspace？ → A: 不允许；若当前 session 有活动运行，则拒绝切换并提示先等待完成或取消。
- Q: 当群聊已存在配置映射时，手动 `/bind` 是否允许覆盖它？ → A: 允许；手动 `/bind` 的优先级高于配置映射。

### Session 2026-03-10

- Q: 飞书是否依赖平台原生命令菜单来使用 `/bind`、`/status` 等命令？ → A: 不依赖；飞书命令视为普通消息文本协议，系统必须自行完成命令归一化、帮助提示和输入引导。
- Q: 命令帮助与发现性如何设计？ → A: 参考 OpenClaw，提供 `/help` 文本帮助，并在未绑定群聊和未知 slash 命令场景返回明确 onboarding/帮助提示，而不是把它们当作普通 prompt 执行。
- Q: 私聊默认 workspace 应该落在哪里？ → A: 默认私聊也应落到 `.carvis` 下的托管 workspace，而不是直接指向宿主机上的业务仓库目录；`defaultWorkspace` 必须解析到 `managedWorkspaceRoot` 内的默认托管工作区。
- Q: 默认 template 至少应满足什么标准？ → A: 默认 template 不能只是占位 README；必须提供一个可工作的 starter 骨架，至少包含基础说明、忽略规则和会话内可读的 workspace 使用约定。

## 系统影响 *(必填)*

- **受影响渠道**: Feishu
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, queueing, executor, outbound delivery
- **运维影响**: locks, queueing, notifications, admin visibility
- **范围外内容**: 群内多 conversation/thread 路由、多 agent 选择、workspace 删除或重命名、平台原生 slash autocomplete、自动 git clone/bootstrap、Telegram/Slack 渠道改造

## 用户场景与测试 *(必填)*

### 用户故事 1 - 默认解析工作区（优先级：P1）

作为在飞书中和机器人的使用者，我希望私聊可以直接落到默认工作区，而群聊只有在已绑定工作区时才真正执行请求，这样我既能快速在私聊里开始使用，也不会让未初始化的群聊误把消息送进错误工作区。

**优先级原因**: 这是 workspace 绑定层的最小可用闭环；如果私聊默认解析和群聊未绑定保护不成立，后续的 `/bind` 只是补丁而不是可靠产品行为。

**独立验证方式**: 在一个未绑定的私聊和一个未绑定的群聊中分别发送普通消息；私聊应直接开始运行并落到 `defaultWorkspace`，群聊应返回引导提示且不创建 run。

**验收场景**:

1. **Given** 一个首次出现的飞书私聊 `chat`，**When** 用户发送普通消息，**Then** 系统为该 `chat` 创建独立 session，并将该 session 解析到 `managedWorkspaceRoot` 下的 `defaultWorkspace` 后正常进入运行链路。
2. **Given** 一个首次出现的飞书群聊 `chat` 且它没有命中任何 workspace 映射，**When** 用户发送普通消息，**Then** 系统返回“当前群聊未绑定 workspace”的引导提示，并且不创建 run、不进入队列。
3. **Given** 一个群聊 `chat` 已通过配置映射到某个 workspace，**When** 用户发送普通消息，**Then** 系统为该 `chat` 创建独立 session，并使用映射 workspace 执行请求。

---

### 用户故事 2 - 绑定或创建工作区（优先级：P1）

作为在群聊或其他新 session 中发起协作的使用者，我希望通过一个简单命令就能把当前 session 绑定到已有 workspace，或者在不存在时创建并绑定一个新 workspace，这样我不需要先登录宿主机手动准备目录。

**优先级原因**: 群聊是否可用取决于绑定入口是否顺滑；如果只能静态配置而不能自助绑定，真实使用中会频繁卡在初始化阶段。

**独立验证方式**: 在群聊中分别执行 `/bind` 到一个已存在的 workspace key 和一个不存在的 workspace key，验证两条路径都能让后续普通消息进入正确工作区。

**验收场景**:

1. **Given** 当前 session 尚未绑定 workspace 且 registry 中存在 `ops`，**When** 用户执行 `/bind ops`，**Then** 系统将当前 session 绑定到 `ops` 对应的 workspace，并返回绑定成功提示。
2. **Given** 当前 session 尚未绑定 workspace 且 registry 中不存在 `feature-a`，**When** 用户执行 `/bind feature-a`，**Then** 系统在托管工作区根目录下创建一个全局唯一的 `feature-a` workspace，并立即把当前 session 绑定到它。
3. **Given** 当前 session 尚未绑定 workspace 且 registry 中不存在 `feature-a`，但系统缺少可用 template，**When** 用户执行 `/bind feature-a`，**Then** 系统明确拒绝创建，并提示当前环境缺少默认初始化 template。
4. **Given** 当前 session 已绑定到某个 workspace，**When** 用户再次执行 `/bind same-workspace-key`，**Then** 系统返回幂等提示而不是创建重复 workspace。
5. **Given** 当前 session 存在活动运行，**When** 用户执行 `/bind another-workspace-key`，**Then** 系统拒绝切换并提示先等待当前运行结束或先取消当前运行。
6. **Given** 一个群聊 `chat` 已通过配置映射到某个 workspace，且当前 session 尚未建立手动绑定，**When** 用户执行 `/bind another-workspace`，**Then** 系统允许当前 session 切换到手动绑定的 workspace，并使后续解析优先命中手动绑定。

---

### 用户故事 3 - 查看与保持当前绑定（优先级：P2）

作为飞书中的使用者，我希望通过 `/status` 看清当前 session 绑定到了哪个 workspace、绑定来源是什么，并确认 `/new` 只重置对话续聊而不改变 workspace，这样我能安全地重开上下文而不丢失工作目录归属。

**优先级原因**: workspace 绑定一旦变成独立层，用户必须能区分“重置对话上下文”和“切换工作区”这两种操作，否则容易产生误用。

**独立验证方式**: 在一个已绑定 workspace 且已有 continuation 的 session 中执行 `/status` 和 `/new`，验证状态展示与行为边界一致。

**验收场景**:

1. **Given** 当前 session 的 workspace 来源可能是 `default`、`config`、`manual` 或 `created`，**When** 用户执行 `/status`，**Then** 系统返回当前 workspace key、绑定来源以及当前 continuation 状态。
2. **Given** 当前 session 已绑定 workspace 且已有 Codex continuation，**When** 用户执行 `/new`，**Then** 系统只重置当前 session 的 continuation 绑定，不清除 workspace 绑定。
3. **Given** 当前群聊尚未绑定 workspace，**When** 用户执行 `/status`，**Then** 系统明确返回 `unbound` 状态并提示下一步可使用 `/bind <workspace-key>`。

---

### 用户故事 4 - 文本命令输入与帮助引导（优先级：P1）

作为飞书中的使用者，我希望 `/bind`、`/status`、`/new`、`/help` 这些命令在 webhook 与 websocket 两条入站路径上表现一致，并且在群聊里带上 `@机器人` 后仍能被稳定识别，这样我不会因为渠道细节差异把命令误触发成普通 agent 运行。

**优先级原因**: 如果命令归一化不稳定，`/bind` 这类高风险命令会被误判为 prompt，直接破坏 workspace 绑定体验；这比缺少帮助文案更严重。

**独立验证方式**: 在私聊发送 `/bind ops`，在群聊发送 `@机器人 /bind ops`，分别通过 webhook 和 websocket 路径验证二者都命中命令路由；再发送 `/help` 和未知 slash 命令，验证不会进入普通运行链路。

**验收场景**:

1. **Given** 私聊用户发送 `/bind ops`，**When** 请求经由 webhook 入站，**Then** 系统必须将其识别为 `bind` 命令，而不是普通 prompt。
2. **Given** 群聊用户发送带 mention 前缀的 `@机器人 /bind ops`，**When** 请求经由 webhook 或 websocket 入站，**Then** 系统都必须在剥离 mention 前缀后识别为 `bind` 命令。
3. **Given** 用户发送 `/help`，**When** 系统处理命令，**Then** 必须返回当前支持的文本命令列表，以及私聊/群聊的推荐输入方式与绑定说明。
4. **Given** 用户发送未知 slash 命令如 `/bindd ops`，**When** 系统处理命令，**Then** 必须返回“未知命令”帮助提示，而不是将该文本作为普通 prompt 执行。


### 边界与异常场景

- 当私聊和群聊来自不同 `chat_id` 但由同一用户发起时，系统必须将它们视为两个独立 session，而不是按 `user_id` 合并。
- 当群聊未绑定 workspace 时，普通消息不得创建 run、不得占用队列，也不得创建“失败 run”作为替代。
- 当 `/bind` 请求的 workspace key 已存在但当前 session 已绑定到另一个 workspace 时，系统必须明确提示“将切换当前 session 的 workspace”，并在切换后只影响当前 session。
- 当当前 session 存在活动运行时，`/bind` 不得切换 workspace，也不得让当前活动运行和后续 session 状态分别指向不同 workspace。
- 当群聊已命中静态配置映射但用户随后执行 `/bind` 时，系统必须以手动绑定结果为准，直到该 session 显式重新绑定或被清除。
- 当 `/bind` 请求的 workspace key 不存在但系统没有权限在托管根目录下创建时，系统必须返回清晰失败原因，并保持当前 session 的 workspace 绑定不变。
- 当 `/bind` 请求的 workspace key 不存在且默认初始化 template 缺失、不可读或初始化失败时，系统必须返回清晰失败原因，并保持当前 session 的 workspace 绑定不变。
- 当工作区中已经有一个活动运行时，后续请求仍然必须按该工作区既有的 FIFO 队列规则排队；workspace 绑定层不得绕过锁和队列语义。
- 当执行器心跳或智能体进程丢失时，系统必须继续按既有运行失败/取消规则处理，并且 `/status` 仍能显示当前 session 绑定的 workspace。
- 当出站投递重试耗尽时，用户侧可能看不到最新提示，但运维侧必须仍能从持久化状态判断该 session 绑定的是哪个 workspace，以及哪条引导或结果消息投递失败。
- 当群聊消息带有 mention 前缀、零宽字符或其他飞书消息包装痕迹时，命令归一化必须仍能稳定识别 `/bind`、`/status`、`/new`、`/help`，而不是退化成普通 prompt。
- 当用户输入未知 slash 命令时，系统不得把它当作普通 prompt 创建 run；必须返回帮助提示或错误提示。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 继续以飞书 `chat_id` 作为 session 路由边界；每个私聊 `chat` 和每个群聊 `chat` 都必须拥有独立 session。
- **FR-002**: System MUST 将 workspace 解析从固定 `agent.workspace` 提升为独立的 session 级绑定层，并允许每个 session 解析到不同 workspace。
- **FR-003**: System MUST 为私聊 session 提供 `defaultWorkspace` 作为默认解析结果；该 `defaultWorkspace` 必须解析到 `managedWorkspaceRoot` 下的托管工作区，而不是任意宿主机目录；私聊首次普通消息在未显式绑定时必须可直接执行。
- **FR-004**: System MUST 支持通过静态配置将指定飞书 `chat_id` 映射到指定 workspace，并让群聊在没有 session 级手动绑定时优先命中该映射。
- **FR-005**: System MUST 在群聊 session 未绑定且未命中静态映射时拒绝执行普通消息，并返回明确的 onboarding 提示；该路径不得创建 run、不得入队、不得触发 executor。
- **FR-006**: Users MUST be able to 通过 `/bind <workspace-key>` 将当前 session 绑定到一个已存在的 workspace；若该 key 尚不存在，则系统必须按托管创建规则创建并绑定。
- **FR-007**: System MUST 保证 workspace key 在系统范围内唯一；不得为两个不同物理 workspace 分配相同 key。
- **FR-008**: System MUST 在为不存在的 workspace key 创建新 workspace 时使用默认初始化 template；默认 template 必须是可工作的 starter 骨架，而不是纯占位目录；若 template 缺失、不可读或初始化失败，则必须拒绝创建并返回明确错误。
- **FR-009**: System MUST 明确区分“绑定已有 workspace”和“创建并绑定新 workspace”这两条 `/bind` 结果路径，并在用户提示与持久化状态中反映其来源。
- **FR-010**: System MUST 在 `/status` 中展示当前 session 的 workspace key、绑定来源以及当前 continuation 状态；当 session 处于 `unbound` 时必须给出下一步引导。
- **FR-011**: System MUST 在当前 session 存在活动运行时拒绝 `/bind` 切换 workspace，并返回清晰提示；不得让活动运行与 session 当前 workspace 绑定产生分裂状态。
- **FR-012**: System MUST 允许 session 级手动 `/bind` 覆盖静态 `chat_id -> workspace` 映射，并在后续解析中优先使用手动绑定结果。
- **FR-013**: System MUST 保持 `/new` 只重置当前 session 的 continuation 绑定，不得改变 session 的 workspace 绑定。
- **FR-014**: System MUST 在首次落地此功能时为未来 thread/topic/conversation 路由预留兼容字段或等价扩展点，但本轮不得改变“按 `chat_id` 路由 session”的既有产品语义。
- **FR-015**: System MUST 让所有通过 workspace 解析得到的 run 继续遵守既有的单 workspace 单活动运行、FIFO 队列和显式锁语义。
- **FR-016**: System MUST 将 Feishu 文本命令视为普通消息上的应用层协议，而不是依赖平台原生命令菜单；webhook 与 websocket 两条入站路径必须共享等价的命令归一化规则。
- **FR-017**: System MUST 在命令归一化时剥离飞书群聊中的 mention 前缀及其他不影响命令语义的包装文本，再识别 `/bind`、`/status`、`/abort`、`/new`、`/help`。
- **FR-018**: Users MUST be able to 通过 `/help` 获得当前支持的文本命令列表、私聊/群聊推荐输入方式、以及未绑定群聊的下一步说明。
- **FR-019**: System MUST 在收到未知 slash 命令时返回明确帮助提示，并且不得将该文本作为普通 prompt 创建 run。

### 假设与依赖

- **A-001**: `defaultWorkspace` 指向的 workspace key 必须由配置显式声明，并且必须解析到 `managedWorkspaceRoot` 下一个已存在的托管工作目录。
- **A-002**: 托管创建的新 workspace 位于统一的托管根目录下，并且必须通过默认初始化 template 完成目录初始化；该 template 至少提供基础说明文件、忽略规则和 workspace 约定文件；本轮不要求从远端仓库克隆或执行额外 bootstrap。
- **A-003**: `/bind` 首版只接受全局唯一的 `workspace-key`，不支持命名空间、owner 或层级目录语法。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 在 operator-visible 状态和结构化日志中区分 `default`、`config`、`manual`、`created`、`unbound` 这些 workspace 绑定来源，以及 `/bind` 触发的绑定和创建结果。
- **OR-002**: System MUST 明确定义群聊未绑定时的拒绝路径、`/bind` 创建失败路径、以及这些路径对应的用户提示和投递失败可见性。
- **OR-003**: System MUST 保持 queue、lock、heartbeat 和 cancel 语义按“解析后的目标 workspace”工作，并让运维可从持久化状态判断某个 run 命中了哪个 workspace。
- **OR-004**: System MUST 在结构化日志中区分“已识别命令”“未知 slash 命令”“经 mention 归一化后识别的命令”这些入站结果，以便排查命令被误判为普通 prompt 的问题。

### 关键实体 *(涉及数据时填写)*

- **Session**: 飞书 `chat_id` 到渠道会话的绑定，继续承载渠道、chat 标识、最近活动信息和 continuation 上下文入口。
- **SessionWorkspaceBinding**: 当前 session 对目标 workspace 的绑定记录，包含 workspace key、绑定来源、最近更新时间以及是否允许执行普通消息。
- **WorkspaceCatalogEntry**: 一个全局唯一的 workspace 注册项，表示某个 `workspace-key` 对应的工作目录及其来源。
- **Run**: 由普通消息触发的执行请求，必须记录最终命中的 workspace，以继续复用现有队列、锁和运行生命周期模型。
- **OutboundDelivery**: 向当前 session 回传 onboarding 提示、绑定结果、状态说明和执行结果的投递记录。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 100% 的首次私聊普通消息都能在不依赖额外命令的情况下解析到 `managedWorkspaceRoot` 下的 `defaultWorkspace` 并进入正常执行链路。
- **SC-002**: 100% 的未绑定群聊普通消息都不会创建 run 或进入队列，而是返回清晰的引导提示。
- **SC-003**: 用户在一个未绑定群聊中最多通过一次 `/bind <workspace-key>` 即可让后续普通消息进入目标 workspace；当 key 不存在时，创建并绑定的成功路径可在一次命令内完成。
- **SC-004**: 用户在 `/status` 中可以无歧义地区分当前 session 的 workspace 来源和 continuation 状态，不会把 `/new` 误解为切换 workspace。
- **SC-005**: 运维人员无需登录宿主机，即可从持久化状态、`/status` 输出和结构化日志判断任一 session 当前绑定的是哪个 workspace，以及某次群聊普通消息为何未被执行。
- **SC-006**: 100% 的 `/bind`、`/status`、`/new`、`/help` 命令在 webhook 与 websocket 路径上都能保持一致的命令识别结果；未知 slash 命令不会误触发 agent 运行。
