# 本地 Runtime CLI Runbook

## 命令入口

- 首次引导：`carvis onboard`
- 启动：`carvis start`
- 停止：`carvis stop`
- 状态：`carvis status`
- 体检：`carvis doctor`
- 局部重配：`carvis configure feishu`、`carvis configure workspace`

## 本地文件

- `~/.carvis/config.json`
- `~/.carvis/runtime.env`
- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`
- `~/.carvis/logs/gateway.log`
- `~/.carvis/logs/executor.log`

## Ready 判定

只有同时满足以下条件才算 ready：

- `gateway /healthz.ready = true`
- `executor` 最近一次 startup report `status = ready`

## 常见失败码

- `CONFIG_DRIFT`
  - 含义：gateway / executor runtime fingerprint 不一致
  - 处理：确认两侧都读取同一份 `~/.carvis/config.json` 与 `~/.carvis/runtime.env`，然后重启
- `CODEX_UNAVAILABLE`
  - 含义：`codex` 或 `carvis-schedule` 不可执行
  - 处理：先跑 `codex --version` 和 `carvis-schedule --help`
- `FEISHU_WS_DISCONNECTED`
  - 含义：飞书 websocket 未 ready 或已断开
  - 处理：用 `carvis doctor` 检查凭据，并查看 `gateway.log`
- `INVALID_CREDENTIALS`
  - 含义：飞书 App ID / App Secret 不正确
  - 处理：执行 `carvis configure feishu`

## stale state 排障

- 现象：`~/.carvis/state/*.json` 存在，但进程已经退出
- 处理：直接执行 `carvis start`
- 预期：CLI 先清理 stale state，再继续启动

## 部分失败回滚

- `gateway` 启动失败：不再启动 `executor`
- `gateway` 未 ready：`start` 失败，保留明确错误
- `executor` startup report 为 `failed`：停止已拉起进程，并返回失败结果
- `stop` 遇到部分进程已退出：返回 `partial`，但仍清理本地 state

## 建议排障顺序

1. `carvis status`
2. `carvis doctor`
3. 查看 `~/.carvis/logs/gateway.log`
4. 查看 `~/.carvis/logs/executor.log`
5. 必要时执行 `carvis stop` 后再 `carvis start`
