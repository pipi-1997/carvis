# Research: 飞书会话内资源发送

## 决策 1：主契约是“向当前会话发送资源”，不是“让 agent 掌握 CLI 接线细节”

- **Decision**: 本功能的 agent-facing 契约定义为“在当前活动 run 内，把图片或文件直接发送到当前会话”。`carvis-media` 只是当前实现采用的 transport 形式，不是产品心智模型。
- **Rationale**: 真实 Feishu e2e 已证明，底层链路虽然能成功发送，但 agent 会被 PATH、worktree、`bun` 和 `runId` 等细节绊住。若不把主契约从 CLI 细节里抽出来，功能会继续“技术上存在、产品上难用”。
- **Alternatives considered**:
  - 继续把 `carvis-media` 直接当 agent 产品接口：会把 transport 缺陷误导成 agent 能力问题。
  - 完全隐藏 transport 且不保留 shell 入口：会损失测试与人工排障能力，当前阶段不必要。

## 决策 2：资源发送继续沿用既有 run tool relay，而不是终态附件补丁或 gateway 侧文本解析

- **Decision**: 本功能继续采用 `agent -> transport -> gateway internal run tool -> media delivery service` 的路径，复用既有 `agent.tool_call` / `agent.tool_result` 和 `GatewayToolClient` relay，不走终态 `{text, attachments}` 补丁，也不在 gateway 里二次解析普通文本意图。
- **Rationale**: 当前代码已经有稳定的 run tool relay seam：`executor` 在 [`run-controller.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/apps/executor/src/run-controller.ts) 中处理 `agent.tool_call`，并通过 [`gateway-tool-client.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/apps/executor/src/gateway-tool-client.ts) 调用 gateway。把资源发送纳入这条路径，能保持 agent-owned invocation 决策，并满足“运行中可发送资源”的要求。
- **Alternatives considered**:
  - 继续沿用终态附件 envelope：只能覆盖 run 结束后的补交付，无法满足活动 run 中任意调用。
  - 在 gateway 里解析终态文本或指令：会把 agent capability 降级为字符串约定，不符合当前 skill 路线。

## 决策 3：继续保留独立 `carvis-media` transport，但它必须是零配置主路径

- **Decision**: 当前实现继续保留独立的 `packages/carvis-media-cli/` 与 `packages/skill-media-cli/`，但要求 `bridge-codex` 把 `carvis-media` 以当前 shell 中可直接执行的方式暴露出来，不能要求 agent 手工切换 worktree、调用 `bun` 包装器或猜测二进制位置。
- **Rationale**: 用户已经确认继续采用 skill 路线。既然 transport 仍是 shell CLI，就必须把它产品化为真正的零配置主路径，否则 skill 文案必然失真。
- **Alternatives considered**:
  - 退回扩展 `carvis` 总 CLI：会把 operator-facing 命令与 agent-facing 运行时命令混在一起，增加误用面。
  - 完全不保留 shell transport：当前不利于测试和人工排障。

## 决策 4：资源来源支持本地路径和远端 URL，解析与获取由 gateway service 负责

- **Decision**: transport 只负责结构化转发 source 引用；真正的本地读取、远端获取、资源判型、失败分层由 gateway 侧 `MediaDeliveryService` 负责。source 允许本地路径和远端 URL，两者都以当前 run/session 上下文为作用域。
- **Rationale**: transport 是 shell facade，不应直接承担 durable audit 与渠道耦合逻辑。把解析和获取放在 gateway service，可以统一失败语义、可观测性与 operator 查询，同时保持 transport 契约稳定。
- **Alternatives considered**:
  - 让 CLI 直接读取文件或下载 URL 再上传：CLI 会承担过多副作用，测试和审计都更差。
  - 只支持一种 source：无法满足用户已确认的“本地 + 远端都支持”。

## 决策 5：为 media send 引入独立的 durable audit 模型，而不是仅复用 `OutboundDelivery`

