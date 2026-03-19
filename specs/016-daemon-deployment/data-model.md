# 数据模型：Carvis 托管式本地部署

## `ManagedInstallManifest`

- **作用**: 表示当前 OS 用户下 Carvis 安装层的事实快照，是 CLI 判断“是否已安装、安装了什么、当前激活版本是什么”的本地真相来源。
- **关键字段**:
  - `installRoot`
  - `activeVersion`
  - `activeBundlePath`
  - `platform`
  - `serviceManager`
  - `serviceDefinitionPath`
  - `installedAt`
  - `lastRepairAt`
  - `status`
- **约束**:
  - `status` 至少覆盖 `missing`、`installed`、`partial`、`drifted`
  - install / repair 必须幂等更新该实体
  - 默认 uninstall 删除 active entry 后，此实体仍应保留最小卸载记录，直到显式 purge

## `ManagedBundle`

- **作用**: 表示一个可被激活的版本化运行 bundle，包含 daemon、gateway、executor、Postgres、Redis 以及安装 metadata。
- **关键字段**:
  - `version`
  - `bundlePath`
  - `platform`
  - `checksum`
  - `components`
  - `installedAt`
- **约束**:
  - 一个用户环境可保留多个历史 bundle，但同一时刻只能有一个 `activeVersion`
  - daemon 只能从 active bundle 启动子组件
  - `components` 至少包含 `daemon`、`gateway`、`executor`、`postgres`、`redis`

## `ServiceManagerStrategy`

- **作用**: 表示当前宿主平台采用的自启动托管方式。
- **枚举值**:
  - `launchd_user`
  - `systemd_user`
- **关键字段**:
  - `kind`
  - `unitNameOrLabel`
  - `definitionPath`
  - `enabled`
  - `loaded`
- **约束**:
  - 首版仅支持用户级 service manager，不要求 root/system-wide service
  - `carvis install` 必须能明确检测“不支持的平台”与“支持但尚未启用”的差异

## `ManagedInfraComponentState`

- **作用**: 表示由 Carvis 代管的单个基础设施组件状态。
- **适用组件**:
  - `postgres`
  - `redis`
- **关键字段**:
  - `componentId`
  - `version`
  - `binaryPath`
  - `dataDir`
  - `pid`
  - `port`
  - `desiredState`
  - `observedState`
  - `health`
  - `lastStartedAt`
  - `lastHealthcheckAt`
  - `lastErrorCode`
  - `lastErrorMessage`
- **约束**:
  - `desiredState` 至少区分 `running` / `stopped`
  - `observedState` 至少区分 `missing`、`stopped`、`starting`、`ready`、`degraded`、`failed`
  - 数据目录与日志目录必须明确归属到 install root，以支持 repair / uninstall

## `ExternalDependencyStatus`

- **作用**: 表示用户自备依赖的当前可用性。
- **适用对象**:
  - `codex_cli`
  - `feishu_credentials`
- **关键字段**:
  - `dependencyId`
  - `status`
  - `checkedAt`
  - `detail`
  - `lastErrorCode`
- **约束**:
  - `carvis install` 可以不阻塞于该实体为 ready
  - `carvis onboard`、`carvis doctor` 和 runtime 收敛必须显式投影该实体
  - 该层不接管安装动作，只做提示、校验和失败归因

## `DaemonServiceState`

- **作用**: 表示 `apps/daemon` 自身的 service / process 视图。
- **关键字段**:
  - `serviceState`
  - `pid`
  - `socketPath`
  - `version`
  - `lastStartedAt`
  - `lastReconcileAt`
  - `lastErrorCode`
  - `lastErrorMessage`
  - `logPath`
- **约束**:
  - `serviceState` 至少覆盖 `not_installed`、`stopped`、`starting`、`ready`、`degraded`、`failed`
  - daemon failure 不得自动被等价为 runtime failure；CLI 需要能单独显示 daemon 层问题

## `RuntimeComponentState`

