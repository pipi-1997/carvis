# Agent 记忆系统演进蓝图 (2025 State of the Art)

> 状态说明：本文档保留为远期蓝图和行业趋势映射，不承担当前 MVP 设计职责。当前落地设计请查看 `[2026-03-10-workspace-memory-unified-design.md](/Users/pipi/workspace/carvis/docs/plans/2026-03-10-workspace-memory-unified-design.md)`。

**创建日期**: 2026-03-10
**状态**: 远期架构蓝图 / 参考文档
**关联分支**: `004-codex-session-memory`, `005-session-workspace-binding`

本文档基于 2024-2025 年业界头部 Agent（Cursor, Claude Code, Gemini CLI, OpenHands）以及独立记忆框架（Mem0, Zep）的架构演进，结合 `carvis` 当前的架构现状，梳理出 Agent 记忆与上下文工程的最佳实践，并为 `carvis` 的后续演进提供路线图。

---

## 1. 业界最佳实践与范式转变

在过去的演进中，Agent 记忆系统已经从单纯的“长下文历史拼接（Chat History）”和“粗暴的 RAG 向量检索”转变为**类似操作系统的多级存储架构（Multi-tiered Architecture）**和**主动式记忆（Agentic Memory）**。

### 1.1 记忆的分层模型
*   **L0 - 长期/静态记忆 (Durable Memory / Knowledge Base):**
    *   **表现形式**: 文件系统中的 Markdown 规则库（如 Cursor 的 `.mdc` 文件、OpenClaw 的 `MEMORY.md` 或 `IDENTITY.md`）。
    *   **特征**: 高度结构化、对人类透明可编辑、作为全局基准事实。
*   **L1 - 阵发/会话记忆 (Episodic / Session Memory):**
    *   **表现形式**: 数据库中的不可变事件流（Event Log Stream），如 OpenHands 的核心设计。
    *   **特征**: 记录完整的动作轨迹，支持状态回放（Replay）和会话恢复（Session Recovery）。当历史过长时，通过后台任务（Condenser）进行摘要折叠。
*   **L2 - 工作记忆 (Working Memory / JIT Context):**
    *   **表现形式**: 注入给 LLM 当前 Context Window 的高信噪比切片。
    *   **特征**: 包含系统 Prompt、刚检索到的代码切片、以及一个类似于 `NOTES.md` 的临时便签本（Claude Code 常用模式），用于隔离深层思考与主控流程。

### 1.2 事实提取 (Fact Extraction) 与混合搜索 (Hybrid Search)
单纯的向量数据库在代码/工程场景中存在严重的语义模糊问题。业界最新的记忆层（如 Mem0, Zep）引入了以下机制：
*   **事实提炼 (Nuggetization)**: 异步利用 LLM 将零散的对话日志提炼为原子的“事实（Facts）”并赋予生命周期（Update/Delete/Decay），从而实现记忆的自进化。
*   **混合搜索 (Hybrid Search)**: 结合 Dense Vector（语义搜索）与 BM25（精确关键词搜索），并通过 RRF（倒数秩融合）重排。这是解决代码库中变量名、特定报错精准定位的唯一出路。

### 1.3 Agentic Memory (主动式/智能体记忆) vs. Agentic RAG
2025 年的一个重要趋势是将“检索（RAG）”与“记忆（Memory）”解耦，并赋予记忆系统“Agentic（智能体化）”的特性。
*   **Agentic RAG (主动式检索)**: 侧重于**寻找外部事实**。Agent 自主决定是否搜索、搜索什么关键词、如何跨文档多跳推理（例如通过 LangGraph / LlamaIndex 工作流）。它是**只读 (Read-Only)** 的推理过程。
*   **Agentic Memory (主动式记忆)**: 侧重于**自我状态与知识的演进**。Agent 像管理卡片盒（Zettelkasten）一样管理自己的记忆库。
    *   **感知与巩固 (Perception & Consolidation)**: 当获取新信息时（如“用户现在改用 Rust 了”），Agent 会主动去记忆库中寻找旧信息（“用户喜欢 Python”），并**自主解决冲突**、更新节点链路。
    *   **Token 降本**: 通过主动维护一个高浓缩、去重的事实图谱（Knowledge Graph / GraphRAG），Agentic Memory 能比传统 RAG 减少高达 80% 的 Token 消耗，因为它提取的是“已消化的结论”而非“原始文档切片”。
