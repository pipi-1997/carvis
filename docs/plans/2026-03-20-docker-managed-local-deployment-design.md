# Docker 托管式本地部署设计

## 背景

当前 `016-daemon-deployment` 的目标是把 `carvis` 从“用户自备 Postgres/Redis + 手动启动 runtime”收敛成“低心智负担的本地托管式部署”。现状虽然已经引入了 `install`、`daemon`、`infra`、`status`、`doctor` 的命令面和 `apps/daemon` 监督进程，但 `infra-manager` 仍然只是探测外部 `POSTGRES_URL` / `REDIS_URL`，没有真正代管基础设施，因此还达不到一键安装。

前序讨论已经确认：

- `codex` 继续由用户自备
- 飞书应用和凭据继续由用户自备
- `carvis` 自身安装、daemon、自启动、本地 Postgres/Redis 托管由 Carvis 负责
- 与其自带跨平台原生 Postgres/Redis 二进制，不如收敛为“Docker 兼容环境是唯一新增前置条件”

## 目标

- 让 `carvis install` 在支持的平台上完成 Docker 兼容环境检查、Carvis 目录布局、daemon 安装与自启动定义写入
- 让 `carvis onboard` 只采集飞书与 workspace 配置，不再要求用户输入 `POSTGRES_URL` / `REDIS_URL`
- 让 daemon 真正托管 Postgres/Redis 容器，并在 infra ready 后再启动 `gateway` / `executor`
- 让 `status` / `doctor` 能明确区分 install、infra、external dependency、daemon、runtime 五层
- 让 README、runbook、016 规格和 CLI 文档与实际行为一致

## 非目标

- 不负责安装 Docker Desktop、Colima、OrbStack 或其他容器运行时
- 不负责安装或登录 `codex`
- 不改变 `ChannelAdapter` / `AgentBridge` 边界
- 不改变 Postgres durable state、Redis coordination only 的职责
- 不改变 workspace lock、FIFO、cancel、timeout、heartbeat、delivery retry 语义

## 支持面

- 官方支持条件：本机存在兼容 Docker API 的运行环境，并且 `docker` CLI 与 `docker compose` 子命令可用
- 文档表述：兼容 Docker API 的环境均可使用，例如 Docker Desktop、Colima、OrbStack；Carvis 不分别适配这些产品，只验证 `docker` 与 `docker compose`
- 对不满足条件的环境，`carvis install` 必须在 install/infra 层明确失败，不做半安装

## 方案选择

### 方案 A：daemon 直接托管 Docker Compose

- `carvis install` 写入 Carvis 自管的 compose 文件、环境文件和安装 manifest
- daemon 使用 `docker compose up/down/ps/logs` 管理 Postgres/Redis
- infra ready 后，daemon 将本地连接串写入 `~/.carvis/runtime.env`
- `gateway` / `executor` 继续按现有方式运行

优点：

- 保持 daemon-first 控制面，不让 infra 真相分散到 CLI
- 比内置原生二进制更容易跨平台
- 更接近“一键安装”

缺点：

- 新增 Docker 前置条件
- 需要处理 compose project、volume、health check 和容器残留

### 方案 B：CLI 管容器，daemon 只管 runtime

- CLI 在 `install` / `onboard` / `infra` 命令中直接执行 `docker compose`
- daemon 不负责 infra 生命周期

优点：

- 初期实现快

缺点：

- 违背 daemon-first 主契约
- status/doctor 很容易出现 infra 与 daemon 真相分裂

### 方案 C：继续用户自备 Postgres/Redis

优点：

- 改动最少

缺点：

- 不满足 016 目标

结论：采用方案 A。

## 架构

### 安装层

`carvis install` 负责：

- 创建 `~/.carvis` 的安装目录、日志目录、状态目录、数据目录
- 执行 Docker preflight：
  - `docker version`
  - `docker compose version`
- 写入 Carvis 自管的 compose 资产：
  - `~/.carvis/infra/docker-compose.yml`
  - `~/.carvis/infra/.env`
- 写入 install manifest，记录：
  - active version
  - service manager 信息
  - compose 文件路径
  - compose project name
  - managed volume 名称
- 安装或修复用户级 daemon 自启动定义

### 引导层

`carvis onboard` 负责：

- 采集飞书凭据和 workspace 配置
- 检查 `codex`
- 不再提示 `POSTGRES_URL` / `REDIS_URL`
- 先写 `config.json`
- 保留 `runtime.env` 中用户自备秘密：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
- 然后请求 daemon 执行首次 reconcile

### 基础设施层

daemon 内的 `infra-manager` 负责：

- 读取 install manifest 和 compose 资产
- `docker compose up -d postgres redis`
- `docker compose stop postgres redis`
- `docker compose down`
- `docker compose ps --format json`
- 对 postgres / redis 做主动健康检查
- 将 infra 状态写入 `~/.carvis/state/infra.json`

