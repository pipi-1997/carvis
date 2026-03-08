# 数据模型：飞书 Codex 对话闭环

## AgentConfig

- **作用**: 表示当前本地 agent 的固定运行配置。
- **关键字段**:
  - `id`
  - `bridge`，首版固定为 `codex`
  - `workspace`
  - `timeout_seconds`
  - `max_concurrent`
- **约束**:
  - 一个运行中的 Carvis 实例只消费一个 `AgentConfig`
  - `workspace` 必须在启动时可解析为宿主机有效路径

## Session

- **作用**: 表示一个飞书 `chat` 到固定 agent/workspace 的绑定。
- **关键字段**:
  - `id`
  - `channel`，首版固定为 `feishu`
  - `chat_id`
  - `agent_id`
  - `workspace`
  - `status`
  - `last_seen_at`
- **状态**:
  - `active`
  - `disabled`
- **约束**:
  - `chat_id` 在同一渠道下唯一
  - `workspace` 默认等于当前 `AgentConfig.workspace`

## RunRequest

- **作用**: 表示由飞书消息触发的一次待执行请求。
- **关键字段**:
  - `id`
  - `session_id`
  - `agent_id`
  - `workspace`
  - `prompt`
  - `trigger_message_id`
  - `trigger_user_id`
  - `timeout_seconds`
  - `created_at`
- **约束**:
  - 创建时必须已经解析出 session
  - 必须显式携带 workspace，executor 不允许猜测

## Run

- **作用**: 表示一次排队或执行中的运行实例。
- **关键字段**:
  - `id`
  - `session_id`
  - `agent_id`
  - `workspace`
  - `status`
  - `queue_position`
  - `started_at`
  - `finished_at`
  - `failure_code`
  - `failure_message`
  - `cancel_requested_at`
- **状态**:
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `cancelled`
- **约束**:
  - 同一 `workspace` 任意时刻最多一个 `running`
  - `queue_position` 仅在 `queued` 状态有效

## RunEvent

- **作用**: 表示运行生命周期中的规范事件。
- **关键字段**:
  - `id`
  - `run_id`
  - `event_type`
  - `payload`
  - `created_at`
- **首版事件类型**:
  - `run.queued`
  - `run.started`
  - `agent.summary`
  - `run.completed`
  - `run.failed`
  - `run.cancelled`
- **约束**:
  - 事件按创建顺序追加
  - `payload` 必须足以支持用户通知与运维排查

## OutboundDelivery

- **作用**: 表示一次回推飞书会话的消息投递。
- **关键字段**:
  - `id`
  - `run_id`
  - `chat_id`
  - `delivery_kind`
  - `content`
  - `status`
  - `attempt_count`
  - `last_error`
  - `created_at`
  - `updated_at`
- **状态**:
  - `pending`
  - `sent`
  - `failed`
- **约束**:
  - 投递失败需要保留错误原因
  - 同一 `run` 可以对应多次状态更新投递
