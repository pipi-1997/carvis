# 数据模型：飞书会话内资源发送

## `AgentMediaSendRequest`

- **作用**: 表示 agent 基于 skill 决策发起的一次媒体发送意图。
- **关键字段**:
  - `sourceType`: `local_path` | `remote_url`
  - `path`: 本地路径引用
  - `url`: 远端资源引用
  - `mediaKind`: `image` | `file` | `auto`
  - `title`: 可选显示标题
  - `caption`: 可选补充说明
- **约束**:
  - 一次请求只发送一个资源
  - `sourceType = local_path` 时必须提供 `path`
  - `sourceType = remote_url` 时必须提供 `url`
  - 不允许在该层输入中携带目标 `chatId`、`sessionId`、`userId`、`runId`

## `MediaTransportContext`

- **作用**: 表示由可信 runtime 注入、bridge、executor relay 或 gateway 请求包装恢复出的权威上下文。
- **关键字段**:
  - `runId`
  - `sessionId`
  - `chatId`
  - `workspace`
  - `userId`
  - `requestedText`
- **约束**:
  - 该上下文不是 agent 的业务输入
  - 该上下文必须由受控执行路径恢复，并由 gateway 再次校验
  - 若该上下文缺失或不一致，系统必须返回 `invalid_context` 或等价拒绝结果

## `MediaToolInvocation`

- **作用**: 表示当前实现里 shell transport 或 gateway tool relay 承载的一次结构化媒体调用。
- **关键字段**:
  - `actionType`: 固定为 `send`
  - `request`: `AgentMediaSendRequest`
  - `transportContext`: `MediaTransportContext`
- **约束**:
  - `transportContext` 可通过环境变量、relay payload 或测试 flags 注入
  - debug flags 只用于测试和运维，不是 agent 主路径契约
  - agent-facing 设计不能把该 envelope 误写成“需要 agent 手工拼接的参数集”

## `MediaToolResult`

- **作用**: 表示 gateway 对一次媒体发送调用返回给 agent 的结构化结果。
- **关键字段**:
  - `status`: `sent` | `rejected` | `failed`
  - `reason`: `invalid_context` | `missing_transport` | `source_not_found` | `source_unreadable` | `fetch_failed` | `upload_failed` | `delivery_failed` | `unsupported_by_channel` | 其他可扩展失败原因
  - `mediaDeliveryId`: 关联的 durable media delivery audit id
  - `targetRef`: 渠道最终资源引用或消息引用
  - `summary`: 给 agent 和日志使用的摘要
- **约束**:
  - 所有调用都必须返回结构化结果
  - `status = sent` 时必须能反查到一次成功的 media delivery audit
  - `status = rejected` 或 `failed` 时必须保留明确的 `reason`

## `RunMediaDelivery`

- **作用**: durable 审计实体，表示活动 run 内一次资源发送尝试的完整生命周期。
- **关键字段**:
  - `id`
  - `runId`
  - `sessionId`
  - `chatId`
  - `sourceType`
  - `sourceRef`
  - `mediaKind`
  - `resolvedFileName`
  - `mimeType`
  - `sizeBytes`
  - `status`: `requested` | `source_failed` | `uploading` | `upload_failed` | `sending` | `sent` | `failed`
  - `failureStage`: `transport` | `context` | `source` | `upload` | `delivery` | null
  - `failureReason`
  - `outboundDeliveryId`
  - `targetRef`
  - `createdAt`
  - `updatedAt`
- **约束**:
  - 每次媒体发送尝试都必须先创建一条记录，或在 transport 尚未进入 durable service 时留下等价 operator-visible 诊断
  - `chatId` 必须来自当前 run/session 绑定，而不是 agent 参数
  - `sent` 状态时必须能够关联最终的 `OutboundDelivery`
  - `source_failed`、`upload_failed` 和 `failed(delivery)` 必须保留阶段化失败原因

## `OutboundDelivery`

- **作用**: 继续表示“最终向渠道发送了一条出站消息或资源”的记录。
- **与本功能的关系**:
  - 需要扩展 `deliveryKind` 以表达 `media_image` / `media_file` 或等价语义
  - 仅记录最终发送层，不承担 source 获取和上传阶段审计
  - `targetRef` 保存 Feishu 最终消息 id 或资源 id
- **约束**:
  - 不能用 `OutboundDelivery` 代替 `RunMediaDelivery`
  - 对应 `RunMediaDelivery.status = sent` 的记录必须拥有一条成功的 `OutboundDelivery`

## `RunEvent`

- **作用**: 继续作为 run 生命周期规范事件。
- **与本功能的关系**:
  - 复用 `agent.tool_call` / `agent.tool_result` 记录 agent 触发了媒体发送
  - 不新增 Feishu 专属 run event 类型
  - `tool_result` payload 需要能承载 `MediaToolResult`
- **约束**:
  - 工具调用和 durable delivery audit 要能互相对应
  - run 终结后不得继续追加新的媒体发送尝试

## `Session / Run`

- **作用**: 保持现有 chat 与运行上下文的 canonical 边界。
- **与本功能的关系**:
  - `Run` 必须处于活动态时才能触发 `RunMediaDelivery`
  - `Session` 提供当前会话的 `chatId` / `sessionId` 作用域
  - 本功能不引入新的 run 类型，也不引入新的会话绑定模式

## 关系摘要

1. agent 基于 skill 形成一个 `AgentMediaSendRequest`
2. 当前实现通过 `carvis-media` 或 gateway tool relay 承载该请求
3. 可信 transport 恢复 `MediaTransportContext`
4. gateway 使用 `Run / Session` 校验上下文并创建 `RunMediaDelivery(requested)`
5. service 完成 source 解析与获取
6. `packages/channel-feishu` 完成上传与发送
7. 成功时写入或更新 `OutboundDelivery`
8. gateway 返回 `MediaToolResult`
9. `RunEvent(agent.tool_call/result)` 与 `RunMediaDelivery` / `OutboundDelivery` 共同形成 operator-visible audit

## 状态迁移摘要

1. transport 可用:
   - 当前 shell 或 relay 已能提供可信上下文
   - 请求进入 gateway durable service

2. 上下文拒绝:
   - 活动 run 不存在、session 不匹配、chat 不匹配或运行时上下文缺失
   - 返回 `MediaToolResult(status = rejected, reason = invalid_context)`

3. source 失败:
   - 本地文件不存在、不可读，或远端 URL 获取失败
   - `RunMediaDelivery` 进入 `source_failed`
   - 返回 `MediaToolResult(status = failed)`

4. 上传失败:
   - source 已解析
   - Feishu 上传阶段失败
   - `RunMediaDelivery` 进入 `upload_failed`
   - 不创建成功的 `OutboundDelivery`

5. 最终发送失败:
   - 上传已成功
   - 渠道发送消息或资源阶段失败
   - `RunMediaDelivery` 进入 `failed(failureStage = delivery)`
   - `OutboundDelivery` 标记 `failed`

6. 成功发送:
   - `RunMediaDelivery` 进入 `sent`
   - 对应 `OutboundDelivery` 标记 `sent`
   - 返回 `MediaToolResult(status = sent)`
