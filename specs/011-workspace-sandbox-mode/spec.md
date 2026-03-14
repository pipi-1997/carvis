# 功能规格说明：工作区 Codex Sandbox 模式

**功能分支**: `011-workspace-sandbox-mode`
**创建日期**: 2026-03-14
**状态**: 草稿
**输入**: 用户描述："为 Carvis 增加 workspace 级 `codexSandboxMode` 配置，并允许 Feishu chat 通过 `/mode` 临时覆盖 `workspace-write` 或 `danger-full-access`；`/new` 清除 override，mode 变化时强制 fresh，不跨模式续聊；`/status` 展示当前 mode；scheduled job 和 external webhook 仅使用 workspace 默认值。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu, Scheduler, External Webhook
- **受影响桥接器**: Codex
- **受影响执行路径**: gateway ingress, queueing, executor, outbound delivery
- **运维影响**: queueing, notifications, admin visibility
- **范围外内容**: `read-only` sandbox、Codex approval policy、非 Feishu 渠道的命令入口、超出当前 allowlist 模型的细粒度授权体系

## 用户场景与测试 *(必填)*

### 用户故事 1 - 按工作区默认权限执行（优先级：P1）

作为管理多个工作区的使用者，我希望每个工作区都能声明自己的默认 Codex sandbox mode，这样无论请求来自飞书、调度任务还是外部 webhook，系统都会按该工作区的预期权限执行，而不是依赖全局固定值。

**优先级原因**: 这是本功能的最小闭环；如果工作区默认权限不成立，后续 chat override 只是临时补丁，无法统一不同触发路径的执行语义。

**独立验证方式**: 为两个不同工作区配置不同的 `codexSandboxMode`，分别通过飞书普通消息、scheduled job 和 external webhook 触发运行，确认每条 run 都采用目标工作区的默认模式。

**验收场景**:

1. **Given** 某个工作区默认配置为 `workspace-write`，**When** 用户在绑定到该工作区的飞书 `chat` 发起普通消息，**Then** 系统按 `workspace-write` 执行该 run。
2. **Given** 某个工作区默认配置为 `danger-full-access`，**When** 该工作区的 scheduled job 或 external webhook 创建 run，**Then** 系统按 `danger-full-access` 执行该 run，且不依赖 chat 状态。

---

### 用户故事 2 - 在当前 chat 临时切换模式（优先级：P1）

作为在飞书里调试或执行高风险操作的使用者，我希望能在当前 `chat` 中临时切换 Codex sandbox mode，并在需要时快速回到工作区默认值，这样我可以在单个对话里显式控制接下来几轮请求的执行权限。

**优先级原因**: 用户明确要求支持 command 驱动的临时切换；没有这一能力，工作区默认值无法覆盖临时提权和回退场景。

**独立验证方式**: 在同一个飞书 `chat` 中依次执行 `/mode danger-full-access`、普通消息、`/mode reset`、普通消息，确认前后两次 run 分别采用 override 和工作区默认值。

**验收场景**:

1. **Given** 当前飞书 `chat` 已绑定某个工作区且该工作区存在默认 sandbox mode，**When** 用户执行 `/mode danger-full-access`，**Then** 系统为当前 `chat` 建立一个持续 30 分钟的临时 override，并在 `/status` 中展示当前 mode 来自 `chat_override`。
2. **Given** 当前飞书 `chat` 已存在临时 override，**When** 用户执行 `/mode reset`，**Then** 系统清除 override，后续普通消息恢复使用工作区默认值。
3. **Given** 当前飞书 `chat` 的 30 分钟临时 override 已过期，**When** 用户发送下一条普通消息或执行 `/status`，**Then** 系统不再沿用过期 override，而是回退到工作区默认值并明确展示该结果。

---

### 用户故事 3 - 重开上下文或切换工作区时同步清除临时模式（优先级：P2）

作为在飞书里重开一个新话题或切换到另一个工作区的使用者，我希望 `/new` 和工作区切换都能同步清除当前 `chat` 的临时 sandbox mode，这样“开新会话”或“换工作区”不会悄悄继承上一个话题留下的高权限设置。

**优先级原因**: 这决定了 `/new` 的安全边界与用户心智模型；若只重置 continuation 而不清除临时 mode，用户很容易误以为已经回到默认权限。

**独立验证方式**: 在已有 continuation 与 mode override 的飞书 `chat` 中执行 `/new`，以及在存在 override 的 session 中执行 `/bind` 切换工作区，验证后续 run 分别表现为 fresh 会话且使用对应工作区默认值。

**验收场景**:

