# 合同：本地运行时契约

## `gateway` 健康检查

### `GET /healthz`

- **目的**: 让本地操作者确认 `gateway` 已启动，并查看联调前提是否满足。
- **成功响应**:
  - `status`: `200`
  - `body.ok = true`
  - `body.state.http_listening = true`
  - `body.state.config_valid = true`
  - `body.state.feishu_ready = true | false`
  - `body.state.feishu_ingress_ready = true | false`
  - `body.state.config_fingerprint` 为非空脱敏摘要
  - `body.state.ready = true | false`
- **失败响应**:
  - 若进程已启动但存在降级状态，仍可返回 `200`，但 `body.state.ready = false`
  - 若配置漂移被检测到，`body.state.ready = false` 且 `body.state.last_error.code = "CONFIG_DRIFT"`
  - 若请求路径不存在或进程未启动，则不属于本合同覆盖范围

## Feishu `websocket` adapter 契约

### 握手与事件归一化

- **目的**: 约束 Feishu `websocket` 长连接在适配层的最小行为，避免入站方式变化泄漏到核心执行流。
- **成功条件**:
  - 握手成功后，`gateway` 启动报告与 `GET /healthz` 都能反映 `feishu_ready = true`
  - 合法的 Feishu 消息事件在经过 allowlist 和 `requireMention` 过滤后，必须被归一化为既有 `InboundEnvelope`
  - 归一化输出必须保留稳定的会话键、消息键和发送者标识，以继续进入既有会话与运行路径
- **失败条件**:
  - 鉴权失败时，适配层必须暴露 `FEISHU_AUTH_FAILED`
  - 握手或连接建立失败时，适配层必须暴露 `FEISHU_WS_HANDSHAKE_FAILED`
  - 事件缺少最小必需字段时，适配层必须拒绝归一化，并记录明确失败原因
- **边界约束**:
  - allowlist / mention 过滤必须在 `channel-feishu` 内完成
  - `AgentBridge`、queueing 和 run-flow 不得感知入站来自 `websocket`

## `executor` 启动报告

### `stdout` 结构化状态事件

- **目的**: 让本地操作者在无额外 HTTP 面的前提下，明确看到 `executor` 的启动、依赖连接和消费循环状态。
- **事件要求**:
  - 至少输出 `starting`、`ready`、`degraded`、`failed` 这几类状态迁移事件
  - 事件中包含 `role = "executor"`、`status`、`config_fingerprint`、`postgres_ready`、`redis_ready`、`codex_ready`、`consumer_active`
  - 失败事件必须包含 `error_code` 和 `error_message`
  - 若检测到配置漂移，必须输出 `error_code = "CONFIG_DRIFT"` 且 `consumer_active = false`
  - 事件不得输出明文 secret

## `gateway` 启动报告

### `stdout` 结构化状态事件

- **目的**: 让操作者在读取 `healthz` 之前即可看到 `gateway` 的启动、Feishu 接入模式与未就绪原因。
- **事件要求**:
  - 事件中包含 `role = "gateway"`、`status`、`config_fingerprint`、`feishu_ready`、`feishu_ingress_ready`
  - 当 Feishu `websocket` 握手失败时，必须输出明确失败原因
  - 当检测到配置漂移时，必须输出 `error_code = "CONFIG_DRIFT"`

## 说明

- 本合同只描述本轮新增的本地运行时暴露面，不重复定义既有 `/status`、`/abort` 和运行事件业务语义。
