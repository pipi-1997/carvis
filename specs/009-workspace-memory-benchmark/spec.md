# 功能规格说明：Workspace Memory Benchmark

**功能分支**: `[009-workspace-memory-benchmark]`  
**创建日期**: 2026-03-11  
**状态**: 草稿  
**输入**: 用户描述："为 Carvis workspace memory system 建立 benchmark，覆盖效果与成本评测，纳入显式 /remember /forget、普通 run recall、自然语言记忆意图分类，并形成离线可回归 gate。"

## 系统影响 *(必填)*

- **受影响渠道**: Feishu
- **受影响桥接器**: Codex
- **受影响执行路径**: 测试中的 gateway ingress, queueing, executor 观测路径；不改变生产执行拓扑
- **运维影响**: admin visibility、rollout gate、对 queueing/locks 语义来源的说明
- **范围外内容**: 不包含生产环境自动扩大记忆能力、不包含 vector 或 graph memory、不中断现有运行链路去接入新的线上采样系统

## 用户场景与测试 *(必填)*

### 用户故事 1 - 运行 memory benchmark（优先级：P1）

作为维护 `carvis` memory 能力的工程师，我需要在修改记忆写入、召回或分类逻辑后运行一套标准 benchmark，以确认效果和成本都没有退化，再决定是否允许继续 rollout。

**优先级原因**: 这是 memory 能力能否安全演进的基础门槛；没有这一能力，任何 recall 或自动记忆改动都无法证明不是“抽卡式命中”。

**独立验证方式**: 运行 benchmark 后即可得到一份包含案例总数、失败案例、关键效果指标、关键成本指标和 gate 结果的报告，从而独立判断该次改动是否可继续推进。

**验收场景**:

1. **Given** 系统存在一组标准化 memory benchmark 样例，**When** 工程师运行 benchmark，**Then** 系统返回每个案例的判分结果以及聚合后的效果与成本指标。
2. **Given** 某次改动引入误写或旧事实污染，**When** 工程师运行 benchmark，**Then** 报告必须明确指出失败案例、失败原因和未通过的 gate。

---

### 用户故事 2 - 回归 memory 场景（优先级：P2）

作为修改记忆系统的开发者，我需要把显式 `/remember`、`/forget`、普通 recall 和自然语言记忆意图识别纳入同一套可回归样例，以便在新增规则或调整阈值后快速发现行为回归。

**优先级原因**: 没有稳定的回归样例，后续每次调 recall 或 classifier 都会引入新的不可见风险。

**独立验证方式**: 新增或修改一条 benchmark 样例后，单独运行该样例或整套样例即可验证分类、持久化、召回和失效处理是否符合预期。

**验收场景**:

1. **Given** 存在显式写入、自然语言 not_memory、旧事实覆盖和 `/new` 后召回样例，**When** 开发者运行 benchmark 套件，**Then** 每类样例都能被单独判分并汇总到总报告。
2. **Given** 某条样例期望“不得写入 durable memory”，**When** 实际执行结果发生误写，**Then** benchmark 必须将该样例判为失败。

---

### 用户故事 3 - 基于 gate 决定 rollout（优先级：P3）

作为 operator 或 feature owner，我需要根据 benchmark 报告中的红线指标判断记忆能力是否仍停留在实验态、只能灰度开放，还是可以进入正式启用阶段。

**优先级原因**: 该故事依赖前两者提供可靠数据，但它决定了 benchmark 是否真正进入发布流程，而不是停留在文档建议。

**独立验证方式**: 查看 benchmark 输出中的 gate 结论和关键阈值结果，即可判断当前版本应处于实验态、受限灰度还是正式启用。

**验收场景**:

1. **Given** benchmark 报告中 `false_write_rate` 或 `stale_recall_rate` 未达标，**When** operator 查看 gate 结果，**Then** 系统必须明确阻止扩大自动记忆范围。
2. **Given** benchmark 连续通过关键 gate，**When** feature owner 查看报告，**Then** 系统必须提供清晰的“可进入下一阶段”的结论依据。

### 边界与异常场景

