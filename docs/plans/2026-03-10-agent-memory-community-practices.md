# 社区最先进记忆系统实践与最新趋势 (2025.6 - 2026.3)

> 状态说明：本文档保留为社区调研和趋势参考。当前 `carvis` 的实际设计取舍与图表说明请查看 `[2026-03-10-workspace-memory-unified-design.md](/Users/pipi/workspace/carvis/docs/plans/2026-03-10-workspace-memory-unified-design.md)`。

**创建日期**: 2026-03-10
**状态**: 社区调研 / 参考文档
**关联领域**: Agentic Memory, Context Engineering, GraphRAG

本文档总结了 2025 年下半年到 2026 年第一季度，开源社区和工业界在 Agent 记忆系统上最先进的工程落地实践和技术趋势。这为 `carvis` 后续从“会话连贯性”向“高阶智能体记忆”演进提供了参考标杆。

---

## 一、 社区四大主流架构流派 (2025年实践基准)

在 2024-2025 年间，社区已经不再盲目推崇“将所有历史塞进向量数据库”，而是演化出了以下几种成熟的工程实践流派：

### 1. Letta (原 MemGPT)：LLM 操作系统流派
Letta 是将“Agentic Memory（主动式记忆）”做到极致的代表，其核心思想是将 Context Window 视为 RAM，外部存储视为 Disk。
* **三级存储池 (Three-Tier Memory)**:
  * **Core Memory (RAM)**: 永远在 Prompt 里的系统状态区，划分为不同的块（如 `<persona>`, `<human_preferences>`）。
  * **Archival Memory (Disk)**: 处理大容量的外部文档和历史库。
  * **Recall Memory**: 结构化的历史事件流记录。
* **自我编辑循环 (Self-Editing Loop)**: Agent 在思考期被赋予 `core_memory_replace`, `core_memory_append` 等工具。当感知到用户需求变更时，Agent 主动改写自己的 Core Memory，而不是被动等待 RAG 检索。
* **Sleeptime Compute (离线梦境计算)**: (2025 标志性特性) Agent 在系统空闲时，后台读取当天的对话日志，进行总结并更新长期记忆库，类似于人类的记忆巩固机制。

### 2. LangGraph：基于 Checkpoint 的状态机流派
代表了目前生产环境特别是 B 端复杂工作流的最标准落地方式。
* **Postgres 持久化器**: 社区基本统一使用 `langgraph-checkpoint-postgres`。每次节点执行完，整个图的状态（State）作为 Checkpoint 序列化入库。
* **Time Travel (时间旅行与分叉)**: 利用 Checkpoint，可以在代码里读取过去的任意状态 ID。如果执行出错，可直接“回滚”状态并重试其他分支，这正是 `carvis` 中 `run-event` 流可以借鉴的终极形态。
* **Context 截断节点**: 在计算图中硬编码 `Summarize_Node`，当上下文长度达到阈值时自动触发，将历史信息压缩为高密度摘要。

### 3. Zep / Graphiti：时序知识图谱流派 (TKG)
针对传统 RAG 在提取历史时的“时空错乱”问题（如把用户过去和现在的偏好混淆）。
* **实体与边提取**: 记忆不存原话，而是图结构（如 `User --[prefers_in_2024]--> Vue`）。
* **事实作废 (Fact Invalidation)**: 当用户偏好改变时（改用 React），旧节点不删除，而是边被标记为 Invalidated，并新建 `User --[prefers_in_2025]--> React`。
* **精准上下文工程**: 检索时只注入“当前活跃 (Active)”的事实，彻底解决记忆矛盾引起的幻觉。

### 4. 文件/Git 驱动流派 (如 OpenClaw & Cursor MDC)
针对 CLI 助手和本地开发环境的最实用模式。
* **Markdown 作为记忆实体**: 直接在项目目录维护 `.carvis/rules.mdc` 或 `MEMORY.md`。
* **Git-backed Context**: 记忆随代码版本和分支切换，完美匹配开发者的真实上下文。
* **工作日志追加**: Agent 遇到的坑或架构决策自动 append 到本地文件中。

---

## 二、 最新演进趋势 (2025.6 - 2026.3)

在 2025 年下半年到 2026 年初，随着基础模型（如 GPT-5.2 的 400K 窗口，Gemini 3.1 Pro 的 1M+ 窗口）能力的进一步提升，记忆系统的焦点从“如何塞下更多 Token”转向了**“认知耐久度 (Cognitive Endurance)”**和**“多模态图谱推理”**。

### 1. 从长上下文走向“层次化重构记忆 (Generative/Reconstructive Memory)”
* **反击“金鱼效应”**: 业界发现，即使是 1M 的窗口，模型在处理密集信息时依然会发生 Context Drift（上下文漂移）。
* **最新实践**: Agent 不再每次都读取原始 Event Log，而是通过类似强化学习（RLVR - Verifiable Rewards）的方式，学习如何将庞大的对话“压缩”成高维语义状态（Latent States），在需要时“重构”记忆的核心精髓，而不是机械式检索。

### 2. Agentic GraphRAG 的全面普及
如果说 2024 年是 Vector RAG 的天下，2025 末到 2026 年则是 **Hybrid GraphRAG** 的绝对主场。
* **双引擎检索 (Vibes vs. Facts)**: 
  * 向量搜索 (Vector) 用于寻找“模糊的语义关联” (Vibes)。
  * 知识图谱 (Graph) 用于确定的事实关联 (Facts，如“谁是这个模块的 Owner”）。
* **智能路由**: Agent 被赋予了自主判断能力，遇到结构化逻辑问题时走 GraphRAG 分支，遇到文本概括问题时走 Vector 分支，极大降低了由于纯向量搜索带来的幻觉和算力浪费。

### 3. 多智能体共享记忆 (Hive Mind Memory)
在 MAS (Multi-Agent Systems) 架构中，记忆正在成为一种跨智能体、跨进程的公共基建。
* 只要集群中的**任意一个 Agent**（例如某个执行 Code Review 的子 Agent）在特定 Workspace 中发现了一个依赖冲突（如 `pnpm v9` 的某个 bug），这个事实会立即被抽取并写入图谱。
* 集群中的**所有其他 Agent**（比如负责写测试的 Agent）在下一次推理时，能自动获取该事实，实现真正的“蜂群免疫”和组织级知识沉淀。

### 4. 模型上下文协议 (MCP - Model Context Protocol) 成为标杆
到了 2026 年初，Anthropic 推出的 MCP 已经成为连接 Agent 和记忆后端的“USB-C 接口”。
* 无论是外挂 Zep 的图谱数据库，还是连接本地的 SQLite，Agent 都不再硬编码适配器。
* 对于 `carvis` 而言，未来支持 MCP 意味着可以无缝接入任何符合标准的企业级记忆库或知识库，极大降低集成成本。

---

## 三、 对 Carvis 的近期/中期启示

结合这半年的最新趋势，`carvis` 可以规划如下的具体落地步骤：

1. **短期 (对应当前的 004/005)**:
   * 继续夯实基于 Postgres 的 Event Log 和原生 Session 续聊机制（类似 LangGraph 的 Checkpoint 初级形态），确保执行现场不丢。
   * 利用文件/Git 驱动流派，在 Workspace 下初始化 `.carvis/rules`。
2. **中期 (2026 演进)**:
   * 在 Gateway 或 Executor 侧实现一个低频运行的 `Condenser Worker`（吸收 Letta Sleeptime Compute 的思想），在后台将冗长的 `run-event` 提炼为高密度事实。
   * 探索将 MCP 作为读取 Workspace 静态规范的标准化接口。
