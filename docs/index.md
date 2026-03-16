# 文档导航

这不是第二份 `README`。本页只做一件事：按任务把你送到正确的文档层。

## Start Here

- 我第一次进入仓库
  - 看 [../README.md](../README.md)
- 我想先把系统跑起来
  - 看 [guides/operator-handbook.md](guides/operator-handbook.md)
- 我想开始改代码
  - 看 [guides/developer-onboarding.md](guides/developer-onboarding.md)

## Guides

连续任务流优先看 guides，而不是翻 reference 或历史 design docs。

- [guides/operator-handbook.md](guides/operator-handbook.md)
  - 本地安装、启动、状态检查、重配、排障分流
- [guides/developer-onboarding.md](guides/developer-onboarding.md)
  - 系统地图、边界、核心概念、测试分层和阅读顺序

## Reference

Reference 只放稳定事实，不承载完整流程。

- [reference/reference-cli.md](reference/reference-cli.md)
  - `carvis onboard/start/stop/status/doctor/configure` 命令语义
- [reference/reference-chat-commands.md](reference/reference-chat-commands.md)
  - Feishu 会话内 `/bind`、`/status`、`/mode`、`/new`、`/abort`
- [reference/reference-config.md](reference/reference-config.md)
  - `~/.carvis/config.json`、`runtime.env`、`state/*.json`、`logs/*`

## Architecture

想理解当前系统如何工作，先看这里：

- [architecture.md](architecture.md)
  - 当前实现的运行时拓扑、请求 / 执行流和约束

如果你是新开发者，建议先看 [guides/developer-onboarding.md](guides/developer-onboarding.md)，再进入架构文档。

## Runbooks

Runbook 面向故障和恢复，不是首次阅读入口。

- [runbooks/local-runtime-cli.md](runbooks/local-runtime-cli.md)
  - 本地 runtime CLI 快速索引
- [runbooks/schedule-management.md](runbooks/schedule-management.md)
  - schedule 管理专题排障、内部查询面和常见问题

## Archives

以下内容主要回答“为什么这样设计”，不是“现在怎么用”：

- `specs/`
  - 功能设计档案，按编号主题保存
- `docs/plans/`
  - 实施计划、设计草稿、调研和历史演化记录

建议使用方式：

- 想看当前系统怎么跑：先看 `README` / guides / architecture
- 想看某个能力为何这样定：再进入对应 `specs/<编号>-<主题>/`
- 想看某轮实现是如何拆分任务的：再读 `docs/plans/`

当前与已落地能力关系最紧密的 archive 包括：

- `specs/002-local-runtime-wiring`
- `specs/003-feishu-cardkit-results`
- `specs/004-codex-session-memory`
- `specs/007-agent-managed-scheduling`
- `specs/011-workspace-sandbox-mode`
- `specs/013-carvis-onboard-cli`
