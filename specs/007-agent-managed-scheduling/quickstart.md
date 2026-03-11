# Quickstart: Agent 管理定时任务

## 1. 前置准备

1. 准备可运行的本地 runtime 配置、Postgres、Redis、Feishu 凭据和 Codex CLI
2. 确认当前 runtime 已包含 `006` 的 scheduler / trigger lifecycle 能力
3. 在 workspace registry 中声明至少一个可执行 workspace
4. 让某个 Feishu `chat` 先通过 `/bind <workspace-key>` 绑定到目标 workspace
5. 如需验证 `config` 来源 definition 的修改能力，在 runtime config 中先声明一条 `scheduledJobs`

## 2. 启动 runtime

1. 启动 gateway：
   - `bun run dev:gateway`
2. 启动 executor：
   - `bun run dev:executor`
3. 预期结果：
   - `gateway /healthz` 返回 ready
   - executor 输出 ready 状态
   - trigger definitions 正常同步
   - 当前 chat 能用 `/status` 确认已绑定 workspace

## 3. 通过聊天创建 schedule

1. 在已绑定 workspace 的聊天里发送：
   - `每天早上 9 点帮我检查构建失败并总结`
2. 预期结果：
   - `Codex` 在单轮对话内执行 `carvis-schedule create` 完成创建，并返回“已创建 schedule”之类的明确结果
   - 内部查询面可看到一条新的 `agent` 来源 definition
   - 该 definition 具有可读 `label`、`scheduleExpr`、`promptTemplate` 和启用状态

## 4. 查询当前 workspace 的 schedules

1. 在同一聊天中发送：
   - `我现在有哪些定时任务`
2. 预期结果：
   - 返回结果只包含当前绑定 workspace 的 schedules，并且由 `carvis-schedule list` 驱动
   - 每条 schedule 都展示 `label`、启用状态、下一次计划时间和最近执行状态
   - 不泄露其他 workspace 的 definitions

## 5. 修改已有 schedule

1. 先确保当前 workspace 内只有一个明显匹配的任务
2. 在聊天中发送：
   - `把刚才那个改成每 30 分钟一次`
3. 预期结果：
   - 该 definition 的 effective schedule 立即更新
   - 历史 `TriggerExecution` / `Run` 记录保留
   - 若该 definition 来自 runtime config，operator 查询面仍显示其 `config` 来源，但同时能看出它已被 Codex 修改

## 6. 停用已有 schedule

1. 在聊天中发送：
   - `取消每天巡检`
2. 预期结果：
   - 目标 definition 被停用
   - 历史 execution / run / delivery 记录保留
   - 后续 scheduler tick 不再为该 definition 创建新 execution

## 7. 验证歧义澄清

1. 在同一 workspace 中创建两条名称近似的 schedules
2. 再发送：
   - `取消那个日报`
3. 预期结果：
   - 系统要求用户澄清目标
   - 不修改任何 definition
   - 留下 `ScheduleManagementAction(needs_clarification)` 或等价 operator-visible 记录

## 8. 验证 `config` 来源 definition 可被 Codex 管理

1. 在 runtime config 中声明一条 `scheduledJobs`
2. 启动 gateway，同步 baseline definition
3. 在绑定到该 workspace 的聊天中发送：
   - `把每天早上 9 点的日报改成工作日上午 10 点`
4. 预期结果：
   - 内部查询面仍显示 definition 来源为 `config`
   - 同时显示该 definition 已被 Codex 修改
   - 下一次 scheduler 触发读取的是新的 effective schedule，而不是旧 baseline

## 9. 验证后续自动执行

1. 将一条由聊天创建或修改后的 schedule 调到接近当前时间
2. 等待 scheduler tick
3. 预期结果：
   - 生成 `TriggerExecution`
   - 创建 `Run(triggerSource = scheduled_job)`
   - 若 workspace 忙，则进入既有 FIFO 队列
   - 若 workspace 空闲，则进入 running
   - run、heartbeat、delivery 语义与 `006` 保持一致

## 10. 验证未绑定 workspace 的拒绝路径

1. 找一个尚未 `/bind` 的 Feishu `chat`
2. 直接发送：
   - `每天早上 9 点帮我检查构建失败`
3. 预期结果：
   - 当前 run 不会实际调用 `carvis-schedule`
   - 返回与既有 `/bind` 语义一致的引导或拒绝结果
   - 不写入新的 definition、override 或 management action

## 11. 验证 operator 审计可见性

1. 依次完成一次 create、一次 update、一次 disable，以及一次歧义取消请求
2. 通过内部查询面检查当前 workspace 的 managed schedules
3. 预期结果：
   - 可看到最近一次管理动作类型与结果
   - `config` 来源 definition 若被 Codex 修改或停用，会被明确标记
   - 能区分“管理成功但 run 失败”和“run 成功但 delivery 失败”

## 12. 验证自然语音路径

1. 通过能够产出 transcript 的语音入口发送与文本等价的 schedule 意图
2. 预期结果：
   - 语音 transcript 与文本消息命中相同的 `carvis-schedule` path
   - 创建 / 查询 / 修改 / 停用结果与文本一致
   - 不要求新增音频专用定义或音频存储

## 13. 验证命令

1. 跑 007 新增的 contract / unit / integration 关键用例：
   - `bun test tests/unit/carvis-schedule-cli.test.ts tests/unit/schedule-management-prompt.test.ts tests/unit/run-tool-router.test.ts tests/unit/runtime-harness.test.ts tests/unit/runtime-config.test.ts tests/unit/postgres-repositories.test.ts tests/unit/trigger-definition-sync.test.ts tests/unit/schedule-definition-matcher.test.ts tests/unit/schedule-management-service.test.ts tests/unit/bridge-codex-cli-transport.test.ts`
   - `bun test tests/contract/bridge-codex.contract.test.ts tests/contract/feishu-schedule-management-binding.contract.test.ts tests/contract/carvis-schedule-cli.contract.test.ts tests/contract/schedule-management-tools.contract.test.ts tests/contract/schedule-management-list.contract.test.ts tests/contract/schedule-management-update.contract.test.ts tests/contract/schedule-management-disable.contract.test.ts tests/contract/schedule-skill.contract.test.ts tests/contract/internal-managed-schedules.contract.test.ts`
   - `bun test tests/integration/feishu-schedule-management-unbound.test.ts tests/integration/feishu-schedule-create.test.ts tests/integration/feishu-schedule-list.test.ts tests/integration/feishu-schedule-update.test.ts tests/integration/feishu-schedule-disable.test.ts tests/integration/managed-schedule-audit-visibility.test.ts`
2. 跑全量回归：
   - `bun test`
   - `bun run lint`
3. 预期结果：
   - contract / unit / integration 全部通过
   - lint 无报错
   - `/internal/managed-schedules` 能看到 create / update / disable / needs_clarification 的审计投影
