# 合同：Media Delivery Transport

## 1. 适用范围

- 该合同定义当前实现用于承载 agent 媒体发送请求的 transport
- 当前 transport 形式可以是 `carvis-media` shell CLI，但产品契约是“把资源发送到当前会话”，不是“让 agent 掌握一个复杂 CLI”

## 2. transport 集合

- 当前实现必须提供至少一个稳定 transport：
  - `carvis-media send`
- 后续如扩展 bridge 原生工具或其他 transport，不能破坏主能力语义

## 3. 正常路径上下文

- transport 在普通 agent 调用路径下必须从当前受控运行时自动解析或接收：
  - `workspace`
  - `runId`
  - `sessionId`
  - `chatId`
  - `userId`
  - `requestedText`
- 正常路径不得要求 agent 手工传这些字段
- 正常路径不得要求 agent 手工切换 worktree、调用 `bun` 包装器或搜索本地源码目录

## 4. transport 入参

- `carvis-media send` 至少支持：
  - `--path`
  - `--url`
  - `--media-kind`
  - `--title`
  - `--caption`
- `--path` 与 `--url` 至少命中其一，且同一调用只发送一个资源
- 正常业务参数中不得允许指定目标 `chatId` / `userId`

## 5. 调试与测试入口

- 显式上下文 flags 只用于调试、测试或人工排障，不得成为 agent 正常路径必须手工拼接的契约
- 如果 transport 无法恢复必要上下文，必须快速返回结构化失败，而不是让 agent 继续猜测环境

## 6. gateway 校验与执行

- gateway 必须校验：
  - 当前 run 仍处于活动态
  - 当前 session 上下文存在且可解析出目标 chat
  - 资源来源引用有效
  - 请求不会跨 workspace / 跨 session / 跨 chat
- 校验失败时，gateway 必须返回结构化结果，并保留失败审计

## 7. transport result

- gateway 对每次媒体发送调用必须返回结构化结果：
  - `status = sent | rejected | failed`
  - `reason`
  - `mediaDeliveryId`
  - `targetRef`
  - `summary`
- `status = sent` 表示资源已成功送达当前会话
- `status = rejected` 表示调用在上下文或权限边界校验阶段被拒绝
- `status = failed` 表示执行进入资源获取、上传或发送阶段后失败

## 8. 非目标行为

- transport 不得直接向 Feishu OpenAPI 发请求
- transport 不得直接写 durable state
- transport 不得在正常路径暴露任意目标 chat 发送能力
- transport 不得把 PATH、cwd、worktree、`bun` 和源码目录细节暴露为 agent 产品心智模型
