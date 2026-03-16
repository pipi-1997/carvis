# Phase 1 数据模型

## 1. FeishuSetupSpec

表示 `packages/channel-feishu` 暴露给总入口 CLI 的飞书接入说明。

| 字段 | 说明 |
| --- | --- |
| `adapter` | 固定为 `feishu` |
| `mode` | 固定为 `websocket` |
| `fields` | 一组需要由操作者填写或确认的字段描述 |

### Field 子项

| 字段 | 说明 |
| --- | --- |
| `key` | 逻辑字段名，例如 `appId`、`appSecret`、`allowFrom`、`requireMention` |
| `envName` | 若该值写入 `runtime.env`，记录对应环境变量名 |
| `required` | 是否必填 |
| `label` | CLI 展示名 |
| `description` | 字段用途说明 |
| `howToGet` | 获取方式或操作指引 |
| `defaultValue` | 可选默认值 |

### 校验规则

- `fields` 必须覆盖启动 Feishu websocket 路径所需的全部用户输入。
- `required = true` 的字段必须有明确的错误提示。
- `howToGet` 必须对没有预读文档的操作者也足够清晰。

## 2. CarvisRuntimeFileSet

表示本地 CLI 管理的一组核心配置文件。

| 字段 | 说明 |
| --- | --- |
| `configPath` | 结构化配置文件路径，固定为 `~/.carvis/config.json` |
| `runtimeEnvPath` | 环境变量文件路径，固定为 `~/.carvis/runtime.env` |
| `stateDir` | 运行状态目录，例如 `~/.carvis/state/` |
| `logsDir` | 日志目录，例如 `~/.carvis/logs/` |

### 校验规则

- `configPath` 只保存非敏感结构化配置。
- `runtimeEnvPath` 只保存 secrets 和运行环境差异项。
- `stateDir` 和 `logsDir` 必须在 CLI 启动前可创建。

## 3. OnboardConfigDraft

表示 `carvis onboard` 过程中的配置草稿。

| 字段 | 说明 |
| --- | --- |
| `adapter` | 当前选择的接入适配器，首版固定为 `feishu` |
| `workspacePath` | 默认工作区路径 |
| `workspaceKey` | 默认工作区 key，首版默认 `main` |
| `managedWorkspaceRoot` | 托管工作区根目录 |
| `templatePath` | 模板工作区路径 |
| `postgresUrl` | Postgres 连接地址 |
| `redisUrl` | Redis 连接地址 |
| `feishuAppId` | 飞书 App ID |
| `feishuAppSecret` | 飞书 App Secret |
| `allowFrom` | Feishu allowlist |
| `requireMention` | 是否要求 @ 机器人 |

### 校验规则

- `workspacePath` 必须是已存在目录。
- `managedWorkspaceRoot` 必须能包含默认工作区。
- `allowFrom` 至少包含一个元素。
- 草稿写入正式配置前必须通过 `loadRuntimeConfig()` 风格的校验。

## 4. LocalRuntimeProcessState

表示本地 CLI 持久化的单个进程状态。

| 字段 | 说明 |
| --- | --- |
| `role` | `gateway` 或 `executor` |
| `pid` | 当前子进程 pid |
| `startedAt` | 启动时间 |
| `status` | 最近状态，如 `starting`、`ready`、`degraded`、`failed`、`stopped` |
| `logPath` | 对应日志文件路径 |
| `lastErrorCode` | 最近错误码 |
| `lastErrorMessage` | 最近错误信息 |
| `configFingerprint` | 当前进程对应的 runtime fingerprint |

### 校验规则

- `status` 必须来自真实 runtime 观测，而不是 CLI 推测。
- 当进程已退出时，state 必须可被识别为 stale。
- `role` 与文件路径一一对应，不允许混写。

## 5. RuntimeStatusSummary

表示 `carvis status` 最终输出的聚合视图。

| 字段 | 说明 |
| --- | --- |
| `gateway` | 当前 `gateway` 的 process state 与 health snapshot |
| `executor` | 当前 `executor` 的 process state 与 startup report |
| `overallStatus` | `starting`、`ready`、`degraded`、`failed`、`stopped` |
| `adapter` | 当前接入适配器 |
| `configSource` | 当前配置来源，例如 `existing`、`onboard_generated` |

### 校验规则

- `overallStatus` 不能只由 pid 存活推导。
- 若 `gateway` 或 `executor` 缺少观测面，必须明确返回 `unknown` 或等价状态，而不是假设 ready。

## 6. DoctorCheckResult

表示 `carvis doctor` 的单项检查结果。

| 字段 | 说明 |
| --- | --- |
| `checkId` | 稳定标识，例如 `runtime_config_valid`、`feishu_credentials`、`postgres_ping` |
| `status` | `passed`、`failed`、`skipped` |
| `message` | 面向操作者的说明 |
| `detail` | 可选诊断详情 |

### 校验规则

- `checkId` 必须稳定，便于后续自动化断言和文档引用。
- `failed` 结果必须带有明确的人类可读解释。
- `skipped` 只能用于当前上下文明确不适用的检查。
