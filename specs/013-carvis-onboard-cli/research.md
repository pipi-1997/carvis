# Phase 0 研究记录

## 决策 1：采用 `carvis onboard` 作为首次引导主入口

- **Decision**: 首次操作者入口固定为 `carvis onboard`，不以 `start` 或配置文件编辑作为第一触点。
- **Rationale**:
  - 用户明确要求最简路径“起码能跑起来”，而不是只生成配置。
  - `OpenClaw onboard` 风格比“先写配置再读文档启动”更贴近当前诉求。
  - 这能把配置采集、预检查和首次启动收口到一个明确命令。
- **Alternatives considered**:
  - 只提供 `carvis start`：对首次用户不友好。
  - 只提供配置生成器：无法兑现“一键启动”。

## 决策 2：把日常运维命令收敛为 `start/stop/status/doctor`

- **Decision**: 日常本地 runtime 运维统一使用 `carvis start`、`carvis stop`、`carvis status` 和 `carvis doctor`。
- **Rationale**:
  - 用户明确要求需要 `start` 和 `stop`。
  - `status` 和 `doctor` 是把“一次性引导”变成“长期可维护工具”的必要补充。
  - 这组命令与现有双进程 runtime 模型天然匹配。
- **Alternatives considered**:
  - 使用 `up/down`：不如 `start/stop` 直观。
  - 只保留 `start/stop`：缺少可观测与排障入口。

## 决策 3：保持现有双进程 runtime，不把 `gateway + executor` 合成一个新进程

- **Decision**: CLI 只负责编排两个子进程，不改变现有 `apps/gateway` 与 `apps/executor` 的拓扑。
- **Rationale**:
  - 当前架构已围绕双进程、queue、lock、heartbeat、runtime fingerprint 建立语义。
  - 合并进程会引入新的运行边界，风险高于收益。
  - 用户要的是更好用的 operator path，不是新的 runtime 架构。
- **Alternatives considered**:
  - 新建单进程 supervisor：实现更集中，但会模糊边界并放大回归风险。

## 决策 4：新增独立 `packages/carvis-cli`，不复用 `carvis-schedule`

- **Decision**: 总入口 CLI 单独建包，bin 为 `carvis`；`carvis-schedule` 继续只负责 schedule 控制面。
- **Rationale**:
  - `carvis-schedule` 当前边界很清晰，混入 onboarding/runtime 运维会污染职责。
  - 独立包更容易表达 operator-facing 生命周期命令。
  - 也更容易为未来 adapter/setup/doctor 扩展留接口。
- **Alternatives considered**:
  - 在 `carvis-schedule` 中扩展总入口子命令：会把 schedule 领域 CLI 变成杂糅工具箱。

## 决策 5：飞书配置引导能力放入 `packages/channel-feishu` 的 setup 子模块

- **Decision**: 飞书所需字段、默认值、获取指引、输入校验和凭据 probe 由 `packages/channel-feishu` 暴露给 CLI 使用。
- **Rationale**:
  - 用户明确要求飞书所需内容可以考虑集成到飞书适配器内。
  - 这些知识天然属于 adapter 领域，不应硬编码在 CLI 本体。
  - 同时需要避免把 CLI prompt 或文件写入逻辑塞进 `FeishuAdapter` runtime 类。
- **Alternatives considered**:
  - CLI 内硬编码飞书配置文案：短期能跑，但会让 adapter 相关知识四散。
  - 直接往 `FeishuAdapter` 里塞 onboarding 逻辑：破坏 runtime adapter 边界。

## 决策 6：配置继续分为结构化 config 与 secrets env 两部分

- **Decision**: 结构化配置继续写到 `~/.carvis/config.json`，敏感信息继续写到 `~/.carvis/runtime.env`。
- **Rationale**:
  - 这与当前 runtime-config 读取模式一致，不需要推翻既有实现。
  - 保持结构化配置和 secrets 分离，更利于 operator 运维。
  - 可以直接复用现有 `run-with-runtime-env.sh` 语义与 `loadRuntimeConfig()` 校验。
- **Alternatives considered**:
  - 把 secrets 写进 `config.json`：降低安全性并偏离现有设计。
  - 完全依赖 shell 环境变量：首次 onboarding 体验差，不利于持久化运维。

## 决策 7：`start` 采用“gateway 先 ready，再拉 executor”的顺序

- **Decision**: `carvis start` 先启动 `gateway`，确认其进入稳定状态后再启动 `executor`。
- **Rationale**:
  - `gateway` 提供 `/healthz`，更适合作为首个就绪收敛点。
  - 先有 `gateway` 再有 `executor`，更符合当前本地双进程 wiring 的 operator 心智。
  - 这样可以减少同时启动两个进程时的状态竞争和模糊错误。
- **Alternatives considered**:
  - 同时启动两个子进程：速度略快，但失败语义更复杂。

## 决策 8：为本地 CLI 增加可选 runtime state sink

- **Decision**: 当 `CARVIS_STATE_DIR` 存在时，`gateway` 与 `executor` 把本地运行摘要写到 JSON 文件，供 `status` 与 `stop` 使用。
- **Rationale**:
  - 当前 `gateway` 有 `/healthz`，但 `executor` 没有外部查询面。
  - 仅靠 pid 文件无法区分“进程活着”和“运行时未 ready”。
  - 本地状态文件不替代 Postgres durable state，也不改变 Redis 角色。