1. **Given** 当前飞书 `chat` 同时存在 continuation 绑定和临时 sandbox override，**When** 用户执行 `/new`，**Then** 系统同时清除 continuation 与 sandbox override，并明确提示后续请求将从新会话和工作区默认 mode 开始。
2. **Given** 当前飞书 `chat` 刚从 `workspace-write` 切换到 `danger-full-access` 或反向切换，**When** 用户发送下一条普通消息，**Then** 系统不得继续复用上一种 mode 建立的底层 Codex 会话，而是从 fresh 会话开始执行。
3. **Given** 当前飞书 `chat` 存在临时 sandbox override，**When** 用户执行 `/bind` 切换到另一个工作区，**Then** 系统清除当前 override，并让后续请求使用新工作区的默认 mode。

---

### 用户故事 4 - 让用户与运维看清实际执行模式（优先级：P2）

作为使用者和运维人员，我希望能够从 `/status`、运行历史和运维查询结果中明确看出某次请求实际使用的 sandbox mode、它来自工作区默认还是 chat override，以及 override 是否已经过期，这样我能解释为什么某个 run 以当前权限执行。

**优先级原因**: 执行权限一旦成为工作流的一部分，可见性就是功能本身；如果用户和运维看不清 mode 来源，故障排查和安全审计都会变得模糊。

**独立验证方式**: 在存在工作区默认值、chat override、override 过期和 scheduled job/webhook 触发的情况下查看 `/status` 与运行历史，确认都能还原 mode 来源。

**验收场景**:

1. **Given** 当前飞书 `chat` 没有 sandbox override，**When** 用户执行 `/status`，**Then** 系统展示当前 mode、来源为 `workspace_default`，以及当前工作区标识。
2. **Given** 某条 run 因执行失败而终止，**When** 运维查看持久化状态或管理视图，**Then** 可以判断该 run 使用了哪种 sandbox mode 以及该 mode 的来源。

### 边界与异常场景

- 当某个工作区未显式配置 `codexSandboxMode` 时，系统必须拒绝把该工作区作为可执行目标，或者在配置校验阶段给出明确错误，而不是默默回退到隐式全局值。
- 当工作区中已经有一个活动运行时，后续请求仍然必须遵守现有 FIFO 排队与单活动运行语义；sandbox mode 不得改变锁和队列行为。
- 当飞书 `chat` 的 override 在排队期间过期时，系统必须以 run 创建时已解析并持久化的结果执行该 run，而不是在 executor 侧重新解析导致排队前后行为不一致。
- 当用户把当前 `chat` 的 mode 从 `workspace-write` 切到 `danger-full-access` 或反向切换时，系统必须把后续普通消息视为 fresh 会话，不得跨 mode 续用底层 Codex continuation。
- 当 scheduled job 或 external webhook 为某个工作区创建 run 时，系统不得读取任何 chat 级 override，也不得把缺失 chat 视为错误。
- 当 `/mode` 指令请求的值与当前已生效值相同，系统应返回幂等提示，而不是制造新的行为歧义。
- 当 `/mode` 指令值不合法时，系统必须返回明确帮助提示，不得把该消息当作普通 prompt 执行。
- 当当前 session 执行 `/bind` 切换到另一个工作区时，系统必须清理当前 `chat` 的 sandbox override，避免把旧工作区的临时权限设置带入新工作区。
- 当执行器心跳或智能体进程丢失时，run 仍按既有失败与 `heartbeat_expired` 语义处理；本功能不得改变锁释放、超时与取消规则。
- 当出站投递重试耗尽时，用户侧可能无法及时看到最新状态；运维侧仍必须能从持久化状态判断 run 的 sandbox mode、来源和 override 生命周期。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 为每个可执行工作区定义单一的 `codexSandboxMode`，用于表示该工作区在没有 chat 临时覆盖时的默认 Codex sandbox mode。
- **FR-002**: System MUST 在普通飞书消息、scheduled job 和 external webhook 这三条触发路径上，都按目标工作区的 `codexSandboxMode` 解析 run 的默认执行模式。
- **FR-003**: Users MUST be able to 在飞书 `chat` 中通过 `/mode workspace-write`、`/mode danger-full-access` 和 `/mode reset` 管理当前 `chat` 的临时 sandbox override。
- **FR-004**: System MUST 将 chat override 的作用域限制在当前飞书 `chat`，不得影响其他 `chat`，也不得影响 scheduled job 或 external webhook。
- **FR-005**: System MUST 为 chat override 设定固定 30 分钟有效期，并在后续读操作时懒判定过期；一旦过期，后续 run 和 `/status` 都必须回退到工作区默认 mode。
- **FR-006**: System MUST 在 `/status` 中展示当前飞书 `chat` 的实际 sandbox mode、来源是 `workspace_default` 还是 `chat_override`，以及存在 override 时的剩余有效期或已失效结果。
- **FR-007**: System MUST 在 `/new` 时同时清除当前飞书 `chat` 的 continuation 绑定与 sandbox override，并明确告知后续请求将从 fresh 会话和工作区默认 mode 开始。
- **FR-008**: System MUST 在当前飞书 `chat` 执行 `/bind` 切换工作区时清除 sandbox override，使后续请求回到新工作区的默认 mode。
- **FR-009**: System MUST 在某个飞书 `chat` 的 sandbox mode 与当前 continuation 绑定所建立的 mode 不一致时，让下一条普通消息从 fresh 会话开始执行，而不是续用旧会话。
- **FR-010**: System MUST 把每条 run 的用户请求值、最终解析值和解析来源作为持久化运行状态的一部分保存，使其在运行完成、失败、取消或投递失败后仍可审计。
- **FR-011**: System MUST 让 run 在入队前完成 sandbox mode 解析，并在整个排队、执行和通知过程中保持该解析结果不变。
- **FR-012**: System MUST 继续保持现有的工作区串行化、FIFO 队列、取消、超时和心跳语义不变；sandbox mode 不得绕过或改变这些执行约束。
- **FR-013**: System MUST 让 scheduled job 和 external webhook 在没有 chat 上下文的情况下仍然能够完整表达并审计其解析后的 sandbox mode。
- **FR-014**: System MUST 在输入非法 `/mode` 指令时返回帮助提示或错误提示，并且不得把该输入当作普通 prompt 创建 run。
- **FR-015**: System MUST 在用户查看 `/status` 或运维排查失败、查询运行状态时，让其能够区分“工作区默认 mode”“chat 临时 override”“override 已过期回退”这三类结果。

