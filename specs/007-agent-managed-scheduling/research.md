# Research: Agent 管理定时任务

## 决策 1：schedule 管理控制面由 gateway 内部服务承载，而不是直接写 runtime config 或直接写 run queue

- **Decision**: 新增 gateway-owned `ScheduleManagementService` 作为唯一的 schedule 控制面，统一提供 `create`、`list`、`update`、`disable`、workspace 作用域校验、definition 匹配、持久化与审计。聊天路径、内部管理路由和未来的其他入口都复用这层服务，而不是各自直接写数据库或 runtime config。
- **Rationale**: 这符合宪法对 `ChannelAdapter` / `AgentBridge` 边界的要求，也能避免把 Feishu 聊天控制、operator 查询和 scheduler 读路径拆成多套逻辑。schedule 管理本质上是 gateway 的 control plane，不是新的 channel 也不是 executor 责任。
- **Alternatives considered**:
  - 让聊天路径直接改 `~/.carvis/config.json`：会把宿主机文件写入耦合到会话处理，既难测也难审计。
  - 让聊天路径直接写 `trigger_definitions`：会绕过作用域校验、匹配规则和 operator audit，后续入口很难复用。

## 决策 2：用 `config baseline + durable override` 支持 Codex 修改 `config` 来源 definition

- **Decision**: 保留 runtime config 作为 `config` 来源 definition 的 baseline 声明源，但把聊天中的修改/停用持久化为数据库 override；scheduler、查询面和后续 sync 都读取 effective definition。这样 `config` 来源和 `agent` 来源仍可区分，同时 `Codex` 对 `config` 来源的修改不会在下次 sync 时被覆盖。
- **Rationale**: 用户已经明确要求 `Codex` 可以修改和停用当前 workspace 里的全部 schedule，包括 `config` 来源。如果继续让 config sync 直接覆盖数据库，就无法满足这个要求；而完全放弃 config baseline 又会让既有部署模式退化。override 模型能在不改宿主机配置文件的前提下保留两种来源。
- **Alternatives considered**:
  - 把 Postgres 完全改成唯一 source of truth，config 仅用于首次导入：最简单，但会让既有 runtime config 的维护模式失去意义。
  - 让聊天改动直接回写 config 文件：实现和部署风险都太高，也不适合当前本地 runtime 架构。

## 决策 3：坚持 `CLI-first + skill`，通过 `carvis-schedule` 让 agent 直接调用 gateway

- **Decision**: 本功能保持真正的 agent 调用执行面，但不再依赖 external MCP。Carvis 提供本地 `carvis-schedule` CLI 作为 shell facade，由 gateway 内的 `ScheduleManagementService` 作为唯一业务执行面；skill 只约束何时调用 CLI、何时澄清、何时拒绝。
- **Rationale**: 真实运行环境已经证明 external MCP 不是当前 `codex exec` 的稳定依赖，但 shell / CLI 调用是稳定能力。与其让 gateway 二次解释终态文本，不如让 agent 直接执行 `carvis-schedule`，保持 durable state 仍只经由 gateway 修改。
- **Alternatives considered**:
  - 结构化 action envelope：落地更快，但不是实际 CLI 调用，且仍要让 gateway 二次解释终态文本。
  - gateway 自己做关键字解析：违背“由 Codex 决策并调用执行面”的目标。

## 决策 4：不再做 gateway 侧 intent detector，始终向 agent 暴露 skill 约束

- **Decision**: gateway 不再做启发式 schedule intent detector，而是在普通 prompt 路径中统一注入 CLI-first skill 提示。是否调用 `carvis-schedule` 完全由 agent 根据用户请求决定；非 schedule 对话只需正常回答，不调用 CLI。
- **Rationale**: 用户明确要求“应完全让 agent 自己判断”。gateway 侧 detector 会让能力暴露变成猜测逻辑，既增加误判，也会掩盖真正的 agent 能力边界。
- **Alternatives considered**:
  - 只在命中关键字时再附加能力：仍然属于 gateway 侧猜测，不符合要求。
  - 只提供新的 slash command：不符合“自然语言/自然语音”目标。

## 决策 5：definition 需要稳定的人类可读 `label`，更新和停用按“唯一匹配”规则执行

- **Decision**: 为每条 managed schedule 引入稳定的 `label` / 标题字段，agent 创建时生成或抽取，后续 list / update / disable 都围绕该字段和 definition id 工作。修改和停用只在当前 workspace 中存在唯一匹配时执行；多个候选则返回澄清，不做模糊批量操作。
- **Rationale**: 当前 `006` 的 definition 只有 `id` 和 `promptTemplate`，不足以支撑聊天里的自然引用，例如“刚才那个日报”或“每天巡检”。加入 `label` 能让用户和 operator 共享一个可读标识，也方便 presenter 和 matcher 保持一致。
- **Alternatives considered**:
  - 直接拿 `promptTemplate` 做标题：可读性差，且更新 prompt 时会破坏引用稳定性。
  - 完全靠 definition id 操作：不符合自然语言目标。

## 决策 6：management tool 调用自身不创建旁路 run，只改 control plane；真正执行仍由 scheduler 统一触发

- **Decision**: create/list/update/disable 是控制面工具调用，不额外走 scheduler run pipeline；它们只修改 durable state、返回 tool result 并记录审计。只有后续计划时点到达时，effective schedule definition 才由现有 scheduler 创建 `TriggerExecution` 和 `Run`。
- **Rationale**: 宪法要求 queue/lock/heartbeat 只用于真正的工作区执行。如果把管理动作也包装成特殊 run，会把简单的定义编辑混进 run lifecycle，既增加噪音，也不利于 operator 区分“控制面写操作”和“自动化执行”。
- **Alternatives considered**:
  - create/update/disable 也生成 run：会污染运行历史，并让 `/status` 和 operator 查询面更难解释。
  - 管理动作完全不留 durable audit：不满足 operator-visible 要求。

## 决策 7：自然语音不引入新音频子系统，只复用现有 transcript 语义

- **Decision**: 本轮不单独设计音频存储、音频理解或音频回放；凡是已经被 ingress 转成与文本等价 prompt 的自然语音，都走与文本消息相同的 schedule management path。
- **Rationale**: 规格只要求“自然语言或自然语音意图”，并未要求新增独立语音 runtime。把语音视为 transcript 文本即可满足目标，也能避免把 scope 扩展到音频协议与媒体存储。
- **Alternatives considered**:
  - 新增独立 voice adapter / transcript store：超出本轮范围。
  - 只支持文本，不支持 transcript：与规格不符。
