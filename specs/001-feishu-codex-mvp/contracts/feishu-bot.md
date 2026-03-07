# 合同：Feishu Bot 会话与命令契约

## 入站消息契约

### 普通消息

- **来源**: Feishu webhook
- **最小输入**:
  - `chat_id`
  - `message_id`
  - `user_id`
  - `text`
- **归一化结果**:
  - `channel = "feishu"`
  - `session_key = chat_id`
  - `trigger_source = "chat_message"`
  - `command = null`
  - `prompt = text`

### `/status`

- **输入**: 纯文本命令 `/status`
- **结果**:
  - 不创建新的 `RunRequest`
  - 返回当前 session 绑定信息
  - 返回 active run 或最近运行状态

### `/abort`

- **输入**: 纯文本命令 `/abort`
- **结果**:
  - 若存在 active run，则发出取消信号
  - 若不存在 active run，则返回明确提示

## session 契约

- session 主键为飞书 `chat_id`
- 同一个 `chat_id` 的消息必须归属于同一个 session
- 首次命中时自动绑定到本地默认 agent 和固定 workspace

## 出站消息契约

### 状态消息

- **类型**: `status`
- **内容语义**:
  - 已排队
  - 已开始
  - 执行中摘要
  - 已取消
  - 已失败
  - 已完成

### 最终结果消息

- **类型**: `result`
- **内容语义**:
  - 输出最终摘要或结果
  - 若失败，包含可理解失败原因
