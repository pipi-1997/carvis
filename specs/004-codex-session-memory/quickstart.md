# 快速验证：Codex 会话续聊记忆

## 1. 前置条件

- `~/.carvis/config.json` 可用
- `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 已配置
- `gateway` 与 `executor` 可分别启动
- Feishu websocket 接入正常
- `codex` CLI 可运行

## 2. 启动本地 runtime

- 终端 A: `bun run start:gateway`
- 终端 B: `bun run start:executor`

## 3. 验证首次绑定

在飞书同一 `chat` 里发送第一条请求，例如：

```text
请记住我正在整理 carvis 的 004 规格，目标是续聊记忆。
```

预期结果：

- 请求正常进入既有运行链路
- 运行完成后，系统为当前 `chat` 建立续聊绑定
- `/status` 可看到当前会话已进入 `continued` 或等价表述

## 4. 验证同会话续聊

在同一 `chat` 继续发送：

```text
我上一条说的目标是什么？
```

预期结果：

- 用户无需重复背景
- 返回内容明确延续上一轮上下文
- 不会表现为完全新会话

## 5. 验证 `/new`

在同一 `chat` 发送：

```text
/new
```

随后再发送：

```text
我上一条说的目标是什么？
```

预期结果：

- `/new` 明确告知后续请求将从新会话开始
- 第二条普通消息不再延续旧上下文
- 当前 active run 不会因为 `/new` 被取消
- `/status` 会显示 `recent_reset`

## 6. 验证自动恢复

人为准备一个已保存但不可恢复的续聊 session，再在同一 `chat` 发送普通消息。

预期结果：

- 系统识别旧续聊绑定无效
- 自动以新会话重试一次
- 若重试成功，用户仍得到本轮结果，且后续消息继续使用新绑定
- 若重试失败，用户收到明确失败结果，运维侧可看到“已尝试自动恢复但失败”，且 `/status` 显示 `recent_recovery_failed`

## 7. 验证既有运行语义不变

在第一条请求运行中，再发送第二条请求。

预期结果：

- 第二条请求仍进入既有 FIFO 队列
- 续聊能力不会绕过单工作区单活动运行约束
- 取消、超时、run heartbeat 失效语义保持不变

## 8. 自动化验证范围

本轮任务完成后，自动化测试至少应覆盖：

- `bridge-codex` 支持新会话和续聊会话两种执行输入
- 首轮成功后建立续聊绑定
- 同一 `chat` 的后续 run 默认读取绑定并进入续聊模式
- `/new` 清空绑定且不影响当前 active run
- 续聊失效时只自动恢复一次
- 自动恢复成功后回写新绑定
- 自动恢复失败时按既有 run.failed 语义收口
- `/status` 暴露 `fresh / continued / recent_reset / recent_recovered / recent_recovery_failed`

## 9. 本次实现完成后的验证命令

- `bun test`
- `bun run lint`
- `bunx tsc --noEmit`
- `git diff --check -- .`
