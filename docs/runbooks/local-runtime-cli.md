# 本地 Runtime CLI Runbook

主说明文档已迁移到 [../guides/operator-handbook.md](../guides/operator-handbook.md)。本文保留为旧链接兼容入口和快速索引。

## 推荐阅读路径

### 首次安装

1. [../../README.md](../../README.md)
2. [../guides/operator-handbook.md](../guides/operator-handbook.md)

### 日常运维

1. [../guides/operator-handbook.md](../guides/operator-handbook.md)
2. 如涉及 schedule，再看 [schedule-management.md](schedule-management.md)

## 高速索引

- 首次引导：`carvis onboard`
- 启动：`carvis start`
- 停止：`carvis stop`
- 状态：`carvis status`
- 体检：`carvis doctor`
- 局部重配：`carvis configure feishu`、`carvis configure workspace`

## Ready 判定

只有同时满足以下条件才算 ready：

- `gateway /healthz.ready = true`
- `executor` 最近一次 startup report `status = ready`

## 高优先级失败码

- `CONFIG_DRIFT`
- `CODEX_UNAVAILABLE`
- `FEISHU_WS_DISCONNECTED`
- `INVALID_CREDENTIALS`

这些失败码的处理流程已收敛到 [../guides/operator-handbook.md](../guides/operator-handbook.md)。

## 常用本地文件

- `~/.carvis/config.json`
- `~/.carvis/runtime.env`
- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`
- `~/.carvis/logs/gateway.log`
- `~/.carvis/logs/executor.log`
