# 研究记录：飞书 Codex 对话闭环

## Decision 1: 首版 session 边界按飞书 `chat` 建模

- **Decision**: 用飞书 `chat` 作为 session 主键，而不是 thread/topic 或 `user + chat` 组合。
- **Rationale**: 这样可以在首版稳定完成会话路由，不把飞书话题模型提前引入核心数据结构；同时它与“同一个机器人服务多个会话、多个会话共享同一个 agent/workspace”的产品语义一致。
- **Alternatives considered**:
  - `thread/topic`：更细，但首版需要先验证飞书话题模型和消息编辑能力，风险更高。
  - `user + chat`：能隔离同群不同用户，但会把 session 维度扩成用户态路由，不符合当前单 agent 共享 workspace 的目标。

## Decision 2: 运行反馈采用“状态变化 + 阶段性摘要 + 最终结果”

- **Decision**: 首版不要求逐 token 流式输出，只回推排队、开始、执行中摘要、完成/失败/取消。
- **Rationale**: 飞书消息投递与编辑成本高于终端流式输出；状态和摘要已经足以证明执行闭环、锁和队列逻辑，并且更稳。
- **Alternatives considered**:
  - 逐 token 流式输出：更接近 CLI 体验，但实现复杂且容易造成高频消息噪声。
  - 仅最终结果：过于粗糙，无法支撑 `/status` 与取消的用户心智。

## Decision 3: 单 agent 固定 workspace，由本地配置声明

- **Decision**: 首版只消费一个本地 agent 配置，使用固定 `bridge=codex` 与固定 `workspace`。
- **Rationale**: 这样能把会话路由与 workspace 安全问题聚焦到单一执行上下文，不把多 agent 管理或 workspace 切换提前引入。
- **Alternatives considered**:
  - `agents.list`：适合未来多 agent 编排，但首版配置与状态管理过重。
  - 会话内切换 workspace：与“一个 agent 一个固定 workspace”的产品模型冲突。

## Decision 4: 保持 gateway/executor 分离，而不是单体复刻参考项目

- **Decision**: 虽然交互形态参考 `claude-code-telegram`，但实现结构从第一天就保留 gateway/executor 分离。
- **Rationale**: 这样能够提前验证队列、锁、心跳和持久化状态，避免先写单体后再拆分的二次返工。
- **Alternatives considered**:
  - 先单体复刻：启动更快，但后续对宪法里的运行生命周期与工作区安全支持会需要重写。

## Decision 5: 首版测试以契约和集成为主

- **Decision**: 优先覆盖 Feishu 入站归一化、Codex bridge 事件映射、workspace 锁/队列、`/abort`、心跳失效。
- **Rationale**: 本功能的核心风险不在局部函数，而在渠道、bridge 和 executor 之间的集成边界。
- **Alternatives considered**:
  - 主要写单元测试：无法证明队列、心跳和消息回推闭环。