*   **Memory-First 架构**: 在处理用户请求时，现代 Agent 会先查询 Memory（了解用户偏好、当前项目状态、已知 Bug），只有在 Memory 无法解答时，才触发 Agentic RAG 去阅读庞大的外部代码库或文档。

---

## 2. 对 `carvis` 当前架构的映射与验证

`carvis` 当前正处于建立基础通信与会话边界的阶段，正在落地的 `004` 和 `005` 规范与上述业界最佳实践高度契合：

### 2.1 会话续聊记忆 (`004-codex-session-memory`)
*   **当前定位**: 属于 **L1 / L2 记忆的初步实现**。
*   **架构对应**: 
    *   引入 `ConversationSessionBinding` 并在持久化层（Postgres）记录状态，符合不可变事实的追踪。
    *   首版**不采用**摘要回灌，而是依赖 Codex 原生 Session（利用底层 LLM 的长下文/缓存能力），这是一种极为务实的工作记忆（Working Memory）维持策略。
    *   明确了 `/new` 命令的边界，这为未来“上下文冷凝器（Context Condenser）”或会话截断提供了基础锚点。

### 2.2 工作区绑定 (`005-session-workspace-binding`)
*   **当前定位**: 属于 **L0 长期记忆的物理隔离基建**。
*   **架构对应**:
    *   通过 `SessionWorkspaceBinding` 实现了飞书 `chat_id` 与物理 Workspace 的解耦。
    *   这为未来在 `managedWorkspaceRoot` 内部署 `.carvis/rules/` 体系或 `MEMORY.md` 铺平了道路。只要 Session 落到了确定的 Workspace，Agent 就能在本地文件系统中建立私有的、持久化的**静态知识库**。

---

## 3. `carvis` 远期记忆系统演进路线 (Future Blueprint)

在 `004` 和 `005` 落地后，`carvis` 的记忆系统可以按以下路径向智能化演进，而无需破坏现有的 `gateway` / `executor` 解耦架构：

### Phase 1: 静态规则引擎 (文件系统驱动)
*   **机制**: 在默认的工作区模板（Default Template）中引入 `.carvis/memory.md` 或 `.carvis/rules.mdc`。
*   **行为**: `Codex CLI` 启动时（无论是 fresh 还是 continuation），将这些文件作为系统 Prompt 前置挂载。
*   **优势**: 实现零成本的 L0 长期偏好记忆（例如：“这个群聊的项目统一使用 TypeScript”），且管理员可以直接修改文件来“纠正” Agent。

### Phase 2: 异步事实提取器 (Fact Condenser Worker) - 迈向 Agentic Memory
*   **机制**: 在 `apps/executor` 中引入一个低优先级的后台服务（或复用 heartbeat 周期），定期读取 Postgres 中的 `RunEvent` 历史。
*   **行为**: 提取关键决策和状态（如“发现了一个无法解决的依赖冲突”、“用户偏好使用 YARN”）。并且，赋予这个 Worker **Agentic** 特性，让它自动合并和覆盖旧的事实，将其写回 Workspace 下的 `.carvis/facts.json` 或专门的数据库表。
*   **优势**: 剥离冗长的日志，让新会话（`/new` 之后）也能从精炼的事实中获益，打破会话隔离带来的“失忆”。

### Phase 3: Memory-First 混合检索引擎 (JIT Context 注入)
*   **机制**: 引入类似 Zep/Mem0 的轻量级本地混合检索引擎（BM25 + Vector）。
*   **行为**: 当用户发送指令时，`gateway` 首先拦截消息，对 Workspace 级的历史事实库和代码库进行**混合检索**。将最相关的前 3 条事实作为 `[Context Hint]` 拼接在用户的原始指令前，再进入队列交由 `executor` 处理。如果事实库不足以支撑，再在执行期由 Agent 发起 Agentic RAG 去阅读具体文件。
*   **优势**: 完美解决大项目下的上下文过载（Context Rot）问题，使得大模型不仅具备“会话连贯性”，更具备“全局洞察力”与“自我状态管理”能力。

## 4. 结论
`carvis` 坚持将**状态（Postgres）与协调（Redis）分离**，以及将**渠道（Gateway）与执行（Executor）分离**的原则，非常适合扩展为现代化的 Agent 架构。当下的核心是稳固 `004` 的短期状态连续性和 `005` 的长期数据隔离；随后，基于文本和文件的轻量级记忆（OpenClaw 模式）将是投入产出比最高的下一步演进，最终将走向完全自主更新的 Agentic Memory 架构。
