# 数据模型：工作区 Codex Sandbox 模式

## `CodexSandboxMode`

- **作用**: 表示 carvis 允许写入并传递给 Codex CLI 的 sandbox mode。
- **枚举值**:
  - `workspace-write`
  - `danger-full-access`
- **约束**:
  - 首版只允许这两个值
  - 所有配置、chat override、run 审计字段与 bridge 映射都必须复用同一枚举，避免语义漂移

## `WorkspaceSandboxPolicy`（配置态）

- **作用**: 表示某个 `workspaceKey` 的默认 Codex sandbox mode。
- **来源**: runtime config 中的 `workspaceResolver.sandboxModes`
- **关键字段**:
  - `workspaceKey`
  - `sandboxMode`
- **约束**:
  - `workspaceKey` 必须存在于 `workspaceResolver.registry`
  - 每个可执行 workspace 必须有且仅有一个默认 sandbox mode
  - 该配置必须进入 runtime fingerprint，配置漂移时仍按现有 `CONFIG_DRIFT` 语义降级

## `ChatSandboxOverride`

- **作用**: 表示某个飞书 `Session` 当前临时生效的 sandbox mode override。
- **关键字段**:
  - `sessionId`
  - `chatId`
  - `agentId`
  - `workspace`
  - `sandboxMode`
  - `expiresAt`
  - `setByUserId`
  - `createdAt`
  - `updatedAt`
- **约束**:
  - 每个 `Session` 最多存在一个当前 override
  - `workspace` 记录 override 建立时的工作区，用于审计和 `/bind` 清理
  - `expiresAt` 固定为最近一次 `/mode workspace-write` 或 `/mode danger-full-access` 成功设置后 30 分钟
  - 过期判断采用读时懒判定；过期记录可以继续保留到下一次更新或清理
  - scheduled job / external webhook 不创建此实体

## `ConversationSessionBinding`（扩展）

- **作用**: 继续表示某个飞书 `chat` 当前的 continuation 绑定。
- **新增字段建议**:
  - `sandboxMode`: `CodexSandboxMode | null`
- **约束**:
  - 当 `bridgeSessionId` 非空且绑定处于 `bound | recovered` 时，`sandboxMode` 必须记录创建该 continuation 的实际 mode
  - 当 `/new`、mode 变化触发 fresh、或绑定失效被清除时，`sandboxMode` 必须同步清空或重置为与绑定状态一致的值

## `RunRequest`（扩展）

- **作用**: 表示 gateway 创建、executor 将要消费的一次执行请求。
- **新增字段建议**:
  - `requestedSandboxMode`: `CodexSandboxMode | null`
  - `resolvedSandboxMode`: `CodexSandboxMode`
  - `sandboxModeSource`: `workspace_default | chat_override`
- **约束**:
  - `requestedSandboxMode` 在普通 Feishu chat 中表示当前用户显式请求或当前 chat override；在 scheduled job / external webhook 中允许为空
  - `resolvedSandboxMode` 必须在入队前确定，并贯穿整个 run 生命周期保持不变
  - `sandboxModeSource` 必须与解析逻辑一致，且可被运维查询

## `Run`（扩展）

- **作用**: 表示单次排队或执行中的持久化运行实体。
- **新增字段建议**:
  - `requestedSandboxMode`
  - `resolvedSandboxMode`
  - `sandboxModeSource`
- **约束**:
  - 三个字段必须随 queued run 一起持久化，不能等 executor 启动后补写
  - terminal 状态后字段仍可查询，用于失败审计和 trigger 查询面展示
  - queue、lock、cancel、timeout、heartbeat 语义不因这些字段而改变

## `StatusSnapshot`（扩展）

- **作用**: 表示 `/status` 文本化输出前的聚合状态。
- **新增字段建议**:
  - `sandboxMode`
  - `sandboxModeSource`
  - `sandboxOverrideExpiresAt`
  - `sandboxOverrideExpired`
- **约束**:
  - 当当前 chat 没有 override 时，来源必须为 `workspace_default`
  - 当 override 已过期但尚未物理清除时，`/status` 仍应按回退后的实际 mode 展示，并让用户看见“已过期”结果

## `TriggerExecution` / Trigger 查询载荷（投影扩展）

- **作用**: scheduled job 与 external webhook 的 operator 查询结果。
- **本轮变化**:
  - 不要求为 `TriggerExecution` 新增独立表字段
  - 但其关联的 run 投影必须能展示 `resolvedSandboxMode` 与 `sandboxModeSource`
- **约束**:
  - 非聊天触发的 `sandboxModeSource` 固定为 `workspace_default`

## 状态迁移摘要

1. 工作区默认执行:
   - `gateway` 根据 `workspaceKey` 读取 `WorkspaceSandboxPolicy`
   - 生成 `RunRequest.resolvedSandboxMode = workspace sandbox mode`
2. chat 设置 override:
   - `/mode workspace-write | danger-full-access` 写入或刷新 `ChatSandboxOverride`
   - `/status` 读取 override 并显示来源为 `chat_override`
3. chat override 过期:
   - 下次 `/status` 或普通消息读取时判定失效
   - run 回退到工作区默认 mode
4. continuation 与 mode 一致:
   - 若 `ConversationSessionBinding.sandboxMode === resolvedSandboxMode`，允许继续按既有续聊规则请求 bridge session
5. continuation 与 mode 不一致:
   - 本次 run 强制 `sessionMode = fresh`
   - 成功后用新的 `sandboxMode` 回写 continuation binding
6. `/new`:
   - 清除 continuation binding
   - 清除 `ChatSandboxOverride`
   - 下一条普通消息按工作区默认 mode + fresh 会话执行
7. `/bind` 切换工作区:
   - 现有 workspace 绑定变更
   - 当前 `ChatSandboxOverride` 清理，避免跨工作区沿用
   - 后续按新工作区默认 mode 解析
