# Research: 飞书会话工作区绑定

## 决策 1：保持 `chat_id -> session` 边界不变

- **Decision**: 私聊和群聊都继续按飞书 `chat_id` 创建独立 session，不引入 `user_id` 归并，也不引入群内 thread/conversation 子层。
- **Rationale**: 这能在最小变更下解决“私聊默认 workspace、群聊显式绑定 workspace”的目标，同时避免把现有 `Session`、`ConversationSessionBinding`、queue/lock 语义整体重写。
- **Alternatives considered**:
  - 引入 `Conversation` 子层：更灵活，但超出本轮需求，且会连带改写 session memory 和命令语义。
  - 私聊按 `user_id` 合并：会让同一用户的多个私聊入口共享上下文，不符合已确认的严格隔离要求。

## 决策 2：把 workspace 绑定建模为独立持久化层

- **Decision**: 新增 `SessionWorkspaceBinding` 和 `WorkspaceCatalogEntry` 两类实体，分别表达“当前 session 命中了哪个 workspace”与“系统内有哪些全局唯一 workspace key 可供绑定”。
- **Rationale**: 这样可以把 continuation 绑定和 workspace 绑定解耦，避免 `/new`、`/bind`、`/status` 混淆职责，也让未来 `chatBindings`、手动绑定、创建结果有清晰持久化来源。
- **Alternatives considered**:
  - 直接把 workspace 写回 `Session.workspace`：会让 session 路由真值与解析结果混在一起，难以区分默认值、静态映射和手动绑定来源。
  - 只靠运行时配置解析，不持久化 session 绑定：会导致 `/status`、重启恢复和 operator 排障能力不足。

## 决策 3：私聊默认命中 `defaultWorkspace`，群聊未绑定不创建 run

- **Decision**: 私聊首次普通消息默认解析到 `defaultWorkspace`；群聊只有在命中手动绑定或静态 `chat_id -> workspace` 映射时才允许创建 run，否则直接返回引导提示。
- **Rationale**: 私聊需要低门槛启动，群聊则需要显式防呆，避免消息误落入错误工作区或污染队列。
- **Alternatives considered**:
  - 群聊也默认命中 `defaultWorkspace`：容易让多个群共享同一代码目录而不自知。
  - 群聊未绑定时创建失败 run：会污染 runs 历史，并让 executor 处理本不该执行的请求。

## 决策 4：`/bind` 语义为“有则绑定，无则按默认 template 创建并绑定”

- **Decision**: `/bind <workspace-key>` 首版统一承担两条路径：workspace key 已存在则直接绑定，不存在则使用默认 template 在托管根目录下创建新 workspace 并绑定。
- **Rationale**: 这符合用户期望，也避免把“绑定现有”和“创建新 workspace”拆成两套入口，降低群聊 onboarding 成本。
- **Alternatives considered**:
  - 分成 `/bind` 和 `/create-workspace`：概念更纯，但会增加用户学习成本。
  - 不允许自动创建：会迫使操作者先登录宿主机准备目录，与“群聊自助绑定”目标冲突。

## 决策 5：创建新 workspace 必须依赖默认 template

- **Decision**: 新 workspace 默认必须按 template 初始化；当 template 缺失、不可读或初始化失败时，`/bind` 创建路径必须拒绝执行。
- **Rationale**: 这让新 workspace 具备稳定骨架，避免出现“空目录能创建但后续运行没有必要文件”的半成品状态。
- **Alternatives considered**:
  - bare 空目录兜底：实现简单，但产物质量不可控，后续 run 失败原因也更难解释。
  - 从远端仓库自动 clone：太重，超出本轮需求与权限假设。

## 决策 6：手动 `/bind` 优先级高于静态 `chatBindings`

- **Decision**: 当群聊已有静态 `chat_id -> workspace` 映射时，手动 `/bind` 允许覆盖当前 session 的解析结果，并在后续解析中优先命中手动绑定。
- **Rationale**: 静态映射应该是首次默认路由，而不是阻止用户在运行期自助迁移 session 的硬约束。
- **Alternatives considered**:
  - 静态映射不可覆盖：会迫使每次调整都修改配置文件，降低群聊自助性。
  - 覆盖仅临时生效：语义不稳定，用户很难预测重启或重建 session 后会发生什么。

## 决策 7：活动运行期间禁止 `/bind` 切换 workspace

- **Decision**: 当前 session 若已有活动运行，`/bind` 切换必须被拒绝，并提示等待结束或先 `/abort`。
- **Rationale**: 这样可以避免“活动运行仍在旧 workspace，而 session 已切到新 workspace”的裂脑状态，保持 `/status`、queue 和用户认知一致。
- **Alternatives considered**:
  - 允许立即切换：会让同一个 session 的 active run 与后续消息命中不同 workspace。
  - 切换时自动取消 active run：过于激进，不符合“取消要显式触发”的既有产品习惯。
