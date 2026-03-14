# 合同：Codex Sandbox Mode 解析与执行

## 1. 工作区默认值

### 成功条件

- 每个可执行 `workspaceKey` 都必须能解析到一个明确的默认 `CodexSandboxMode`
- 普通飞书消息、scheduled job 和 external webhook 在没有 chat override 时都使用该默认值
- 若工作区缺少默认 mode 配置，系统不得创建 run

### 边界要求

- sandbox mode 解析必须发生在 run 入队前
- 排队期间即使 chat override 过期，也不得影响已创建 run 的 `resolvedSandboxMode`

## 2. chat override

### 成功条件

- `/mode workspace-write` 和 `/mode danger-full-access` 仅影响当前飞书 `chat`
- `/mode reset` 清除当前飞书 `chat` 的 override，后续 run 回退到工作区默认值
- override 过期后，后续 run 与 `/status` 都必须表现为工作区默认值

### 非目标行为

- scheduled job 与 external webhook 不读取 chat override
- 其他飞书 `chat` 不共享当前 chat 的 override

## 3. continuation 边界

### 成功条件

- 当当前 continuation 绑定记录的 `sandboxMode` 与新 run 的 `resolvedSandboxMode` 一致时，系统可继续按既有续聊规则使用 bridge session
- 当二者不一致时，系统必须强制该 run 使用 fresh 会话

### 边界要求

- 不允许跨 `workspace-write` / `danger-full-access` 直接 resume 同一个底层 Codex session
- mode 切换后的首次普通消息若执行成功，后续 continuation 绑定必须回写为新的 sandbox mode

## 4. bridge-codex 参数映射

### 成功条件

- `resolvedSandboxMode = workspace-write` 时，bridge 使用 `codex exec --sandbox workspace-write`
- `resolvedSandboxMode = danger-full-access` 时，bridge 使用 `codex exec --sandbox danger-full-access`
- 新会话与 resume 会话都必须使用同一个 `resolvedSandboxMode`

### 非目标行为

- 本轮不改变 Codex approval policy
- 本轮不引入 `read-only` 映射

## 5. run 审计

### 成功条件

- 每条 run 都必须持久化 `requestedSandboxMode`、`resolvedSandboxMode` 和 `sandboxModeSource`
- operator 可从 run 查询面判断该 run 是否来自 `chat_override`

### 边界要求

- 非聊天触发的 `sandboxModeSource` 固定为 `workspace_default`
- 投递失败不得影响 run 审计字段可见性
