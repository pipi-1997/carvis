# Chat Commands Reference

本文记录 Feishu 会话内当前支持的高频命令及其语义。

## 命令列表

### `/help`

- 查看命令帮助

### `/bind <workspace-key>`

- 绑定或切换当前 chat 的 workspace
- 群聊未绑定 workspace 时，普通消息不会执行

### `/status`

- 查看当前会话状态
- 会显示 workspace、active run、队列位置、续聊状态和 sandbox mode 信息

### `/mode`

- 查看当前会话的 sandbox mode

### `/mode workspace-write`

- 将当前 chat 的 sandbox mode 临时切到 `workspace-write`
- 有效期 30 分钟

### `/mode danger-full-access`

- 将当前 chat 的 sandbox mode 临时切到 `danger-full-access`
- 有效期 30 分钟

### `/mode reset`

- 清除当前 chat 的 sandbox override
- 后续普通消息回到 workspace 默认 mode

### `/new`

- 重置当前 chat 的续聊绑定
- 清除当前 chat 的 sandbox override
- 不会打断活动中的 run

### `/abort`

- 取消当前活动运行

## 使用提示

### 群聊

- 群聊未绑定 workspace 时，应先 `/bind <workspace-key>`
- 若当前机器人配置要求 mention，需要按当前接入规则 `@机器人 /命令`

### 私聊

- 可直接发送普通消息或 `/命令`
- 默认走 `defaultWorkspace`

## 何时该看 operator 文档

如果你是在做本地 runtime 维护而不是会话内操作，转到：

- [../guides/operator-handbook.md](../guides/operator-handbook.md)

如果你在做 schedule 专题排障，转到：

- [../runbooks/schedule-management.md](../runbooks/schedule-management.md)
