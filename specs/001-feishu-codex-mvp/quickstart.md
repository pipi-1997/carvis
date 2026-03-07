# 快速验证：飞书 Codex 对话闭环

## 1. 准备本地 agent 配置

在 `~/.carvis/config.json` 中声明当前 agent 的固定配置：

```json
{
  "agent": {
    "id": "codex-main",
    "bridge": "codex",
    "workspace": "/Users/pipi/workspace/carvis",
    "timeoutSeconds": 5400,
    "maxConcurrent": 1
  }
}
```

## 2. 启动依赖

- 启动 Postgres
- 启动 Redis
- 确保运行宿主机能执行 Codex CLI
- 配置飞书 webhook 指向 `apps/gateway` 暴露的入站地址

## 3. 启动服务

- 执行 `bun run dev:gateway`
- 执行 `bun run dev:executor`

## 4. 验证主流程

在飞书中对机器人发送普通消息，例如：

```text
帮我总结当前仓库的目标
```

预期结果：

- 会话首次命中时自动绑定到本地默认 agent 与 workspace
- 飞书内先收到“已排队”或“已开始”
- 执行过程中收到阶段性摘要
- 最终收到完成或失败结果

## 5. 验证 `/status`

发送：

```text
/status
```

预期结果：

- 返回当前 agent 标识
- 返回固定 workspace
- 返回当前 active run 或最近运行状态
- 若当前会话最近一次请求仍在排队，返回该请求前方队列长度

## 6. 验证 `/abort`

在运行过程中发送：

```text
/abort
```

预期结果：

- 当前 active run 被标记取消
- 飞书收到明确取消结果
- 后续排队请求保留

## 7. 故障验证

建议至少验证以下情况：

- 本地配置缺失 `workspace`
- Codex CLI 启动失败
- executor 心跳丢失
- 同一 workspace 的第二个请求进入队列
- webhook 签名错误或 chat 不在 allowlist 时请求被拒绝