容器策略：

- Postgres 作为 durable state：使用命名 volume 或绑定目录持久化
- Redis 作为 coordination only：可持久化其 appendonly 配置，但业务语义仍为协调层
- 连接端点统一固定到宿主机本地回环地址
- daemon 负责生成：
  - `POSTGRES_URL=postgres://carvis:carvis@127.0.0.1:<port>/carvis`
  - `REDIS_URL=redis://127.0.0.1:<port>/0`

### Runtime 层

- daemon 只有在 infra ready 时才启动 `gateway` / `executor`
- `gateway` / `executor` 不感知 Docker，只继续从 `runtime.env` 读取连接串
- `CONFIG_DRIFT` 语义保留；如果 compose 资产、端口映射或 runtime config 改变导致未重载，仍然投影到 runtime 层

## 命令契约调整

### `carvis install`

- 成功前提：
  - `docker` 可用
  - `docker compose` 可用
  - service manager 可安装或至少可明确判断 unsupported
- 输出新增：
  - Docker preflight 结果
  - compose project 信息
  - data/volume 保留策略
- README 和 CLI 参考中应把 “可访问的 Postgres/Redis” 改成 “Docker 兼容环境”

### `carvis onboard`

- 删除 `POSTGRES_URL` / `REDIS_URL` 交互项
- 写完配置后触发 daemon reconcile
- 如果 Docker infra 未 ready，应返回 infra 层失败，而不是 runtime_config 失败

### `carvis infra ...`

- `status`: 返回 Docker 可用性、容器状态、健康检查结果、volume 信息
- `start`: `docker compose up -d`
- `stop`: 停止容器但保留 volume
- `restart`: 重新拉起容器并刷新健康状态
- `rebuild`: 重建容器；默认保留 volume
- 后续可扩展 `--purge-data`，首版先不加到主流程

### `carvis uninstall`

- 默认：
  - 停止 daemon
  - 停止并移除 compose stack
  - 保留 volume / data 目录 / logs / state
- `--purge`：
  - 额外删除 Carvis 管理的 volume、compose 资产和本地数据

## 状态与诊断

### Install 层

- install manifest 是否存在
- compose 文件是否存在
- daemon service definition 是否存在
- Docker preflight 最近结果是否通过

### Infra 层

- Docker CLI / Docker daemon 是否可达
- postgres / redis 容器是否存在、运行、健康
- compose project 是否与 manifest 一致

### External Dependency 层

- `codex` 是否可用
- 飞书凭据是否可用

### Daemon 层

- daemon service / socket / pid / last reconcile

### Runtime 层

- `gateway` / `executor` readiness
- `CONFIG_DRIFT`
- operator-visible failure summary

## 失败处理

- Docker CLI 缺失：`install` 失败，给出安装 Docker 兼容环境的指引
- Docker daemon 未启动：`install` 或 `infra start` 失败，归因到 infra
- compose 文件缺失：`install --repair` 修复
- 容器存在但健康检查失败：infra failed，runtime 不启动
- onboard 已完成但 infra 未 ready：external 通过，infra failed，overall 不能是 ready

## 测试策略

- 单元测试：
  - Docker preflight 解析
  - compose 资产写入
  - runtime env 注入
- 契约测试：
  - `install` / `onboard` 不再要求 `POSTGRES_URL` / `REDIS_URL`
  - `infra` 命令输出稳定
  - Docker 不可用时归因正确
- 集成测试：
  - 临时 `HOME` 环境下 `install -> onboard -> daemon status -> status -> doctor`
  - daemon reconcile 后 infra ready，runtime 可启动
  - uninstall 默认保留数据，purge 明确清理

## 文档影响

- `README.md`
- `specs/016-daemon-deployment/spec.md`
- `specs/016-daemon-deployment/plan.md`
- `specs/016-daemon-deployment/tasks.md`
- `specs/016-daemon-deployment/quickstart.md`
- `docs/reference/reference-cli.md`
- `docs/runbooks/local-managed-deployment.md`
- `docs/architecture.md`
- `AGENTS.md`

## 实施顺序

1. 先改文档和规格，统一产品边界
2. 再写 Docker preflight、compose 资产和 install manifest 的失败测试
3. 再改 onboard/config-writer，移除用户输入 DB/Redis URL
4. 再改 daemon infra-manager 与 infra/daemon/status/doctor 主链
5. 最后做 README、runbook、完整验证

## 风险

- 本地开发机可能只有 `docker` CLI 没有可用 daemon，需要明确归因
- CI 环境可能没有 Docker，需要测试桩和真实验证分层
- 从旧配置迁移时，可能残留手写 `POSTGRES_URL` / `REDIS_URL`；首版应优先让 daemon 覆盖这些值，并在 doctor 中提示“当前由 Carvis 托管”