- **Alternatives considered**:
  - 只靠日志解析：实现脆弱，长期维护成本高。
  - 为 executor 新增 HTTP 面：扩大系统表面，不符合当前最小变更目标。

## 决策 9：增加优雅退出，而不是把 `stop` 做成单纯 kill

- **Decision**: `apps/gateway` 与 `apps/executor` 的主入口在 CLI 运行场景下需要响应 `SIGINT` / `SIGTERM`，执行已有清理逻辑后退出。
- **Rationale**:
  - 用户明确要求稳定的 `stop`。
  - 当前入口没有显式信号处理，直接 kill 会留下模糊状态。
  - 优雅退出更符合 operator-visible lifecycle 的要求。
- **Alternatives considered**:
  - CLI 直接发送 kill：实现简单，但停止语义不可靠。

## 决策 10：`doctor` 复用现有 healthcheck 和 adapter probe，而不是发明新规则

- **Decision**: `doctor` 直接复用 `loadRuntimeConfig()`、`gateway /healthz`、Codex CLI healthcheck 和 adapter-owned probe。
- **Rationale**:
  - 这样能让 CLI 诊断结果与真实 runtime 语义保持一致。
  - 避免出现“doctor 说没问题，runtime 实际起不来”的双重标准。
  - 也最符合“不要新增业务逻辑，只编排现有能力”的目标。
- **Alternatives considered**:
  - 写一套 CLI 私有诊断规则：容易与运行时发生漂移。

## 决策 11：默认交互式 UX 采用成熟 prompt runtime，而不是继续扩展手写 `readline`

- **Decision**: `carvis onboard` 与 `carvis configure` 默认采用成熟的交互式 prompt runtime，保留人类可读结果为默认输出，并通过显式 `--json` 切换到结构化输出。
- **Rationale**:
  - OpenClaw 社区文档把 `onboard` 明确建模为交互式 wizard，脚本化场景再显式切到非交互模式。
  - `create-next-app`、oclif 生态和 Clack / Inquirer 官方文档都把“默认交互、按需脚本化、成熟 prompt 库”作为主流实践。
  - 当前手写 `readline` 只能覆盖最基础问答，无法稳定支持选择器、取消、中断、spinner 和多 flow UX。
- **Alternatives considered**:
  - 继续扩展手写 `readline`：很快会重复造 `select`、取消处理、默认值、校验循环和 spinner。
  - 全量切到 Inquirer：能力充足，但对当前 `carvis` onboarding 场景偏重。

## 决策 12：`onboard` 至少提供 `quickstart` 与 `manual` 两种交互流

- **Decision**: `carvis onboard` 增加 `quickstart` 与 `manual` 两种 flow；默认走 `quickstart`，高级路径再展开 `workspaceKey`、`managedWorkspaceRoot`、`templatePath`。
- **Rationale**:
  - 用户明确要求“最简配置起码能跑起来”。
  - 社区成熟 onboarding CLI 都会先给最短闭环，再允许深入自定义。
  - 这样可以减少首次启动问题数量，又不牺牲高级 operator 的控制力。
- **Alternatives considered**:
  - 只保留一条全量引导链路：首次用户负担太重。
  - 只保留最简引导：高级场景需要频繁手改配置文件。

## 决策 13：飞书引导采用 adapter-owned 的完整步骤模型，并在 `onboard/configure` 中复用

- **Decision**: `packages/channel-feishu` 除字段级 `howToGet` 外，还要输出完整的步骤化引导模型，覆盖企业自建应用、凭据、机器人能力、websocket/长连接事件接收，以及 `allowFrom/chat_id` 策略；`carvis onboard` 与 `carvis configure feishu` 统一渲染这份模型。
- **Rationale**:
  - 用户明确要求“完整的引导”，而不仅是字段旁边的一两行说明。
  - OpenClaw 风格的 `onboard` 更接近“先讲清楚准备步骤，再逐项录入”的 wizard，而不是边猜边填。
  - 把步骤模型继续留在 adapter 包里，既能保持 CLI 与 adapter 边界，又能避免 `onboard` 和 `configure` 两套文案漂移。
- **Alternatives considered**:
  - 只保留字段级 `howToGet`：无法覆盖机器人能力、事件接收和 `chat_id` 收敛这类跨字段准备动作。
  - 在 CLI 本体写大段飞书文案：会让 adapter 知识再次散落，后续难维护。

## 决策 14：默认保留 `Clack`，但把飞书说明改成字段级按需提示，而不是默认整页 guide

- **Decision**: 继续使用 `@clack/prompts` 作为 prompt runtime；默认交互只在当前字段前展示短提示，不再增加“是否查看完整步骤”的额外提问。
- **Rationale**:
  - `Clack` 更适合轻量 prompt / wizard，而不是连续渲染多屏 boxed 文档。
  - 社区对真正 app-like TUI 的主流做法是直接使用 `Ink`，而不是在 prompt 库上叠重布局；当前问题还没大到需要切 `Ink`。
  - 字段级提示更符合用户“输入 `appid` 时提示 `appid` 获取方式”的要求，也能显著减少默认路径噪音。
  - 额外的“是否查看步骤”会打断主路径；真正需要的是默认渐进式引导，而不是多一道确认。
- **Alternatives considered**:
  - 继续保留整页 guide，只是缩短文案：根本问题不变。
  - 立即切到 `Ink`：社区成熟，但对当前增量需求明显过重，会放大实现与测试成本。
