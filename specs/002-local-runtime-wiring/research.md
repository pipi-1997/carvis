# Research: 本地运行时接入

## 决策 1：保持双进程手动启动，而不是合并成单进程 dev 模式

- **Decision**: 继续以 `gateway` 和 `executor` 两个独立进程作为本地联调的最小运行单元。
- **Rationale**: 这和现有架构一致，能最早暴露配置、依赖连接、锁和队列等真实问题，不会用单进程模式掩盖边界错误。
- **Alternatives considered**:
  - 单进程 dev 模式：上手更快，但会模糊 `gateway`/`executor` 边界，降低后续问题定位质量。
  - Docker Compose：更接近部署，但超出“本地可用”的最小目标。

## 决策 2：结构化配置与敏感信息分离

- **Decision**: `~/.carvis/config.json` 保存结构化配置；敏感信息和环境差异配置放环境变量。
- **Rationale**: 这样可以让本地准备步骤稳定、可复用，同时避免把凭据写进仓库或配置文件。
- **Alternatives considered**:
  - 全部放环境变量：维护性差，结构复杂时可读性低。
  - 全部放配置文件：不利于管理凭据和机器差异。

## 决策 3：对齐 `openclaw`，本轮只支持 Feishu `websocket`

- **Decision**: 参考 `openclaw` 的现有接入方式，本轮只支持 Feishu `websocket` 长连接，不再同时承诺 `webhook`。
- **Rationale**:
  - 这能避免把“本地真实联调”强绑定到公网 HTTPS 和反向代理能力上。
  - 只保留一种接入方式，能把复杂度稳定压在 `channel-feishu` 适配层内部。
- **Alternatives considered**:
  - 仅支持 `webhook`：会让本地联调依赖额外公网入口，和当前范围外约束冲突。
  - 同时支持 `webhook` 与 `websocket`：会把 runtime wiring、测试矩阵和运维状态扩成两套。

## 决策 4：`gateway` 以 `healthz`，`executor` 以结构化启动报告暴露状态

- **Decision**: `gateway` 继续以 `GET /healthz` 作为主观测面；`executor` 不额外引入 HTTP 面，而是通过结构化启动报告和状态迁移日志暴露依赖连接与消费状态。
- **Rationale**:
  - `gateway` 需要 HTTP 面来承接联调脚本和健康检查。
  - `executor` 本轮只要求本地双进程可用，引入额外 HTTP 面收益不高，结构化日志已经足够脚本化验证。
- **Alternatives considered**:
  - 为 `executor` 单独增加 HTTP 健康端点：更统一，但增加额外暴露面和维护成本。
  - 只看自由格式日志：不利于测试与机器读取。

## 决策 5：`executor` 启动前显式验证依赖与 Codex CLI

- **Decision**: `executor` 在进入消费循环前，必须先验证 Postgres、Redis 和 Codex CLI 的可用性。
- **Rationale**: 否则进程可能看似已启动，但无法执行任务，导致本地联调阶段出现隐藏故障。
- **Alternatives considered**:
  - 懒加载依赖：失败更晚暴露，不利于快速定位。
  - 首次消费时再校验：会把启动问题误判为业务问题。

## 决策 6：本轮只接真实本地联调，不扩展部署编排

- **Decision**: quickstart 只覆盖本地单机运行、双进程启动和真实 Feishu `websocket` 联调；不引入 Docker Compose、systemd、反向代理或 webhook 入口说明。
- **Rationale**: 本轮目标是让本地环境先真实可用，而不是把部署面一次做满。
- **Alternatives considered**:
  - 同时做本地与部署编排：范围偏大，容易拖慢验证主路径。