- **Decision**: 保留 `OutboundDelivery` 记录最终“向飞书发送了什么消息”的结果，同时新增独立的 media delivery audit 实体，记录 source 解析、source 获取、渠道上传、最终发送四个层级的阶段状态与失败原因。
- **Rationale**: 现有 [`OutboundDelivery`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/packages/core/src/domain/models.ts) 只有 `pending/sent/failed` 和单个 `lastError`，足以表达文本或卡片发送，但不足以表达“远端下载失败”和“Feishu 上传失败”的差异。spec 明确要求 operator 能区分失败层级，因此需要独立持久化模型。
- **Alternatives considered**:
  - 只在 `RunEvent` payload 里追加日志：不利于 operator 查询和稳定 contract 测试。
  - 继续复用 `OutboundDelivery` 并把阶段编码到 `content` / `lastError`：语义脆弱，后续 presenter 难以稳定消费。

## 决策 6：Feishu 渠道侧直接支持图片/文件上传与发送，而不是统一降级成文本链接

- **Decision**: `packages/channel-feishu` 新增媒体上传与发送能力，至少覆盖图片和通用文件；当资源类型不支持或上传失败时，返回结构化错误，不自动降级为文本链接成功。
- **Rationale**: spec 明确要求用户在飞书当前会话里直接收到资源本体，而不是外链或说明文字。渠道适配层已经是 Feishu 专属协议边界，媒体上传逻辑应继续留在这里。
- **Alternatives considered**:
  - 一律只发文本链接：不满足核心用户价值。
  - 把媒体上传逻辑放到 gateway 或 executor：会破坏 `ChannelAdapter` 边界。

## 决策 7：session 约束在 gateway service 做硬校验，不允许 agent 指定任意目标 chat

- **Decision**: 正常调用路径不暴露 `chatId` / `userId` 作为业务参数；gateway 在执行媒体发送前，始终从当前 run/session 恢复目标会话，并拒绝任何缺失或不一致上下文。
- **Rationale**: 这是本功能最重要的安全边界。schedule 路径已经证明 gateway 可以用 run/session 上下文做作用域限制；媒体发送同样应该由 gateway 强制执行，而不是依赖 skill 自律。
- **Alternatives considered**:
  - 允许 agent 传 `chatId`：实现更直接，但会引入跨会话误发风险，与 spec 冲突。
  - 完全依赖 skill 约束不传目标：缺少硬门禁，不可接受。

## 决策 8：bridge 和 executor 只做 discoverability 与 relay，不承担渠道或媒体判型逻辑

- **Decision**: `packages/bridge-codex` 只负责把 transport 暴露到当前 shell，并注入必要的 `CARVIS_*` 上下文；`apps/executor` 继续只做通用 tool relay，不在 executor 内引入 Feishu、文件上传或 URL 下载逻辑。
- **Rationale**: 这保持了现有 `AgentBridge` / `ChannelAdapter` 边界，避免执行器演变成第二个渠道层。
- **Alternatives considered**:
  - 在 executor 直接完成媒体发送：会把运行控制和渠道投递耦合到一起。
  - 让 bridge 直接处理 media tool：会把渠道细节塞进 bridge。

## 决策 9：skill / prompt 必须以真实运行时保证为准

- **Decision**: 文档、skill 和 prompt 不能再宣称“Runtime context is already resolved internally”这类尚未稳定成立的保证。只有在 transport discoverability 与上下文恢复已经产品化后，才能做对应承诺。
- **Rationale**: 这次 e2e 的核心问题不是没有发送能力，而是 agent 被误导，认为它应当信任一个实际上并不稳定的 happy path。错误承诺会直接放大 agent 的错误行为。
- **Alternatives considered**:
  - 保持乐观文案不变：会继续制造“文档说可以，运行时却不行”的问题。
  - 让 agent 自行排查环境作为默认行为：成本高、速度慢，而且不符合产品目标。

## 决策 10：media skill 应收敛为低自由度 SOP，而不是开放式工具说明

- **Decision**: `skill-media-cli` 和注入 prompt 采用“命中意图 -> 直接发送 -> 失败即停”的单一路径，并补少量高频示例；不再给 agent 留下自主排查 PATH、worktree、`bun`、上下文变量的默认空间。
- **Rationale**: 真实链路已经稳定后，剩余风险主要来自 agent 行为发散，而不是 transport 本身。官方 skill / prompt 最佳实践都更偏向短流程、少选项和具体示例；这与本功能的低心智负担目标一致。
- **Alternatives considered**:
  - 继续只写抽象规则：约束过弱，agent 仍可能自行“发挥”。
  - 完全依赖 runtime 自愈：对当前实现不现实，而且会掩盖行为问题。
