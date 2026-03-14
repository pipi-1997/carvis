# 合同：Feishu Sandbox Mode 命令

## 1. `/mode`

### 支持形式

- `/mode`
- `/mode workspace-write`
- `/mode danger-full-access`
- `/mode reset`

### 成功条件

- `/mode` 返回当前飞书 `chat` 的实际 sandbox mode、来源以及 override 有效期或已过期状态
- `/mode workspace-write` 与 `/mode danger-full-access` 为当前 chat 建立或刷新一个持续 30 分钟的 override
- `/mode reset` 清除当前 chat 的 override

### 边界要求

- `/mode` 必须继续受现有 Feishu allowlist 保护；未授权请求不得建立或刷新 override
- 未知参数必须返回帮助提示，不得作为普通 prompt 执行
- 与当前已生效值相同的 `/mode` 变更应返回幂等提示

## 2. `/status`

### 成功条件

- 除现有 workspace、active run、排队信息与 continuation 状态外，`/status` 还必须展示：
  - 当前 sandbox mode
  - 来源：`workspace_default` 或 `chat_override`
  - override 剩余有效期或已过期结果

### 非目标行为

- `/status` 不要求暴露底层完整 `bridgeSessionId`
- `/status` 不负责展示 Codex approval policy 或未纳入本轮范围的权限轴

## 3. `/new`

### 成功条件

- 系统清除当前 `chat` 的 continuation 绑定
- 系统清除当前 `chat` 的 sandbox override
- 用户收到明确反馈，说明后续普通消息将从 fresh 会话和工作区默认 mode 开始
- 当前 active run 不被中断

## 4. 普通消息

### 成功条件

- 当当前 `chat` 有未过期 sandbox override 时，普通消息创建的 run 使用 `chat_override`
- 当当前 `chat` 无 override 或 override 已过期时，普通消息创建的 run 使用工作区默认 mode
- 若 mode 与 continuation 绑定记录的 mode 不一致，该 run 必须 fresh 执行

### 恢复要求

- mode 切换触发的 fresh 不视为失败，也不要求用户先发送 `/new`
- 多个共享同一 workspace 的 `chat` 只能命中各自的 override，不共享 mode 状态

## 5. `/bind`

### 成功条件

- 当当前 session 切换到另一个工作区时，系统清除当前 `chat` 的 sandbox override
- 用户后续在新工作区中的普通消息回到新工作区默认 mode

### 边界要求

- `/bind` 对 override 的清理不得打断当前 active run