### 假设与依赖

- **A-001**: 首版 `codexSandboxMode` 只支持 `workspace-write` 和 `danger-full-access` 两个值，不暴露 `read-only` 或其他更细粒度执行策略。
- **A-002**: 首版 `/mode` 的授权边界沿用现有 Feishu allowlist；即当前能够向该 agent 发出受信命令的用户，也被视为可以切换当前 `chat` 的 sandbox mode。
- **A-003**: 首版 chat override 只面向 Feishu 文本命令，不扩展到 scheduler、external webhook 或其他未来渠道。
- **A-004**: 首版 override 固定为 30 分钟，不支持用户自定义时长或永久提权。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 在 operator-visible 状态、结构化日志和管理视图中暴露 run 的实际 sandbox mode 及其来源，以便运维区分工作区默认值与 chat override。
- **OR-002**: System MUST 明确记录和展示 `/mode` 设置、override 过期回退、`/new` 清理 override、以及因 mode 变化触发 fresh 会话这几类关键状态迁移。
- **OR-003**: System MUST 说明本功能不会改变锁、队列、取消、超时和 heartbeat 的既有语义，并允许运维从持久化状态判断某个 run 为何以当前 mode 执行。

### 关键实体 *(涉及数据时填写)*

- **Workspace Sandbox Policy**: 表示某个工作区声明的默认 `codexSandboxMode`，决定该工作区在无 chat override 时的执行权限基线。
- **Chat Sandbox Override**: 表示某个飞书 `chat` 当前临时生效的 sandbox mode，包含模式值、设置时间、过期时间和最近状态。
- **Run**: 单次执行请求，必须保存该请求的 sandbox mode 请求值、解析结果和来源，以支撑排队一致性和事后审计。
- **Conversation Session Binding**: 当前飞书 `chat` 的 continuation 状态；当 sandbox mode 变化时，该实体需要与 fresh 会话边界保持一致。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 100% 的飞书普通消息、scheduled job 和 external webhook 运行都能解析出明确的 sandbox mode，且该结果与目标工作区配置一致或与当前 chat override 一致。
- **SC-002**: 100% 的 `/mode reset` 和 `/new` 操作都能让后续普通消息回到工作区默认 mode，不继续沿用旧的临时 override。
- **SC-003**: 当飞书 `chat` 的 sandbox mode 发生切换时，后续第一条普通消息 100% 以 fresh 会话执行，而不是跨 mode 续用旧 continuation。
- **SC-004**: 用户在 `/status` 中能够无歧义地区分当前 mode 是来自工作区默认值还是 chat override，并在 override 存在时看到其剩余有效期或失效结果。
- **SC-005**: 运维人员无需登录宿主机，即可从持久化状态、日志或管理视图判断任意一条 run 的 sandbox mode、来源，以及该 run 是否受 chat override 影响。
