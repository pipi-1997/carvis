# 数据模型：本地运行时接入

## RuntimeConfig

- **作用**: 表示本地单机双进程运行时共享的结构化配置。
- **关键字段**:
  - `agent.id`
  - `agent.bridge`
  - `agent.workspace`
  - `agent.timeoutSeconds`
  - `agent.maxConcurrent`
  - `gateway.port`
  - `gateway.healthPath`
  - `executor.pollIntervalMs`
  - `feishu.allowFrom`
  - `feishu.requireMention`
- **约束**:
  - `gateway` 与 `executor` 必须读取同一份配置视图
  - `workspace` 必须与既有 agent 语义保持一致

## RuntimeSecrets

- **作用**: 表示不进入配置文件、仅通过环境变量提供的敏感信息和连接信息。
- **关键字段**:
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `POSTGRES_URL`
  - `REDIS_URL`
  - 与本机 Codex CLI 相关的必要环境变量
- **约束**:
  - 缺少必要字段时，相关进程不得进入“已就绪”状态
  - 同一台机器上的 `gateway` 与 `executor` 应读取一致的连接信息

## FeishuConnectionConfig

- **作用**: 表示 Feishu 入站接入方式和最小校验策略。
- **关键字段**:
  - `allowFrom`
  - `requireMention`
- **约束**:
  - 本轮固定使用 `websocket` 长连接
  - 必须保留 allowlist 语义

## GatewayRuntimeState

- **作用**: 表示 `gateway` 对外暴露的本地运行时状态。
- **关键字段**:
  - `http_listening`
  - `config_valid`
  - `feishu_ready`
  - `feishu_ingress_ready`
  - `config_fingerprint`
  - `ready`
  - `last_error.code`
  - `last_error.message`
- **状态**:
  - `starting`
  - `ready`
  - `degraded`
  - `failed`
- **约束**:
  - 仅当配置合法且 Feishu 入站接线完整时，才能声明为 `ready`
  - 当检测到 `CONFIG_DRIFT` 时，`ready` 必须为 `false`，且 `last_error.code = "CONFIG_DRIFT"`

## ExecutorRuntimeState

- **作用**: 表示 `executor` 的依赖连接与消费循环状态。
- **关键字段**:
  - `config_valid`
  - `postgres_ready`
  - `redis_ready`
  - `codex_ready`
  - `consumer_active`
  - `config_fingerprint`
  - `last_error.code`
  - `last_error.message`
- **状态**:
  - `starting`
  - `ready`
  - `degraded`
  - `failed`
- **约束**:
  - 只有在依赖连接成功且消费循环可启动时，才可进入 `ready`
  - 当检测到 `CONFIG_DRIFT` 时，`consumer_active` 必须为 `false`，且 `last_error.code = "CONFIG_DRIFT"`

## ExecutorStartupReport

- **作用**: 表示 `executor` 启动与状态迁移时输出给操作者的结构化报告。
- **关键字段**:
  - `role`
  - `status`
  - `config_fingerprint`
  - `postgres_ready`
  - `redis_ready`
  - `codex_ready`
  - `consumer_active`
  - `error_code`
  - `error_message`
- **约束**:
  - 在 `starting`、`ready`、`degraded`、`failed` 至少各输出一次状态迁移报告
  - 报告中不得包含明文 secret

## RuntimeFingerprint

- **作用**: 表示由共享配置与环境派生的稳定摘要，用于比较 `gateway` 与 `executor` 的配置一致性。
- **关键字段**:
  - `agent.id`
  - `agent.bridge`
  - `agent.workspace`
  - `feishu.allowFrom`
  - `feishu.requireMention`
  - `feishu.appId`
  - `postgres_target`
  - `redis_target`
- **约束**:
  - 指纹比较仅使用结构化配置和脱敏后的依赖目标，不包含明文 secret
  - 当当前进程指纹与对端最近一次已记录指纹不一致时，系统必须报告 `CONFIG_DRIFT`

## Session / Run / RunEvent / OutboundDelivery

- **作用**: 继续沿用既有闭环实体，但在本轮中要求通过真实本地运行时驱动。
- **新增约束**:
  - 本地双进程模式下，`gateway` 与 `executor` 必须共享同一组持久化与协调后端
  - 本地联调时的 `/status`、`/abort`、普通消息行为不得偏离既有实体语义