- **作用**: 表示 daemon 管理下的业务 runtime 子组件状态。
- **适用组件**:
  - `gateway`
  - `executor`
- **关键字段**:
  - `componentId`
  - `pid`
  - `status`
  - `ready`
  - `healthSnapshot`
  - `startupReport`
  - `lastErrorCode`
  - `lastErrorMessage`
  - `configFingerprint`
- **约束**:
  - 继续兼容现有 `gateway.json` / `executor.json` 所表达的 ready / failed 语义
  - `CONFIG_DRIFT` 必须在该实体或其聚合层中可见，不得退化为 install 问题

## `LayeredStatusSnapshot`

- **作用**: 表示 `carvis status` 的标准聚合输出。
- **关键字段**:
  - `install`
  - `infra`
  - `externalDependencies`
  - `daemon`
  - `runtime`
  - `overallStatus`
  - `recommendedActions`
- **约束**:
  - 每一层都必须有自己的 `status`、`summary` 和最近失败原因
  - `overallStatus` 不能掩盖层级差异；至少保留分层详情
  - human 输出与 JSON 输出必须来自同一聚合模型

## `LayeredDoctorReport`

- **作用**: 表示 `carvis doctor` 的主动诊断结果。
- **关键字段**:
  - `checks`
  - `installLayer`
  - `infraLayer`
  - `externalDependencyLayer`
  - `runtimeLayer`
  - `status`
  - `summary`
- **约束**:
  - 每个 check 必须带稳定 `checkId`
  - doctor 失败时必须能指出所属层级与推荐修复动作
  - 若 daemon 不可达，doctor 仍需通过持久化快照和直接 probe 产出分层结论

## `DaemonControlRequest`

- **作用**: 表示 CLI 发送给 daemon 的本地控制动作。
- **关键字段**:
  - `requestId`
  - `action`
  - `scope`
  - `requestedAt`
  - `arguments`
- **典型动作**:
  - `daemon_status`
  - `daemon_restart`
  - `infra_start`
  - `infra_stop`
  - `infra_rebuild`
  - `runtime_reconcile`
- **约束**:
  - 必须幂等，重复请求不应制造额外漂移
  - 结果必须可映射到稳定 JSON 输出

## `LocalUninstallScope`

- **作用**: 表示一次卸载操作要删除或保留的范围。
- **枚举值**:
  - `remove_runtime_only`
  - `remove_runtime_keep_data`
  - `purge_all`
- **约束**:
  - 默认命令必须落在保守的保留数据路径
  - `purge_all` 必须显式确认，并向用户展示会删除的目录与状态

## 状态迁移摘要

1. 首次安装:
   - `ManagedInstallManifest.status` 从 `missing` 进入 `installed`
   - `ServiceManagerStrategy.enabled` / `loaded` 进入已注册状态
   - `ManagedBundle` 记录当前 active version

2. 首次引导:
   - 写入配置与用户自备依赖检查结果
   - daemon 接收首次 reconcile，infra 从 `stopped` / `missing` 走向 `ready` 或 `failed`
   - runtime 在 infra ready 后启动，形成明确 ready/degraded/failed

3. 主机重启或用户重新登录:
   - service manager 自动拉起 daemon
   - daemon 重放 active manifest 并收敛 infra + runtime
   - `DaemonServiceState.lastReconcileAt` 更新

4. 配置变更:
   - install 层保持 `installed`
   - runtime 若未重载则暴露 `CONFIG_DRIFT` 或等价“需要重启”状态
   - `recommendedActions` 指向 `carvis daemon restart` 或更细粒度修复命令

5. repair / rebuild:
   - `carvis install --repair` 可重建 bundle、service definition 和控制面文件
   - `carvis infra rebuild` 可重建 infra 组件但默认保留数据目录，除非明确要求清空

6. 卸载:
   - 默认卸载停止 daemon、移除 service definition、移除 active bundle 与控制 socket
   - 数据目录、workspace、日志与快照默认保留
   - `purge_all` 才删除数据与历史状态
