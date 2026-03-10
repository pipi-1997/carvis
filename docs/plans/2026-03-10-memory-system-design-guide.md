# 智能体记忆系统架构演进与设计指南 (Memory System Design Guide)

> 状态说明：本文档保留为历史设计导读，不再作为当前 `carvis` memory 实施依据。当前统一设计、详细时序图和可行性分析请查看 `[2026-03-10-workspace-memory-unified-design.md](/Users/pipi/workspace/carvis/docs/plans/2026-03-10-workspace-memory-unified-design.md)`。

**创建日期**: 2026-03-10
**状态**: 历史设计导读，不再扩写
**关联分支**: 承接 `004-codex-session-memory` 与 `005-session-workspace-binding` 的后续演进

本文档从“存什么、怎么存、何时读、怎么读”四个维度，深度剖析 `carvis` 记忆系统的架构设计，并给出一条从当前状态到“完全体 Agentic Memory”的清晰演进时间线。

---

## 第一部分：核心架构四维度

### 1. 记忆合适存储 (What to Store - 存什么？)

Agent 的上下文极易被噪音污染（Context Rot）。我们必须严格区分“废话”与“有效状态”。记忆存储应分为三类：

- **工作区静态事实 (L0 - Workspace Facts)**: 项目的架构约定（如“必须使用 NestJS”）、代码规范、全局部署命令、已知系统级 Bug。这些是不随一次会话结束而消失的“绝对真理”。
- **执行轨迹与状态 (L1 - Event / Session State)**: 用户原始的指令（Prompt）、Agent 调用的关键工具（如执行了什么 Shell 命令）、以及系统报错信息（Exit Code）。不要存单纯的“打招呼”或过度解释的文本。
- **用户与组织偏好 (L2 - User Preferences)**: 用户个人的习惯（如“不要给我解释，直接给代码”、“该群聊通常在处理运维侧问题”）。

### 2. 如何存储 (How to Store - 怎么存？)

摒弃“一锅端塞进向量数据库”的初级做法，采用**多级解耦存储 (Multi-tiered Storage)**：

- **Postgres (关系型存储)**: 用于存储 L1 的 `RunEvent` 和 `ConversationSessionBinding`。它保证了事务的强一致性和可溯源性（LangGraph Checkpoint 模式）。
- **Markdown 文件 / Git (文件系统)**: 用于存储 L0 和 L2。在 Workspace 目录下建立 `.carvis/memory.md` 或 `.carvis/rules/` 目录。**优势**：对人类完全透明，可用代码编辑器直接修改，且随 Git 分支版本控制切换，完美契合开发者心智（Cursor MDC 模式）。
- **Codex 原生 Cache (缓存)**: 依赖底层大模型自身的 Context Window / Caching 机制，托管单次 Session 内的短期记忆。

### 3. 何时读取 (When to Read - 何时读？)

读取时机直接决定了 Agent 的响应延迟和推理质量。分为三个关键触点：

- **Pre-flight (执行前 / Hydration)**: 在 `executor` 获得队列锁并准备调用 `Codex CLI` 之前。此时读取 Workspace 静态文件和 Postgres 中的 Session 绑定状态，作为启动参数（Prompt/Flags）注入。
- **In-flight (执行中 / JIT 动态读取)**: 当 Agent 在执行复杂任务时，遇到模糊概念，由 Agent **主动**调用工具（如 `read_memory` 或 `grep`）去读取更深层的上下文。这避免了把所有知识一开始就全塞进 Context Window。
- **Post-flight (空闲期 / 梦境提取)**: 这是一个隐性读取点。系统在后台定期读取历史日志，用于生成新的“浓缩记忆”并写入文件（Sleeptime Compute）。

### 4. 如何读取 (How to Read - 怎么读？)

- **静态文件拼接**: `bridge-codex` 层在组装指令时，将 `.carvis/memory.md` 的内容作为系统提示词（System Prompt）的头部拼接进去。
- **ID 桥接传参**: 针对会话记忆，只需从 Postgres 读取 `bridge_session_id`，以 `--session <id>` 的形式传给 Codex CLI，将短期记忆的管理权下放给底层大模型。
- **MCP 协议抽象 (未来)**: 读取操作最终应封装为 Model Context Protocol (MCP) 接口。`carvis` 只需向 Agent 暴露 `mcp://workspace/memory`，而不在代码里写死读文件的逻辑。

---

