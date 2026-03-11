# CLI + Skill Scheduling Design

## Goal

将 `007-agent-managed-scheduling` 从 “external MCP + skill” 架构切换为 “本地 CLI + skill” 架构，让 Codex agent 通过本地 `carvis-schedule` 命令管理 schedule，而不再依赖宿主对 external MCP tool calling 的支持。

## Context

现有 007 方案已经完成 gateway service、repository、durable state、scheduler effective read path 和端到端测试。但真实环境验证表明：即使 `codex mcp list` / `codex mcp get` 能看到全局注册的 MCP server，当前 `codex exec` 路径仍不会把 external MCP tools 暴露给模型，也不会真正启动外部 MCP server。

这意味着 007 的业务实现已经基本可用，但执行面卡在宿主 `Codex CLI + provider` 对 external MCP 的支持上。为了继续推进 schedule 管理能力，需要把 agent 的执行入口从 external MCP 改为宿主已稳定支持的 shell / CLI 调用。

## Architecture

新方案分成四层：

1. `ScheduleManagementService`
   - 继续留在 `apps/gateway`
   - 仍是唯一 durable 写入口
   - 负责 workspace 校验、definition 匹配、override 写入、action audit 和结果投影

2. `carvis-schedule` CLI
   - 作为新的受控执行入口
   - 提供 `create/list/update/disable` 四个子命令
   - 不直接写数据库
   - 只调用 gateway 内部 route，并把结果稳定映射为 JSON stdout + exit code

3. schedule skill
   - 教 agent 何时调用 `carvis-schedule`
   - 教 agent 如何把自然语言意图转成 CLI flags
   - 负责澄清策略和最终用户回复组织
   - 不直接写 durable state

4. Codex bridge/runtime
   - 不再依赖 external MCP
   - 只需要保证 `carvis-schedule` 在 `codex exec` 环境中可执行
   - 启动期检查从 MCP probe 改为 CLI readiness probe

## Execution Flow

1. 用户在 Feishu chat 里发送 schedule 管理请求
2. gateway 继续构造 schedule-aware prompt
3. skill 指导 agent 判断是否需要调用 `carvis-schedule`
4. agent 在 `codex exec` 中执行本地命令，例如：
   - `carvis-schedule create ...`
   - `carvis-schedule list ...`
   - `carvis-schedule update ...`
   - `carvis-schedule disable ...`
5. CLI 调用 gateway 内部 API
6. gateway 写 durable state 并返回结构化结果
7. agent 读取 CLI stdout，生成最终用户回复
8. 后续真正执行仍然走既有 `scheduler -> trigger execution -> run -> delivery`

## CLI Contract

建议 CLI 形式如下：

```bash
carvis-schedule create --workspace <path> --expr "<cron>" --label "<label>" --prompt "<prompt>"
carvis-schedule list --workspace <path>
carvis-schedule update --workspace <path> --target "<reference>" --expr "<cron>"
carvis-schedule disable --workspace <path> --target "<reference>"
```

约束：

- 只接受显式 flags，不使用交互式输入
- stdout 永远输出单个 JSON object
- stderr 用于调试信息，不承载业务结果
- exit code 分层：
  - `0`: executed
  - `2`: needs_clarification
  - `3`: rejected
  - `4`: transport/internal failure
- `workspace` 必填
- `update/disable` 支持 `--target` 或 `--definition-id`
- CLI 不负责自然语言时间解析；自然语言归一化仍由 agent + skill 完成

## Why This Approach

相比 external MCP，这个方案的主要优势：

- 复用宿主已稳定支持的 shell command 能力
- 保持 gateway 为唯一 durable 执行面
- skill、agent、人工脚本和 operator 可以复用同一个 CLI
- 避免继续被 Codex external MCP 支持矩阵阻塞

相对代价：

- 需要新增 CLI 参数与输出契约
- 需要保证 agent 生成的命令行可控、可审计
- 需要把 007 的 spec / tests / runbook 从 MCP-first 改成 CLI-first

## Boundaries

- CLI 不是新的业务层，只是 gateway 内部 route 的 shell facade
- schedule durable state 仍只允许由 gateway 修改
- executor 不持有 schedule 业务规则
- skill 只决定是否调用 CLI，不直接执行持久化逻辑
- scheduler 执行链路保持不变

## Migration Plan

分两步迁移：

### Phase 1

- 新增 `carvis-schedule` CLI
- 新增 CLI skill
- bridge 改为注入 CLI 可执行环境
- prompt / tests 改为要求 agent 调用 CLI

### Phase 2

- 删除 MCP package、安装脚本和相关 readiness probe
- 更新 007 文档、runbook、quickstart
- 用真实聊天完成 CLI 路径验证

## Verification

需要覆盖四层验证：

1. 单测
   - CLI 参数解析
   - stdout / stderr / exit code 契约

2. 契约测试
   - CLI 到 gateway internal route 的请求映射
   - gateway 返回结果到 CLI 输出的投影

3. 集成测试
   - Feishu chat -> agent -> CLI -> gateway -> durable definition -> scheduler trigger

4. 真实验证
   - 真实聊天请求能触发 `carvis-schedule`
   - 正确定义 schedule
   - 到点后正确 trigger / run / delivery

## Open Questions Resolved

- 是否继续使用 external MCP：否
- 是否保留 skill：是
- CLI 覆盖范围：一步到位支持 `create/list/update/disable`
- gateway 是否继续为唯一 durable 执行面：是
