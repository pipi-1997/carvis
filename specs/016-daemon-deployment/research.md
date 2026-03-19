# 研究记录：Carvis 托管式本地部署

## 决策 1：采用单一用户级 `carvis-daemon`，而不是继续由 CLI 直接托管 runtime

- **Decision**: 新增一个由 `launchd` 或 `systemd --user` 托管的 `apps/daemon` 进程，作为唯一长驻 supervisor；CLI 只负责安装、控制和查询，不再长期持有 `gateway` / `executor` / infra 子进程。
- **Rationale**: 这让“开机自启动”“重登录自动恢复”“统一状态汇总”和“后台持续修复/拉起”都有稳定落点，同时保持 `gateway` / `executor` 双进程边界不变。CLI 退出后，托管关系仍然存在。
- **Alternatives considered**:
  - 继续让 `carvis start` 直接拉起 `gateway` / `executor`：无法自然支持开机自启动，也很难托管 Postgres / Redis。
  - 为每个组件分别注册独立 OS service：operator 需要理解四类 service，复杂度和排障成本都更高。

## 决策 2：安装采用版本化 bundle + active manifest，而不是依赖宿主机包管理器

- **Decision**: `carvis install` 把当前平台对应的 runtime bundle 安装到 `~/.carvis/versions/<version>/`，并通过 manifest / current 指针标记激活版本。
- **Rationale**: 这让安装、修复、升级、回滚和默认卸载都能围绕同一个产物模型实现。对用户来说，Carvis 自己代管 Postgres / Redis / daemon 产物，不再要求先执行 `brew install postgresql redis` 或系统级 apt/yum 流程。
- **Alternatives considered**:
  - 依赖 Homebrew / apt / yum 安装 Postgres 和 Redis：用户体验仍然停留在手工接线层，且平台差异过大。
  - 完全无版本目录、只覆盖 `~/.carvis/current`：修复和升级时缺少可审计的安装快照，难以判断漂移与回滚。

## 决策 3：Postgres 与 Redis 作为 daemon 子组件托管，而不是外部前提

- **Decision**: Postgres 和 Redis 进入 `infra` 层，由 `carvis-daemon` 管理其二进制、数据目录、端口占用、健康检查与重启行为。
- **Rationale**: 这是“低心智负担本地部署”的核心。如果它们仍然是用户要先准备的外部依赖，`carvis install` 就无法兑现规格里的主要价值。
- **Alternatives considered**:
  - 继续要求用户自备 Postgres / Redis：直接违背 `FR-003` 和 `SC-001`。
  - 把 Postgres / Redis 划为 external dependency 层：会让 `doctor` / `status` 的层级表达失真，因为这两者明明是 Carvis 可代管部分。

## 决策 4：`install` 与 `onboard` 明确分层

- **Decision**: `carvis install` 只负责安装 bundle、目录、service definition 和基础 scaffold；`carvis onboard` 再负责写入飞书配置、检查 `Codex CLI` / 飞书凭据，并触发首次收敛。
- **Rationale**: 用户可能先把运行时安装到机器上，再由另一个操作者或稍后的步骤注入飞书配置。把 install 和 onboard 分开，既能保留低门槛，也能让失败归因更清晰。
- **Alternatives considered**:
  - 把 install 和 onboard 合并成一步：首次安装路径更短，但安装层和外部依赖层的失败会纠缠在一起，不利于 repair / doctor。
  - 只保留 onboard：无法表达“产物已安装但配置未完成”的中间状态。

## 决策 5：CLI 与 daemon 通过本地控制 socket + 持久化快照协作

- **Decision**: daemon 暴露本地 Unix domain socket 作为控制面，CLI 通过该 socket 发送 `infra start/stop/rebuild`、`daemon status` 等动作；同时 daemon 将安装层、infra 层和 runtime 层状态快照持久化到 `~/.carvis/state/`，用于离线诊断和 daemon 不可达时的兜底查询。
- **Rationale**: 单靠 pid file 不足以表达层级状态与幂等控制，单靠 socket 又无法在 daemon 挂掉时解释“最后一次失败在哪里”。二者结合，才能让 `doctor` 与 `status` 真正具备运维价值。
- **Alternatives considered**:
  - 只用 pid/state file：难以进行受控重建、重启和同步式健康查询。
  - 只用临时 socket：daemon 不可达时缺少最后已知状态，故障信息会变空白。

## 决策 6：分层状态模型固定为安装层 / 基础设施层 / 外部依赖层 / runtime 层

- **Decision**: `carvis status` 与 `carvis doctor` 都以四层状态输出为主，不再只给一个“运行中/未运行”的单值。
- **Rationale**: 规格已经明确要求 operator 能区分安装问题、托管 infra 问题、用户自备依赖问题和 runtime 未 ready 问题。统一层级模型后，CLI、人类输出、JSON 输出与日志都能用同一套归因语言。
- **Alternatives considered**:
  - 只显示整体 `ready/degraded/failed`：对于修复和排障不够用。
  - 把所有检查都塞进 `doctor`，`status` 只留简版：会导致两个命令的判读语言漂移。

## 决策 7：旧 `start` / `stop` / `status` 保留为兼容入口，但显式迁移到 `daemon`

- **Decision**: 历史命令继续可用，但它们只作为 `carvis daemon start|stop|status` 的兼容壳层，并返回明确迁移提示。
- **Rationale**: 这样既满足 `FR-018` 的稳定迁移结果，又避免新旧命令长期并列成为双主契约。
- **Alternatives considered**:
  - 直接删除旧命令：对现有脚本和操作习惯破坏太大。
  - 继续把旧命令当主入口：会让 install / infra / daemon 的新模型无法在命令面上收敛。

## 决策 8：默认卸载保留数据，显式 purge 才删除数据目录

- **Decision**: `carvis uninstall` 默认停止 daemon、移除 service definition、移除 active bundle 与控制面文件，但保留 Postgres 数据、workspace、日志与历史快照；只有 `carvis uninstall --purge` 或等价显式清空路径才删除持久化数据。
- **Rationale**: 一旦 Carvis 开始托管本地数据库和日志，默认卸载必须保守，避免误删。用户如果确实要清空，也必须得到清晰的范围说明。
- **Alternatives considered**:
  - 默认全删：不符合 `FR-013` / `SC-006`。
  - 永不提供 purge：无法满足显式全量清理需求，也会留下大量陈旧状态。

## 决策 9：`CONFIG_DRIFT` 继续作为 runtime 层失败语义，而不是 install 层漂移

- **Decision**: daemon 可以检测安装 manifest 漂移和 bundle 缺失，但 runtime config fingerprint 漂移仍沿用现有 `CONFIG_DRIFT` 语义，体现在 runtime 层降级或 executor 拒绝消费上。
- **Rationale**: `CONFIG_DRIFT` 是既有 operator-visible 业务运行语义，不应在引入安装层后被吞并成“安装损坏”。保持原语义，现有 runbook 和用户心智都更稳定。
- **Alternatives considered**:
  - 把所有漂移统一为 install layer drift：会模糊“安装产物损坏”和“运行配置变化未重载”之间的本质差异。
  - 完全移除 `CONFIG_DRIFT`：直接违背规格与既有约束。
