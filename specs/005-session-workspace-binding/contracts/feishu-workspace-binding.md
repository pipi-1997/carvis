# 合同：Feishu 会话工作区绑定

## 1. session 路由

### 成功条件

- 飞书私聊和飞书群聊都必须继续按 `chat_id` 路由到独立 session
- 系统不得按 `user_id` 合并不同 `chat_id`

### 非目标行为

- 本轮不支持按 thread/topic/conversation 再次拆分 session

## 2. 普通消息解析

### 私聊

- 首次私聊普通消息必须自动解析到 `managedWorkspaceRoot` 下的 `defaultWorkspace`
- 若 `defaultWorkspace` 无法解析到有效 workspace，系统必须返回明确错误

### 群聊

- 若 session 已有手动 workspace 绑定，普通消息必须命中该绑定
- 若 session 没有手动绑定但命中静态 `chat_id -> workspace` 映射，普通消息必须命中该映射
- 若以上都未命中，普通消息不得创建 run、不得入队，而必须返回 onboarding 提示

## 3. `/bind <workspace-key>`

### 已存在 workspace

- 若 `workspace-key` 已存在于 catalog 或 registry，系统必须将当前 session 绑定到该 workspace
- 若当前 session 已绑定同一个 key，系统应返回幂等提示

### 不存在 workspace

- 若 `workspace-key` 不存在，系统必须使用默认 template 初始化新 workspace 并绑定
- 默认 template 至少必须提供 `README.md`、`.gitignore` 和 workspace 约定文件
- 若 template 缺失、不可读或初始化失败，系统必须拒绝创建并返回错误
- 若 managed workspace root 不可写或目标路径不可创建，系统必须拒绝创建、返回清晰错误，且不得写入新的 catalog 记录

### 活动运行保护

- 若当前 session 存在活动运行，`/bind` 不得切换 workspace
- 系统必须提示用户等待当前运行结束或先取消

### 覆盖规则

- session 级手动 `/bind` 必须覆盖静态 `chat_id -> workspace` 映射
- 后续普通消息解析必须优先命中手动绑定

## 4. `/status` 与 `/new`

### `/status`

- 必须展示当前 session 的 `workspaceKey`
- 必须展示 workspace 绑定来源：`default` / `config` / `manual` / `created` / `unbound`
- 必须继续展示 continuation 状态
- 即使最近一次 run 因 heartbeat expiry 失败，`/status` 仍必须展示当前 workspace binding，而不是退回 `unbound`

### `/new`

- 只允许重置 continuation 绑定
- 不得清除或更改当前 session 的 workspace 绑定
