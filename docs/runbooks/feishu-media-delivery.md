# Runbook: Feishu Media Delivery

## 1. 适用范围

- 本 runbook 面向 `014-feishu-media-delivery`
- 适用于 agent 在活动 run 中通过 `carvis-media send` 向当前 Feishu 会话发送图片或文件
- 资源发送只允许回到当前 session，不允许跨 chat / 跨用户发送

## 2. 运行前检查

1. 确认 `gateway` 与 `executor` 使用同一份 `~/.carvis/config.json`
2. 确认 `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 已注入
3. 确认目标 Feishu `chat` 已执行 `/bind <workspace-key>`
4. 确认 `gateway /healthz` 为 ready，且 executor 已进入 `consumerActive = true`
5. 确认 `codex` CLI 与 `carvis-media` 在当前运行环境中可执行
6. 确认 `carvis doctor` 已通过

## 3. 核心链路

1. 用户在已绑定 workspace 的聊天里请求“直接发图片/文件”
2. gateway 在普通 prompt 中持续暴露 `carvis-media send` 能力
3. agent 在活动 run 中调用 `carvis-media send`
4. executor 通过既有 gateway tool relay 把结构化调用发到 `/internal/run-tools/execute`
5. gateway 在 `MediaDeliveryService` 中执行：
   - 当前 run / session 校验
   - source 解析与获取
   - `RunMediaDelivery` 审计写入
   - Feishu 资源上传与最终发送
   - `OutboundDelivery` 最终投递记录
6. operator 通过 `/internal/run-media` 查看本次资源发送的阶段状态与失败原因

## 4. 两条资源来源

### A. 本地路径

- 资源由当前 workspace 或宿主机路径提供
- 读取失败时返回 `source_not_found` 或 `source_unreadable`

### B. 远端 URL

- gateway 直接拉取 URL 内容
- 拉取失败时返回 `fetch_failed`
- v1 除 Feishu access token 刷新外不做额外自动重试

## 5. 常用排查面

- 健康检查：`GET /healthz`
- 运行媒体查询面：`GET /internal/run-media?runId=<run-id>`
- 普通 delivery 查询：查看 `OutboundDelivery`
- 运行事件：查看 `RunEvent(agent.tool_call/result)`
- 终端日志：关注 `gateway tool call failed`、媒体发送失败摘要、Feishu token refresh 相关日志

## 6. 常见问题

### 6.1 当前会话没有收到资源

- 先看 `/internal/run-media?runId=<run-id>`
- 若 `status = source_failed`：
  - 本地路径不存在或不可读
  - 远端 URL 获取失败
- 若 `status = failed` 且 `failureStage = delivery`：
  - 渠道最终发送失败
- 若没有记录：
  - 先检查 agent 是否真的调用了 `carvis-media`

### 6.2 `invalid_context`

- 现象：tool result 返回 `invalid_context`
- 原因：当前 run 已结束、没有 session，或 relay 丢失了 run/session 上下文
- 处理：
  1. 确认该调用发生在活动 run 内
  2. 确认 executor relay 请求体里包含 `runId`、`sessionId`、`chatId`
  3. 检查 `/internal/run-media` 是否留下 rejected 记录

### 6.3 `fetch_failed`

- 原因：远端 URL 不可达、返回非 2xx，或拉取过程异常
- 处理：
  1. 先在宿主机确认该 URL 能否访问
  2. 检查响应是否需要鉴权或有临时签名过期
  3. 若是 agent 生成的临时 URL，确认其生命周期足够长

### 6.4 `delivery_failed`

- 原因：Feishu 上传或最终发送失败
- 处理：
  1. 先看 `/internal/run-media` 的 `failureReason`
  2. 若是 token 问题，确认是否已发生自动 token refresh
  3. 若 refresh 后仍失败，检查 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 和应用权限

### 6.5 为什么没有额外自动重试

- v1 只沿用 Feishu access token 失效时的单次 refresh 语义
- 其余 source / upload / delivery 失败均立即返回，避免在 run 终态后继续投递资源

## 7. 手工调试

正常 agent 路径下，不需要手工传运行时上下文。

若在仓库根目录手工排障：

```bash
./packages/carvis-media-cli/bin/carvis-media.cjs --help
```

若要手工调用 `send`，至少需要：

- `--gateway-base-url`
- `--workspace`
- `--session-id`
- `--chat-id`
- `--requested-text`
- `--path` 或 `--url`

## 8. 验证命令

```bash
bun test tests/unit/carvis-media-cli.test.ts \
  tests/unit/feishu-runtime-sender.test.ts \
  tests/contract/media-delivery-tools.contract.test.ts \
  tests/contract/carvis-media-cli.contract.test.ts \
  tests/contract/bridge-codex-media.contract.test.ts \
  tests/contract/internal-run-media.contract.test.ts \
  tests/integration/feishu-media-send-session.test.ts \
  tests/integration/feishu-media-send-remote.test.ts \
  tests/integration/feishu-media-send-failures.test.ts

bun run lint
```
