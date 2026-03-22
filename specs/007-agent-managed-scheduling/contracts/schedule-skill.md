# 合同：Schedule Management Skill

## 1. 适用范围

- 本 skill 负责 schedule 管理相关的调用策略
- skill 适用于自然语言和已转写成文本的自然语音场景
- skill 不是执行面，不允许直接修改 durable state

## 2. 主要职责

- 判断用户请求是否构成明确的 schedule 管理意图
- 决定应调用哪个 `carvis-schedule` 子命令
- 在信息不足、目标不唯一或上下文不完整时要求澄清
- 在 CLI result 返回后组织最终用户回复

## 3. 必须调用 CLI 的情况

- 明确创建 schedule 时，skill 必须调用 `carvis-schedule create`
- 明确查询当前 workspace schedules 时，skill 必须调用 `carvis-schedule list`
- 明确修改唯一目标时，skill 必须调用 `carvis-schedule update`
- 明确停用唯一目标时，skill 必须调用 `carvis-schedule disable`
- 明确重新启用已停用目标时，skill 必须调用 `carvis-schedule enable`
- skill 不得把 `update` 当作隐式 re-enable 手段；恢复启用必须走显式 `enable`

## 4. 必须先澄清的情况

- 当前 chat 未绑定 workspace
- 创建请求缺少足够的时间信息、频率信息或任务描述
- 修改、停用或启用请求命中多个可能目标
- 用户表达超出当前调度器支持范围，但无法立即判断应拒绝还是可改写

## 5. 必须拒绝或回退普通对话的情况

- 用户请求本质上不是 schedule 管理，而是普通 coding、debugging、分析或问答对话
- 仅仅提到 `schedule`、`cron`、`每天`、`每周` 等词语，但没有构成 schedule 管理意图
- 用户试图跨 workspace 管理任务

## 6. 最终回复

- skill 在拿到 CLI result 后，必须向用户给出可读回复
- `needs_clarification` 时，最终回复必须明确说明需要用户补充什么
- `rejected` 时，最终回复必须解释拒绝原因和下一步可执行操作
- `executed` 时，最终回复必须说明已创建、已更新、已停用、已启用或当前列表结果

## 7. 非目标行为

- skill 不得直接写 definition、override 或 management action
- skill 不得绕过 `carvis-schedule` 直接写入运行队列
- skill 不得把未经验证的推断当作 durable 变更直接提交
