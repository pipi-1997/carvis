# 快速验证：本地运行时接入

## 1. 准备 `~/.carvis/config.json`

在本机创建配置文件。本轮固定使用 Feishu `websocket` 长连接接入。

```json
{
  "agent": {
    "id": "codex-main",
    "bridge": "codex",
    "workspace": "/Users/pipi/workspace/carvis",
    "timeoutSeconds": 5400,
    "maxConcurrent": 1
  },
  "gateway": {
    "port": 8787,
    "healthPath": "/healthz"
  },
  "executor": {
    "pollIntervalMs": 1000
  },
  "feishu": {
    "allowFrom": ["*"],
    "requireMention": false
  }
}
```

## 2. 准备环境变量

至少准备：

- `POSTGRES_URL`
- `REDIS_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- 已登录的 `codex` CLI 所需环境变量（如有）

可以参考：

```bash
export POSTGRES_URL='postgres://carvis:carvis@127.0.0.1:5432/carvis'
export REDIS_URL='redis://127.0.0.1:6379/0'
export FEISHU_APP_ID='cli_xxx'
export FEISHU_APP_SECRET='xxx'
```

## 3. 启动依赖

- 启动本地 Postgres
- 启动本地 Redis
- 确认本机可以执行 `codex --version`

## 4. 启动双进程

- 在终端 A 执行 `bun run start:gateway`
- 在终端 B 执行 `bun run start:executor`

预期输出：

- `gateway` 输出 `runtime.gateway.starting` 和 `runtime.gateway.ready`
- `executor` 输出 `runtime.executor.starting` 和 `runtime.executor.ready`

## 5. 验证 Feishu 接入前置条件

- 不需要公网 HTTPS 入口
- 确认飞书应用已按长连接接入方式启用事件订阅

## 6. 验证 `gateway` 就绪与 Feishu 长连接状态

- 访问 `GET /healthz`
- 确认返回中包含：
  - HTTP 已监听
  - 配置合法
  - Feishu 入站已就绪或未就绪原因
  - `config_fingerprint`
  - 若出现漂移，则 `ready = false` 且错误码为 `CONFIG_DRIFT`

示例：

```json
{
  "ok": true,
  "state": {
    "http_listening": true,
    "config_valid": true,
    "feishu_ready": true,
    "feishu_ingress_ready": true,
    "config_fingerprint": "sha256...",
    "ready": true,
    "last_error": null
  }
}
```

## 7. 执行真实联调

在真实飞书会话中依次验证：

- 发送普通消息，收到阶段性摘要与最终结果
- 发送 `/status`，看到与持久化状态一致的结果
- 在运行中发送 `/abort`，收到明确取消结果

当前实现说明：

- 普通消息通过 Feishu `websocket` ingress 进入既有 `Session -> Run -> RunEvent` 路径
- `/status` 与 `/abort` 走同一条运行时接线，不再依赖测试内 webhook 夹具
- `executor` 默认通过 `codex exec` 驱动真实 Codex CLI；测试仍使用脚本化 transport

## 8. 故障验证

建议至少验证以下场景：

- `~/.carvis/config.json` 缺失或内容非法
- `POSTGRES_URL` 或 `REDIS_URL` 缺失
- Feishu 敏感信息缺失
- Codex CLI 不可用
- `gateway` 与 `executor` 配置不一致
  - 预期表现为 `GET /healthz` 返回 `ready = false`，且 `executor` 日志出现 `CONFIG_DRIFT`

## 9. 已执行验证

自动化验证已覆盖：

- `bun run lint`
- `bun test`
- `codex --version`

自动化集成测试覆盖：

- `gateway` 启动与 `GET /healthz`
- Feishu `websocket` 握手、过滤和归一化
- `executor` 启动报告与消费循环
- 本地双进程普通消息、`/status`、`/abort`
- `CONFIG_DRIFT` 的 `healthz` 降级与拒绝消费

当前机器的限制：

- 未安装本地 `postgres` / `redis-server`
- 因此本 quickstart 的真实双进程手工验证，需要操作者自行准备外部依赖后再执行
