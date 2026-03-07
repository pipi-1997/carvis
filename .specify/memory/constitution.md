<!--
Sync Impact Report
Version change: 1.0.0 -> 1.1.0
Modified principles:
- I. Interface Boundary Discipline -> I. 接口边界纪律
- II. Durable Run Lifecycle -> II. 持久化运行生命周期
- III. Workspace Serialization and Safety -> III. 工作区串行化与安全
- IV. Operability Is a Feature -> IV. 可运维性即产品能力
- V. Contract-First Verification -> V. 契约优先验证
Added sections:
- Language and Documentation Policy
Removed sections:
- None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md
- ✅ .specify/templates/spec-template.md
- ✅ .specify/templates/tasks-template.md
- ✅ .specify/templates/agent-file-template.md
- ✅ .codex/prompts/speckit.constitution.md
- ✅ .codex/prompts/speckit.plan.md
- ✅ .codex/prompts/speckit.specify.md
- ✅ .codex/prompts/speckit.tasks.md
- ✅ .cursor/commands/speckit.constitution.md
- ✅ .cursor/commands/speckit.plan.md
- ✅ .cursor/commands/speckit.specify.md
- ✅ .cursor/commands/speckit.tasks.md
- ✅ .cursor/commands/speckit.checklist.md
- ✅ .cursor/commands/speckit.clarify.md
- ✅ .cursor/rules/specify-rules.mdc
- ✅ docs/architecture.md
Follow-up TODOs:
- None
-->
# Carvis 宪法

## 核心原则

### I. 接口边界纪律
所有渠道特定行为 MUST 通过 `ChannelAdapter` 实现封装，所有智能体运行时特定行为 MUST
通过 `AgentBridge` 实现封装。`apps/gateway`、`apps/executor` 与共享包之间 MUST 只通过
`InboundEnvelope`、`RunRequest`、`RunEvent`、`OutboundMessage`、`WorkspaceBinding`
等规范域模型，或保持相同语义的版本化后继类型进行通信。新增渠道或智能体集成 MUST
以独立包的形式接入，不得通过在核心控制流里增加平台分支来实现。理由：只有保持渠道扩展
与智能体扩展的线性复杂度，产品才能持续演进。

### II. 持久化运行生命周期
每一条入站消息、排队运行、运行状态迁移、出站投递与运维操作 MUST 都能映射为可持久化的
状态或事件记录，并且在成功、取消、超时或失败后仍然可审计、可检索。Postgres 是业务实
体和历史记录的事实来源；Redis 仅用于分发队列、锁、取消信号、心跳与事件扇出。执行器到
网关的通信 MUST 以规范的运行事件表达，使管理界面和通知系统无需登录主机即可说明发生了
什么。理由：可审计性与运维可置信度是产品核心能力，不是附属诊断信息。

### III. 工作区串行化与安全
同一个工作区在任意时刻 MUST 至多存在一个活动运行。针对同一工作区的新增请求 MUST
进入 FIFO 队列，执行器在拉起智能体进程前 MUST 获取分布式锁。任何涉及执行路径的功能变
更 MUST 明确定义锁释放、超时到期、取消处理与心跳丢失语义。除非需求另有说明，取消操
作 MUST 仅作用于当前活动运行。理由：宿主机本地工作区属于共享可变状态，必须以确定性的
并发规则保护。

### IV. 可运维性即产品能力
任何影响运行、投递、调度器、外部 webhook 或管理界面的变更 MUST 明确结构化日志、
重试策略、超时处理、心跳预期和运维可见的状态迁移。网关管理界面 MUST 能基于持久化状态
展示运行状态、投递状态与失败原因。凡是改变失败处理或调度行为的功能 MUST 同步记录通知
影响与 runbook 影响。理由：这是一个自托管的内部系统，必须让未参与开发的工程师也能支
持它。

### V. 契约优先验证
任何涉及适配器、桥接器、规范事件、排队、投递、调度或运行生命周期语义的变更 MUST
随附对应路径的契约测试与集成测试。v1 的最低覆盖范围 MUST 包括入站归一化、
`InboundEnvelope -> RunRequest -> RunEvent -> OutboundMessage` 管线、工作区队列
与锁行为、取消处理、调度器与外部 webhook 的路径一致性，以及执行器心跳失效处理。只停
留在文档描述而没有验证证据的工作，不得视为完成。理由：本项目最高风险的回归来自集成边
界，而非孤立函数内部。

## 架构约束

Carvis 是一个基于 Bun 的多渠道智能体网关，运行时 MUST 保持 `apps/gateway` 与
`apps/executor` 的双进程拆分部署。核心业务实体 MUST 持久化到 Postgres；协调原语
MUST 使用 Redis；工作区 MUST 保持为宿主机本地目录并显式加锁。v1 的入站集成 MUST
仅使用经过校验的 webhook；智能体执行 MUST 保持为桥接抽象后的 CLI-first 模式。网关
MUST 承载管理界面、内部管理 API、调度器、webhook 触发入口与出站通知管线；执行器
MUST 负责运行执行、取消与超时处理以及心跳上报。

## 交付流程

在进入实现前，规格说明与实施计划 MUST 标明受影响的渠道、受影响的智能体桥接器、规范
实体变更、执行路径变更与面向运维的影响。每份计划中的 Constitution Check MUST 在研
究和设计阶段被视为硬门禁；任何例外 MUST 在 Complexity Tracking 中记录具体理由与被
拒绝的更简单替代方案。任务列表 MUST 继续围绕可独立验证的用户故事组织，但只要故事触及
受约束边界，就 MUST 同时包含契约测试、集成测试、可观测性和 runbook 相关任务。若改
动 prompt 或命令文件，且仓库中存在镜像命令树，则 MUST 同步更新 `.codex/prompts/`
与 `.cursor/commands/`，避免不同入口出现规则漂移。

## 语言与文档策略

仓库中的 spec、plan、tasks、checklist、architecture 文档以及其他面向项目协作的说明
文档，默认 MUST 使用简体中文撰写。标题、正文、注释、分析报告、操作说明与生成结果
MUST 优先使用中文；文件路径、命令名、代码标识符、协议字段名以及 `FR-001`、`SC-001`、
`OR-001` 这类结构化 ID SHOULD 保持原文以避免自动化与实现语义漂移。若因外部集成、
法规、第三方契约或公开接口要求必须保留英文，文档 MUST 明确标注原因与范围。理由：项
目主要协作者是中文母语者，默认中文可以显著降低需求理解与维护成本。

## 治理

当本宪法与局部 prompt 默认值、模板注释或临时工作习惯冲突时，以本宪法为准。任何修订
MUST 在同一个变更中同步更新本文件及所有受影响的模板、prompt 与智能体指导文档。治理
版本采用语义化版本：删除或重定义原则属于 MAJOR，引入新原则或实质性扩展规则属于
MINOR，仅做不改变语义的澄清属于 PATCH。在起草 spec、批准 plan 与合并前，必须进行
合规性审查；审查者 MUST 核对接口边界、持久化生命周期覆盖、工作区安全、可运维性、验
证证据，以及语言策略是否被遵守。

**Version**: 1.1.0 | **Ratified**: 2026-03-08 | **Last Amended**: 2026-03-08
