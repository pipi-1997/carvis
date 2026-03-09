# 合同：Feishu 会话记忆命令

## 1. `/new`

### 触发条件

- 用户在已绑定或未绑定的飞书 `chat` 中发送 `/new`

### 成功条件

- 系统清空当前 `chat` 的续聊绑定
- 用户收到明确反馈，说明后续普通消息将从新会话开始
- 当前 active run 不被中断

### 边界要求

- 当当前 `chat` 原本没有续聊绑定时，`/new` 仍应返回成功且语义清晰
- `/new` 只影响当前 `chat`，不得影响其他飞书会话

## 2. `/status`

### 成功条件

- 除现有 workspace、active run、排队信息外，`/status` 还必须展示当前会话处于：
  - `fresh`
  - `continued`
  - `recent_reset`
  - `recent_recovered`
  - `recent_recovery_failed`

### 非目标行为

- `/status` 首版不要求暴露底层完整 `bridgeSessionId`
- `/status` 不负责展示长期记忆、摘要记忆或其他未纳入 `004` 范围的状态

## 3. 普通消息

### 成功条件

- 当当前 `chat` 有有效续聊绑定时，普通消息创建的 run 默认进入续聊模式
- 当当前 `chat` 无有效续聊绑定时，普通消息创建的 run 默认进入新会话模式
- 即使多个 `chat` 共享同一个 `workspace`，普通消息也只能命中当前 `chat` 自己的续聊绑定

### 恢复要求

- 若续聊模式在执行中被判定为无效，用户侧不需要先发送 `/new`
- 系统应在单次请求内自动恢复或明确失败