## 第二部分：演进时间线与具体设计 (Timeline & Implementation)

基于 `carvis` 当前的开发节奏，建议分三个阶段（Phases）平滑演进：

### Phase 1: 物理隔离与原生会话 (进行中：v0.1 - 2026 Q2)

**定位**: 建立基础护城河，跑通 `004` 和 `005`。

- **具体设计**:
  - **存储**: 只用 Postgres 记录 `SessionWorkspaceBinding`（路由）和 `ConversationSessionBinding`（续聊 ID）。
  - **读取**: `gateway` 查绑定 -> `executor` 取 ID -> `bridge-codex` 拼接 `codex exec resume`。
  - **规则**: 严格遵守 `004` 规范，**不做**历史摘要，**不**引入长记忆，完全依赖 Codex 自身的续聊能力。
- **验收点**: 同一个飞书群聊不仅能绑定固定目录，且能连续对话不失忆；`/new` 命令能稳定截断上下文。

### Phase 2: 引入“静态长记忆”与“离线提炼者” (中期：v0.2 - 2026 Q3)

**定位**: 解决 `/new` 之后的断崖式失忆，实现跨会话的知识沉淀（入门级 Agentic Memory）。

- **具体设计**:
  1. **默认模板升级**: 在 `005` 创建 Workspace 时，模板强制生成 `.carvis/memory.md`。
  2. **Hydration (注水)**: `bridge-codex` 发起运行前，读取该文件并作为 System Context 注入 Codex。这实现了**零成本人工干预**，用户可手写规则。
  3. **The Condenser Worker (异步提炼者)**:
    - 在 `executor` 中新增一个独立的后台队列或定时任务。
    - 当一个 `Run` 结束后，Worker 读取其 `RunEvent`（用户问了啥，报了什么错，最终怎么解决的）。
    - 调用一个轻量级 LLM (或特定 prompt) 提取出 `Facts`。
    - 将 Facts 自动 **Append (追加)** 或 **Replace (替换)** 到 `.carvis/memory.md` 中。
- **验收点**: Agent 在一次报错中学会了“这个项目用 Yarn 不要用 Npm”，用户执行 `/new` 开启新会话后，Agent 依然能避开 Npm 的坑。

### Phase 3: 主动式图谱记忆与 MCP 整合 (远期：v1.0 - 2026 Q4及以后)

**定位**: 达到 2026 年行业顶尖的 Agentic Graph 级别。

- **具体设计**:
  1. **接入 MCP 规范**: 废弃硬编码的文件读取，将 Workspace 的记忆库包装为一个 MCP Server。
  2. **Agentic Memory Tools**: `carvis` 不再在后台“偷偷”帮 Agent 总结，而是把 `write_memory` 和 `search_memory` 作为工具 (Tools) 暴露给 Codex Agent。
  3. **混合图谱引入**: 此时 `.carvis/memory.md` 可能会膨胀，引入轻量级本地混合图谱（如 Graphiti 或本地 SQLite 版多跳记忆库）。
  4. **自主心智**: Agent 在每次回复用户前，**主动**思考“我是否需要把刚才用户说的话记到记忆库里？”，并自己完成 API 调用。
- **验收点**: 具备组织级知识图谱能力，能应对极其复杂的代码重构上下文，且 Agent 能解释自己“为什么记得这件事”。

---

## 第三部分：架构专家建议 (Recommendations)

1. **坚持 L0 记忆的“文件化 (Markdown)”**：
  在 Phase 2 之前，千万不要引入任何向量数据库 (Vector DB)。向量数据库在处理代码标识符和项目状态时是“灾难级”的模糊。使用 `.carvis/rules.mdc` 结合 Git 管理，不仅 Agent 能懂，人类开发者也能随时审查和修改 Agent 的“大脑”。
2. **保持 Gateway 和 Executor 的职责纯粹**：
  记忆的提取和注入（Hydration）应该发生在 `executor` 甚至更下层的 `bridge-codex` 中。`gateway` 只负责通过 `chat_id` 路由到目标工作区，绝不应该在网关层去读写大量记忆内容，否则会阻塞 Feishu 的快速响应（Streaming Card）。
3. **“遗忘”比“记住”更重要**：
  设计 The Condenser (提炼者) 时，提示词（Prompt）中必须包含“去重与作废”的指令。如果只是一味地 Append 日志，Agent 很快就会因为前后矛盾的记忆而精神分裂。必须让它学会用新状态覆盖旧状态。
