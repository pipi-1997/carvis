# Workspace Memory Runtime Contract

## 目的

定义 `Workspace Durable Memory MVP` 的用户可见运行契约。该 MVP 的主路径不是显式 memory 命令，而是“普通 run 中 agent 决定写 memory，host 决定 recall”。

## Contract

### 支持的记忆路径

| 路径 | 解释方式 | 是否进入现有 queue/lock |
| --- | --- | --- |
| 普通消息形成稳定长期事实 | 进入普通 run，由 Codex 在 guidance 约束下整理并写入 `.carvis/MEMORY.md` | 是 |
| 普通消息形成近期运行上下文 | 进入普通 run，由 Codex 视情况写入 `.carvis/memory/YYYY-MM-DD.md` | 是 |
| compaction 前静默 flush | 由 executor 在现有 run 生命周期内触发，给 agent 一次写入当天 daily memory 的机会 | 是 |
| 手工编辑 memory 文件 | 不经过命令入口；下一次普通 run 直接读取 | 不适用 |

### 非支持项

| 项目 | MVP 语义 |
| --- | --- |
| 显式 `/remember` / `/forget` 主工作流 | 不作为 MVP 主路径 |
| `/memory sync` | 不提供；文件是真相源 |
| gateway 侧 memory work item | 不提供 |
| 独立 memory tool / MCP | 不提供 |
| 独立 memory model | 不提供 |

### workspace 解析

1. 普通消息沿用现有 workspace 解析与入队逻辑。
2. 若当前 chat 处于 `unbound`，系统不得伪造 durable write，也不得伪造 recall 命中。
3. 多个 chat 绑定到同一 workspace 时，共享同一套 workspace memory 文件。

### 执行语义

1. memory 写入、recall 和 flush 都必须复用现有 queue、同一 workspace lock、同一 heartbeat / cancel 语义。
2. host 在 bridge 调用前必须注入 memory guidance，明确：
   - 什么值得写入 `MEMORY.md`
   - 什么更适合写入 daily memory
   - 哪些内容不应持久化
3. host 在普通 run preflight 阶段必须执行 bounded recall，默认来源为：
   - `.carvis/MEMORY.md`
   - 今天的 daily memory
   - 昨天的 daily memory
4. memory 是否写入成功，以真实文件变更为准，而不是以回答文本为准。

### 用户可见结果

#### 正常 durable write

- 当 agent 判定某条信息值得长期保留时，回复中应体现“已记录/已更新当前 workspace 记忆”。
- 若内容不稳定、歧义过大或不值得持久化，应拒绝写入并说明原因。
- 若本次写入只是合并或替换旧条目，回复中应体现“已更新现有记忆”，而不是误导为新增。

#### recall

- 普通 run 不要求用户显式触发 recall。
- 若 recall 命中，应使后续回答体现该上下文已被使用。
- 若 recall 未命中，不得伪造“系统已经读到相关 memory”。

#### 静默 memory flush

- flush 是内部 housekeeping 行为，不得向用户额外发送可见消息。
- 若 flush 没有形成文件变更，系统不得虚报 memory 已更新。

### 手工编辑文件

1. 手工修改 `.carvis/MEMORY.md` 或 daily memory 后，无需任何 sync 命令。
2. 下一次普通 run 的 preflight recall 必须直接读取新文件内容。
3. operator 可以把这些文件当作唯一 durable truth 直接检查。

### operator 检查点

operator 在排障时应优先检查：

1. 当前 workspace 下的 `.carvis/MEMORY.md`
2. 当前日期对应的 `.carvis/memory/YYYY-MM-DD.md`
3. 运行日志中的：
   - `workspace.memory.preflight`
   - `workspace.memory.write`
   - `workspace.memory.noop`
   - `workspace.memory.flush`
   - `workspace.memory.failed`
   - `workspace.memory.cancelled`
4. benchmark 报告中的 gate 结果是否为 `blocked`

## 状态与失败语义

| 场景 | 预期结果 |
| --- | --- |
| workspace 正在运行其他任务 | 新消息进入同一 queue，按 FIFO 等待 |
| workspace 未绑定 | 沿用现有未绑定提示，不声称 durable write 或 recall 成功 |
| run 失败且文件未变更 | 不得宣称记忆已写入 |
| run 因 timeout 到期 | 沿用现有 timeout 终态；不得把未完成的 memory write / flush 误判为成功 |
| run 成功且文件已变更 | 可视为 durable write 成功 |
| `/new` 后普通 prompt | continuation fresh，但 workspace memory 仍参与 recall |
| 手工改文件后下次运行 | 直接读取新文件，无需 sync |
| compaction 前 flush 未产生新变更 | 允许 `noop`，但不得产生可见消息 |

## 最小示例

```text
用户: 这个项目统一使用 bun，后面都别再提 yarn 了
系统: 我会把这条当前 workspace 的长期约定记录到 MEMORY.md
系统: 已更新当前 workspace 记忆：Decisions / 统一使用 bun
```
