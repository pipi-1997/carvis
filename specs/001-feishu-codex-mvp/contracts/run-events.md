# 合同：运行事件与桥接器契约

## `AgentBridge` 最小契约

当前功能只要求 `packages/bridge-codex` 满足以下行为：

- `startRun(request)` 能启动一次 Codex CLI 运行
- `cancelRun(runId)` 能取消当前活动运行
- `streamEvents(runId)` 能产出首版事件集合
- `healthcheck()` 能暴露 bridge 可用性

## `RunEvent` 首版事件集合

### `run.queued`

- **触发时机**: 请求进入队列
- **最小 payload**:
  - `run_id`
  - `workspace`
  - `queue_position`

### `run.started`

- **触发时机**: executor 获取锁并成功启动 Codex
- **最小 payload**:
  - `run_id`
  - `workspace`
  - `started_at`

### `agent.summary`

- **触发时机**: bridge 产生阶段性摘要
- **最小 payload**:
  - `run_id`
  - `summary`
  - `sequence`

### `run.completed`

- **触发时机**: 运行成功结束
- **最小 payload**:
  - `run_id`
  - `finished_at`
  - `result_summary`

### `run.failed`

- **触发时机**: 启动失败、执行失败、超时或心跳失效
- **最小 payload**:
  - `run_id`
  - `failure_code`
  - `failure_message`

### `run.cancelled`

- **触发时机**: `/abort` 成功取消 active run
- **最小 payload**:
  - `run_id`
  - `cancelled_at`
  - `reason`
