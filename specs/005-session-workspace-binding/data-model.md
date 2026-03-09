# 数据模型：飞书会话工作区绑定

## `Session`

- **作用**: 继续表示飞书 `chat_id` 到渠道会话的绑定。
- **本轮变化**:
  - 路由边界保持不变，仍由 `channel + chatId` 唯一确定
  - `workspace` 不再被视为当前 session 的唯一运行真值来源，而是被 `SessionWorkspaceBinding` 覆盖
  - 可预留 `conversationHint` / `threadHint` 这类未来扩展字段，但本轮不参与路由
- **约束**:
  - 私聊和群聊都严格按 `chat_id` 隔离
  - 同一用户的不同私聊/群聊不得合并为同一 session

## `SessionWorkspaceBinding`

- **作用**: 表示某个 session 当前解析出的 workspace 绑定状态。
- **关键字段**:
  - `sessionId`
  - `chatId`
  - `workspaceKey`
  - `bindingSource`
  - `createdAt`
  - `updatedAt`
- **枚举建议**:
  - `bindingSource`: `default` | `config` | `manual` | `created`
- **约束**:
  - 每个 `sessionId` 最多只有一个当前绑定
  - 当前 session 有活动运行时不得更新为新的 `workspaceKey`
  - `bindingSource = created` 时，必须存在对应的 `WorkspaceCatalogEntry`

## `WorkspaceCatalogEntry`

- **作用**: 表示系统内一个全局唯一的 workspace 注册项。
- **关键字段**:
  - `workspaceKey`
  - `workspacePath`
  - `provisionSource`
  - `templateRef`
  - `createdAt`
  - `updatedAt`
- **枚举建议**:
  - `provisionSource`: `default` | `config` | `template_created`
- **约束**:
  - `workspaceKey` 全局唯一
  - 一个 `workspaceKey` 只能指向一个物理工作目录
  - 当由 `/bind` 创建时，必须记录其 template 来源或等价初始化来源

## `ConversationSessionBinding`

- **作用**: 继续表示当前 session 的 Codex continuation 绑定。
- **本轮变化**:
  - 与 `SessionWorkspaceBinding` 解耦
  - `/new` 只影响该实体，不影响 workspace 绑定
- **约束**:
  - workspace 切换不能自动清空 continuation，除非产品规则显式要求；本轮只要求 `/new` 保持既有语义

## `Run`

- **作用**: 继续表示一次排队或执行中的运行实体。
- **本轮变化**:
  - `workspace` 由 session 解析结果决定，而不再总是来自固定 `agent.workspace`
  - 对于群聊未绑定的普通消息，不会生成 `Run`
- **约束**:
  - queue/lock/heartbeat/cancel 语义仍完全按 `Run.workspace` 运行
  - 一旦 run 创建，后续 `/bind` 不得修改该 run 的 workspace

## `StatusSnapshot`

- **作用**: 当前 session 的轻量状态视图。
- **本轮变化**:
  - 新增 `workspaceKey`
  - 新增 `workspaceBindingState`
  - 继续保留 continuation 状态
- **约束**:
  - 当 session 未绑定 workspace 时，必须返回 `unbound`
  - `/status` 应能区分 workspace 状态和 continuation 状态这两个维度

## 状态迁移摘要

1. 首次私聊普通消息:
   - 创建 `Session`
   - 解析到 `defaultWorkspace`
   - 建立 `SessionWorkspaceBinding(bindingSource = default)`
   - 允许创建 `Run`

2. 首次群聊普通消息（无映射、无绑定）:
   - 创建 `Session`
   - 不建立 `Run`
   - 不建立 `SessionWorkspaceBinding`
   - 返回 `unbound` 引导

3. 群聊命中静态映射:
   - 创建 `Session`
   - 建立 `SessionWorkspaceBinding(bindingSource = config)`
   - 允许创建 `Run`

4. `/bind` 命中已有 workspace:
   - 建立或更新 `SessionWorkspaceBinding(bindingSource = manual)`
   - 后续解析优先命中手动绑定

5. `/bind` 创建新 workspace:
   - 创建 `WorkspaceCatalogEntry(provisionSource = template_created)`
   - 建立 `SessionWorkspaceBinding(bindingSource = created)`

6. 活动运行中 `/bind`:
   - 绑定更新被拒绝
   - 当前绑定保持不变

7. `/new`:
   - 只重置 `ConversationSessionBinding`
   - `SessionWorkspaceBinding` 保持不变
