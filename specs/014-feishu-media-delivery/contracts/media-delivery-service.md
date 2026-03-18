# 合同：Media Delivery Service

## 1. 服务职责

- `MediaDeliveryService` 是 gateway 内部唯一允许执行 session-scoped 资源发送的业务入口
- 该服务必须统一处理：
  - 当前 run / session 上下文校验
  - source 解析与获取
  - durable media delivery audit 写入
  - Feishu 渠道上传与最终发送
  - 结构化结果返回

## 2. 会话与作用域规则

- 服务只允许把资源发送到当前 run 绑定的会话
- 服务不得接受任意目标 `chatId` / `userId` 作为业务输入
- 服务接收的上下文必须来自可信 transport 或 gateway relay，而不是 agent 自带的授权参数
- 当 run 已结束、session 缺失或上下文不一致时，服务必须拒绝调用

## 3. source 规则

- 本地路径与远端 URL 都属于受支持 source
- 本地路径不可读或不存在时，服务返回 source 失败
- 远端 URL 无法获取时，服务返回 source 失败
- 渠道不支持的资源类型必须返回明确拒绝或失败，而不是静默降级成文本链接成功

## 4. durable audit

- 每次媒体发送尝试都必须创建或更新一条 durable media delivery audit 记录
- audit 至少要能表达：
  - source 类型
  - source 引用摘要
  - 当前 run / session / chat
  - 当前阶段状态
  - 失败阶段与失败原因
  - 最终 outbound reference
- 对于 transport 尚未进入 durable service 的缺陷，至少要有等价 operator-visible 诊断

## 5. 与 `OutboundDelivery` 的关系

- 最终渠道发送动作仍需落到 `OutboundDelivery`
- `OutboundDelivery` 只表示最终出站消息结果
- source 与 upload 阶段失败不能只写进 `OutboundDelivery`

## 6. 失败语义

- 至少要能区分：
  - `invalid_context`
  - `missing_transport`
  - `source_not_found`
  - `source_unreadable`
  - `fetch_failed`
  - `upload_failed`
  - `delivery_failed`
  - `unsupported_by_channel`
- 服务必须把这些失败映射到结构化 `MediaToolResult`

## 7. run lifecycle 约束

- 媒体发送附着于当前活动 run
- 不创建新的 `Run`
- 不绕过既有 queue / lock / cancel / timeout / heartbeat 语义
- run 终止后，不得继续发送未完成资源