- 当 benchmark 样例缺少必填期望结果时，系统必须拒绝将该样例计入通过统计，并明确指出缺失字段。
- 当样例期望和运行产物无法匹配时，系统必须输出具体失败原因，而不是只给出汇总失败数量。
- 当工作区中已经有一个活动运行时，benchmark 不得依赖真实并发运行去验证 memory 行为；离线 benchmark 应使用受控、可重复的执行上下文。
- 当执行器心跳或智能体进程丢失时，相关样例必须能把“运行失败”与“记忆判断失败”区分记录，避免混淆基础运行故障与 memory 质量问题。
- 当出站投递重试耗尽时，benchmark 不得把渠道投递异常误判为 memory recall 成功或失败；用户侧结果和 benchmark 判分需要分离。
- 当自然语言输入既像普通聊天又像长期约定时，若系统做出了持久化决策，benchmark 必须能判断该决策是否符合 gold expectation。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 提供一套离线、可重复执行的 workspace memory benchmark，用于评估显式记忆写入、记忆遗忘、普通召回和自然语言记忆意图识别。
- **FR-002**: System MUST 使用标准化 benchmark 样例表达输入消息序列、作用 workspace、期望分类结果、期望召回结果以及禁止出现的结果。
- **FR-003**: System MUST 为每条 benchmark 样例生成结构化评测产物，至少包含分类结果、durable write 摘要、recall 命中摘要、bridge request 摘要、用户可见结果、运行结局、判分结果和失败原因。
- **FR-004**: System MUST 为 benchmark 计算聚合效果指标，至少覆盖 intent classification 正确性、误写率、召回命中率、旧事实污染率和 `/new` 后 durable recall 命中情况。
- **FR-005**: System MUST 为 benchmark 计算聚合成本指标，至少覆盖分类耗时、recall 耗时、memory preflight 耗时、augmentation token 规模、augmentation token 占比、同步扫描开销以及这些指标的 P50/P95 聚合。
- **FR-006**: System MUST 支持将 benchmark 样例按用途划分为 golden、replay 和 adversarial 三类，并允许先以 golden 作为主 gate。
- **FR-007**: System MUST 对 benchmark 结果执行 gate 判断，并明确指出哪些红线指标阻止继续扩大自动记忆能力；第一阶段必须至少提供一套默认 Gate Profile。
- **FR-008**: System MUST 支持开发者在不依赖真实线上消息流的情况下新增或修改 benchmark 样例，并再次运行整套评测。
- **FR-009**: System MUST 将“普通聊天不得被误写入 durable memory”作为第一阶段 benchmark 的硬性判分条件之一。
- **FR-010**: System MUST 将“已 forgotten 或 superseded 的旧事实不得继续进入 active recall”作为第一阶段 benchmark 的硬性判分条件之一。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 定义 benchmark 报告中的 operator-visible 状态，包括案例通过/失败、suite 汇总结果、gate 是否通过以及阻断 rollout 的具体原因。
- **OR-002**: System MUST 说明 benchmark 与真实运行路径的边界，避免 operator 将离线 benchmark 通过误解为线上运行链路已经完全无风险。
- **OR-003**: System MUST 记录与 memory 评测相关的关键耗时和扫描规模，使 operator 可以判断 recall 或 sync 成本是否已接近不可接受范围。
- **OR-004**: System MUST 在 benchmark 涉及 queue、lock、heartbeat 相关路径时明确这些信号是来自真实运行复用还是受控测试替身，并在报告或操作文档中可见，以避免误读。

### 关键实体 *(涉及数据时填写)*

- **Benchmark Case**: 表示一条可重复执行的 memory 评测样例，包含消息序列、作用 workspace、样例类别和期望结果。
- **Benchmark Expectation**: 表示某条样例的 gold expectation，包括应识别的 memory intent、应命中的 durable memory，以及不得出现的写入或召回结果。
- **Benchmark Trace**: 表示执行样例后采集到的结构化运行轨迹，用于支撑效果判分和成本统计。
- **Benchmark Report**: 表示单条样例或整套样例的评测结果，包含通过状态、失败原因、聚合指标和 gate 结论。
- **Gate Profile**: 表示 benchmark 使用的阈值集合，定义哪些效果和成本指标是 rollout 的硬门槛。

## 假设

- 第一阶段 benchmark 以离线可回归样例为主，不直接依赖真实生产流量采样。
- 第一阶段允许 replay 样例数量较少，重点先把 golden 样例建稳。
- benchmark 主要服务于 memory 能力 rollout 决策，不替代现有 adapter、bridge 和运行生命周期的契约测试。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 维护者在一次本地 benchmark 执行后，能够在 10 分钟内定位所有未通过案例及其失败原因，无需人工比对原始运行日志。
- **SC-002**: golden 样例集中所有“普通聊天不应持久化”的案例误写率为 0。
- **SC-003**: golden 样例集中所有“旧事实已失效”的案例旧事实污染率为 0。
- **SC-004**: golden 样例集中关键 recall 场景的 durable recall 命中率达到 95% 及以上。
- **SC-005**: benchmark 报告能够明确给出是否允许继续扩大自动记忆范围的结论，并指出触发阻断的具体指标。
