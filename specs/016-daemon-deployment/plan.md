# 实施计划：Carvis 托管式本地部署

**分支**: `016-daemon-deployment` | **日期**: 2026-03-19 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/016-daemon-deployment/spec.md)
**输入**: 来自 `/specs/016-daemon-deployment/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能把当前“CLI 直接拉起 `gateway` / `executor` + 用户自备 Postgres / Redis”的模型，升级为“用户级托管式本地部署”。新的主契约以 `carvis install`、`carvis onboard`、`carvis infra ...`、`carvis daemon ...`、`carvis doctor`、`carvis uninstall` 为中心：`install` 负责把版本化运行 bundle、目录结构、自启动定义和 Docker Compose 资产安装到 `~/.carvis`，并在安装前验证 `docker` / `docker compose`；`onboard` 负责写入飞书配置、校验用户自备的 `Codex CLI` 与飞书凭据，并触发首次实例收敛；`daemon` 负责以单一后台进程通过 Docker Compose 托管本机 Postgres 与 Redis，并继续监督 `gateway` 与 `executor` 子进程，以保留现有双进程 runtime、`ChannelAdapter` / `AgentBridge` 边界，以及 Postgres durable state / Redis coordination only 的既有约束。

技术上新增一个用户级 `apps/daemon` 监督进程，作为唯一被 `launchd` 或 `systemd --user` 直接托管的入口。CLI 通过本地控制 socket 与持久化状态快照操控 daemon；daemon 以版本化 bundle 和层级状态模型管理安装层、基础设施层、外部依赖层与 runtime 层。现有 `start` / `stop` / `status` 入口保留为兼容壳层，但主语义迁移到 `daemon` 子命令，不再让操作者直接接触 `gateway` / `executor` 进程编排细节。

## 技术上下文

**Language/Version**: Bun 1.3.9、TypeScript 5.9.x
**Primary Dependencies**: Hono、Zod、`pg`、`redis`、`@larksuiteoapi/node-sdk`、Codex CLI、`launchd` / `systemd --user`、本地 Unix domain socket IPC
**Storage**: Carvis-managed PostgreSQL / Redis Docker volumes、`~/.carvis` 下的 config/state/logs/install manifest/data dirs
**Testing**: `bun test`、`bun run lint`、CLI contract tests、daemon/integration tests、平台适配器单元测试
**Target Platform**: macOS `launchd`、Linux `systemd --user`；单机单用户托管安装；本地子进程 supervision；Windows 暂不支持
**Project Type**: operator CLI + user daemon + shared runtime packages
**Channel Surface**: Feishu
**Agent Surface**: Codex
**Run Topology**: `carvis` CLI 负责安装、配置与运维入口；OS user service 负责自启动 `apps/daemon`；daemon 通过 Docker Compose 负责拉起和守护 Postgres 与 Redis，同时继续监督 `apps/gateway` 与 `apps/executor` 的本地进程；`gateway -> queue -> executor -> bridge-codex` 的既有业务执行链保持不变
**Operability**: `~/.carvis/state/*.json` 层级状态快照、daemon 控制 socket、daemon 不可达时的持久化快照 + direct probe fallback、结构化日志、`gateway /healthz`、executor startup/heartbeat 报告、分层 `doctor/status` JSON 输出、`CONFIG_DRIFT` 与外部依赖失败的 operator-visible 原因、面向运维的 runbook
**Performance Goals**: 本地 daemon 冷启动后应在 30 秒内收敛出明确的 ready/degraded/failed 结果；`carvis status` / `carvis doctor` 在常见健康路径下应在 3 秒内返回；安装与修复流程必须幂等，不因重复执行制造额外漂移
**Constraints**: 保持 `ChannelAdapter` / `AgentBridge` 边界；保持 Postgres durable state、Redis coordination only；保持单 workspace 单 active run、FIFO、lock、cancel、timeout、heartbeat 语义；`Codex CLI` 与飞书应用凭据继续由用户自备；安装层必须验证 `docker` 与 `docker compose` 可用；默认卸载保留持久化数据；不要求 root/system-wide service
**Scale/Scope**: 每个 OS 用户一套本地 carvis 安装、一个 daemon、两类托管基础设施和两类业务进程；首版仅覆盖单实例本地托管，不引入远程控制面、集群编排或 Windows 服务管理

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 新增本地部署与 daemon 能力会集中在 `apps/daemon`、`packages/carvis-cli` 与 `packages/core` 的运维模型，不会把 Feishu 或 Codex 专有控制流挪入安装层；`apps/gateway` / `apps/executor` 继续只处理 runtime 路径。
- [x] **Durable Lifecycle**: 计划把安装层、基础设施层、daemon 层和 runtime 层状态快照持久化到 `~/.carvis/state`，同时继续依赖 Postgres 记录业务运行、队列和投递审计，确保失败后可追溯。
- [x] **Workspace Safety**: 新功能只改变宿主机部署与守护方式，不改变 `run.workspace`、队列、锁、取消、超时、heartbeat 和恢复语义；daemon 对 `gateway` / `executor` 的 supervision 不得绕过现有工作区串行化规则。
- [x] **Operability**: 计划为安装、基础设施、外部依赖、daemon 和 runtime 五层都定义 operator-visible 状态、失败原因、日志路径和修复动作，并把旧命令迁移行为纳入显式契约。
- [x] **Verification**: 计划覆盖 CLI 契约、daemon supervision、分层状态、兼容命令、修复/卸载路径、daemon fallback，以及 queue/lock/cancel/timeout/heartbeat/delivery retry 与 `CONFIG_DRIFT` / readiness 行为的 contract 与 integration 验证。

**Phase 0 结论**:

- [x] **Boundary Integrity**: 已确定采用新的 `apps/daemon` 作为唯一长驻监督进程，`packages/carvis-cli` 只做 operator control plane；`channel-feishu` 与 `bridge-codex` 不承载安装器或守护逻辑。
- [x] **Durable Lifecycle**: 已确定需要新增安装 manifest、infra component state、daemon state、layered doctor report 等本地持久化实体，并继续让 Postgres / RunEvent 保持业务事实来源。
- [x] **Workspace Safety**: 已确认 daemon 只管理进程与依赖，不重新定义 run admission、queue/lock 和 heartbeat；`CONFIG_DRIFT` 继续由 runtime fingerprint 驱动，在 runtime 层降级而不是被 install 层吞掉。
- [x] **Operability**: 已确认 `carvis status` / `carvis doctor` 必须输出分层结果，`carvis install --repair`、`carvis infra ...`、`carvis daemon ...`、`carvis uninstall` 都要返回明确且可 JSON 化的动作结果。
- [x] **Verification**: 已识别需要为安装命令、daemon 控制、autostart、infra 健康、daemon 不可达 fallback、兼容命令、默认保留卸载、显式 purge，以及 queue/lock/cancel/timeout/heartbeat/delivery retry 回归建立测试夹具，可以进入 Phase 1 设计。

**Phase 1 设计后复核**:

- [x] **Boundary Integrity**: `data-model.md` 与 `contracts/` 已把 install/daemon/infra/operator contract 限定在本地运维边界；Feishu / Codex 特定逻辑仍停留在适配器与桥接器内。
- [x] **Durable Lifecycle**: 已明确 `ManagedInstallManifest`、`ManagedInfraComponentState`、`DaemonServiceState`、`RuntimeLayerSnapshot` 与 `LayeredDoctorReport` 的职责边界，满足持久化与审计要求。
- [x] **Workspace Safety**: daemon 合同明确 `gateway` / `executor` 仍通过原有 Redis queue、workspace lock 与 heartbeat 协议协同；daemon 仅依据健康与退出状态做监督，不介入业务排队语义。
- [x] **Operability**: quickstart 与 contracts 已覆盖 install、onboard、autostart、repair、compat alias、doctor、uninstall、purge、daemon fallback 和 runbook 的用户侧及运维侧表现。
- [x] **Verification**: 已为 CLI contract、daemon supervision、状态分层、修复/卸载、兼容入口、daemon fallback 和 queue/lock/cancel/timeout/heartbeat/delivery retry regression 列出明确验证面，可直接进入 `/speckit.tasks`。

## 项目结构

### 文档产物（本功能）

```text
specs/016-daemon-deployment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── carvis-daemon-supervision.md
│   ├── carvis-layered-status-and-doctor.md
│   └── carvis-managed-lifecycle-cli.md
└── tasks.md
```

### 源码结构（仓库根目录）

```text
apps/
├── daemon/
├── gateway/
└── executor/

packages/
├── carvis-cli/
├── core/
├── channel-feishu/
└── bridge-codex/

scripts/
└── release/

docs/
└── runbooks/

tests/
├── contract/
├── integration/
├── unit/
└── fixtures/
```

**结构决策**:

- 新增 `apps/daemon`：实现用户级长驻 supervisor，负责读取安装 manifest、暴露本地控制 socket、通过 Docker Compose 管理 Postgres/Redis，并监督 `gateway`/`executor` 子进程的状态、刷新层级状态快照，并把 autostart 后的收敛结果标准化。
- 扩展 `packages/carvis-cli`：新增 `install`、`infra`、`daemon`、`uninstall` 命令族，以及 bundle 安装、平台 service manager 适配、控制 socket client、repair/purge 路径和旧 `start` / `stop` / `status` 兼容壳层。
- 扩展 `packages/core`：沉淀安装 manifest、infra state、daemon state、layered doctor report、控制协议与本地状态读写工具，并把新的 runtime fingerprint / drift 投影接入现有模型。
- 最小化修改 `apps/gateway` 与 `apps/executor`：保持双进程边界，仅为 supervised 启动、health/readiness 汇总、日志路径和 drift 投影补齐需要的状态字段。
- 维持 `packages/channel-feishu` 与 `packages/bridge-codex` 的职责不变，仅复用现有凭据 probe、Codex healthcheck 和 operator-visible 错误语义，不把安装/托管逻辑塞进适配器或 bridge。
- 新增 `scripts/release/`：为后续平台 bundle、Docker Compose 资产、校验清单与测试夹具生成提供统一脚本入口，使 `carvis install` 可以消费版本化发布物并把 Docker-managed Postgres/Redis 安装到 `~/.carvis`。
- 扩展 `tests`：增加 CLI contract、daemon integration、平台 service adapter unit、bundle/install fixture、daemon 不可达 fallback 和运行语义回归测试，避免部署层改动回归到 queue/lock/cancel/timeout/heartbeat/delivery retry。
- 扩展 `docs/runbooks/`：新增面向运维的本地托管部署 runbook，覆盖 install、autostart、daemon down、infra down、repair、uninstall 和 purge 路径。

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
