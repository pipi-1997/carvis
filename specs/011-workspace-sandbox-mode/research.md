# 研究记录：工作区 Codex Sandbox 模式

## 决策 1：工作区默认模式使用配置映射 `workspaceResolver.sandboxModes`

- **Decision**: 在现有 `workspaceResolver` 下新增 `sandboxModes: Record<string, CodexSandboxMode>`，按 `workspaceKey -> sandbox mode` 声明每个工作区的默认模式。
- **Rationale**: 现有 runtime config 已经用 `registry`、`chatBindings` 这类按 `workspaceKey` 建模的映射结构。新增一个并列 map 比引入新的多字段 policy 对象更贴合这轮“只要一个权限字段”的目标，也更容易纳入当前配置校验和 runtime fingerprint。
- **Alternatives considered**:
  - 在 `agent` 下新增全局默认 mode：无法区分不同 workspace 的执行权限基线，也无法统一 chat、scheduler、webhook 三条路径。
  - 为每个 workspace 引入多字段 policy 对象：会为本轮带入 `max/default/allowOverride` 等额外维度，超出已确认范围。

## 决策 2：chat 临时 mode 使用独立持久化实体，而不是复用 `ConversationSessionBinding`

- **Decision**: 新增独立的 `ChatSandboxOverride` 持久化实体，按飞书 `Session` 记录当前 chat 的临时 sandbox mode、过期时间、设置人和更新时间。
- **Rationale**: `ConversationSessionBinding` 当前语义是 continuation 状态。把 sandbox override 混进去会让 `/new`、失效恢复、续聊回写和权限状态互相污染，违反“状态单一职责”的边界。
- **Alternatives considered**:
  - 直接在 `ConversationSessionBinding` 上加 override 字段：实现快，但会让 continuation reset 和权限 reset 的语义耦合，后续更难审计。
  - 只放 Redis：不满足 Postgres 作为 durable state 的约束，也无法在投递失败或重启后解释某条 run 的权限来源。

## 决策 3：mode 解析在 `gateway` 入队前完成，executor 不重新解析

- **Decision**: `gateway` 在创建 run 时解析 `requestedSandboxMode`、`resolvedSandboxMode` 和 `sandboxModeSource`，写入 Postgres；`executor` 和 `bridge-codex` 只消费持久化结果。
- **Rationale**: 这保持了现有边界，即 `gateway` 负责把 chat / trigger 上下文映射成 canonical `RunRequest`，`executor` 负责消费 run 并执行。也能避免“排队期间 override 过期导致同一 run 前后解析不一致”的问题。
- **Alternatives considered**:
  - executor 启动时再解析：会让排队中的 run 受到后续 chat 状态变化影响，破坏 run 审计一致性。
  - bridge-codex 自己决定 mode：会把策略下沉到桥接层，模糊 `AgentBridge` 边界。

## 决策 4：mode 切换后强制 fresh，通过在 continuation 绑定上记录建立时的 sandbox mode 实现

- **Decision**: 为 `ConversationSessionBinding` 增加“当前底层 session 对应的 sandbox mode”字段。若新 run 的 `resolvedSandboxMode` 与该字段不一致，`gateway` 生成 fresh 请求，不再续用旧 bridge session。
- **Rationale**: 仅靠 chat override 无法判断当前 continuation 是在哪个 mode 下建立的。把这一信息和 continuation 绑定一起保存，才能可靠判断“同一 chat 但不同权限档位”的会话边界。
- **Alternatives considered**:
  - 不记录，只在切 mode 时直接清空 continuation：实现可行，但会把一个纯权限变更动作隐式变成 reset，用户难以从状态看出原因。
  - 允许跨 mode 继续 resume：与权限边界相冲突，review 已明确不建议。

## 决策 5：`/new` 与 `/bind` 都要清理当前 chat 的 sandbox override

- **Decision**: `/new` 清除 continuation 和 sandbox override；若当前 session 执行 `/bind` 切换工作区，也一并清除 sandbox override。
- **Rationale**: 两种操作都会改变用户对“当前上下文”的理解。保留旧 override 会导致用户在新话题或新工作区里悄悄继承高权限设置，增加误用风险。
- **Alternatives considered**:
  - `/new` 不清 override：与“开新会话”心智模型不符，也已被 review 指出存在安全与审计风险。
  - `/bind` 保留 override：会把旧工作区的权限选择带入新工作区，语义更差。

## 决策 6：chat override TTL 固定为 30 分钟

- **Decision**: `/mode workspace-write` 与 `/mode danger-full-access` 建立的 chat override 固定持续 30 分钟；每次重复设置同一 chat 的 override 时刷新到新的 30 分钟窗口。
- **Rationale**: 规格、计划、测试和本地验证都需要一个明确且稳定的时长。固定值比用户自定义 TTL 更简单，也足以覆盖当前需求。
- **Alternatives considered**:
  - 不指定具体时长：会让实现、测试和运维文档无法稳定收敛。
  - 允许用户自定义 TTL：引入额外参数语法与授权语义，不符合本轮“单字段、低复杂度”目标。

## 决策 7：`/mode` 只在 Feishu chat 路径开放，scheduled job 与 external webhook 永远只走工作区默认值

- **Decision**: `/mode` 只影响当前飞书 `chat`；scheduled job 与 external webhook 不读取也不生成 chat override。
- **Rationale**: 非聊天触发没有稳定的交互式命令入口，且现有 trigger path 已经以工作区为执行边界。让它们固定使用工作区默认值可保持 trigger 行为可预期，并简化审计。
- **Alternatives considered**:
  - 允许 trigger 级 override：需要新增 trigger 配置字段和更复杂的 operator 语义，不属于本轮需求。
  - 从最近一次 chat override 继承：会让无 chat 上下文的 run 受聊天状态污染，破坏可解释性。

## 决策 8：bridge 层只做 Codex CLI 参数映射，不引入新的 carvis 权限抽象

- **Decision**: carvis 领域中保留 `CodexSandboxMode = "workspace-write" | "danger-full-access"`，`packages/bridge-codex` 直接把 `resolvedSandboxMode` 映射到 `codex exec --sandbox ...`。
- **Rationale**: 用户已明确希望权限字段贴近 Codex，而不是再引入 `sandboxed/elevated` 这类业务别名。这样 bridge 层职责也最清晰。
- **Alternatives considered**:
  - 再包装一层 `ExecutionMode`：会多一层映射，收益很小。
  - 同时暴露 approval policy：超出当前需求，也会引入额外风险面。

## 决策 9：operator 可见性以 run 持久化字段、`/status` 和结构化日志为主，不新增新的 run event type

- **Decision**: 本轮不新增独立的 `RunEventType`，而是在 `Run` 审计字段、`StatusSnapshot`、trigger presenter 和 runtime logger 中暴露 sandbox mode 与来源。
- **Rationale**: 当前用户面与管理面已经主要依赖持久化 run 状态和状态查询；新建事件类型会扩大兼容面，却不明显提升用户价值。
- **Alternatives considered**:
  - 新增专门的 mode change event：更细，但会扩展现有 event 契约和通知层，本轮收益不足。
