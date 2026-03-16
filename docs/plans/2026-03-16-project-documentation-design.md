# 项目说明文档设计

## 背景

当前仓库已经有实现架构说明和专题 runbook，但缺少两个关键入口：

- 根目录没有 `README.md`，首次进入仓库的人无法快速理解项目定位、当前范围和最短启动路径。
- 现有文档按“实现细节”与“专题排障”组织，缺少面向 operator 和新开发者的任务式导航。

这导致新读者需要同时翻阅 [docs/architecture.md](/Users/pipi/workspace/carvis/docs/architecture.md)、[docs/runbooks/local-runtime-cli.md](/Users/pipi/workspace/carvis/docs/runbooks/local-runtime-cli.md) 和 [AGENTS.md](/Users/pipi/workspace/carvis/AGENTS.md) 才能拼出完整心智模型。

## 目标

建立一套三层文档结构：

1. `README.md` 负责首次接触者入口
2. operator 主手册负责安装、启动、重配和排障
3. docs 导航页负责把架构、开发约束、测试分层和专题文档串起来

## 非目标

- 不重写现有实现架构文档
- 不把 `specs/*` 改造成对外主文档
- 不新增产品宣传或远期 roadmap 内容
- 不改变任何运行时行为、命令语义或测试逻辑

## 受众分层

### 1. 首次访问仓库的人

需要在 1-3 分钟内知道：

- `carvis` 是什么
- 当前已经实现了什么
- 如果我要在本地跑起来，应该先看哪里

### 2. 本地 operator

需要围绕任务流阅读：

- 运行前需要准备什么
- 如何 `onboard`
- 如何判断 runtime 是否 ready
- 如何处理 `CONFIG_DRIFT`、`CODEX_UNAVAILABLE`、`INVALID_CREDENTIALS`

### 3. 新开发者

需要按系统边界理解：

- `apps/gateway`、`apps/executor`、`packages/*` 的职责
- 核心概念与持久化实体
- 哪些变更必须补 contract / integration tests

## 信息架构

### 方案选择

采用“README + operator 主手册 + docs 导航页”的分层结构，而不是把所有内容塞进一个超大 README。

原因：

- 当前已有 [docs/architecture.md](/Users/pipi/workspace/carvis/docs/architecture.md) 和两个 runbook，可直接复用并重新组织
- operator 和 developer 的阅读任务明显不同，分层能减少重复和跳读成本
- 后续新增专题能力时，可继续挂到 docs 导航下，而不污染首页

### 文档布局

#### `README.md`

承担以下职责：

- 一句话定位项目
- 说明当前实现范围
- 给出最短 quickstart
- 概览仓库结构和常用命令
- 指向更详细的 operator / development / architecture 文档

明确不放入以下内容：

- 完整拓扑图和时序图
- 全量错误码说明
- schedule 专题排障细节
- `specs/*` 的设计历史展开

#### `docs/guides/operator-handbook.md`

承担以下职责：

- operator 视角的主说明文档
- 安装前准备与依赖要求
- `carvis onboard/start/stop/status/doctor/configure` 的推荐使用路径
- `~/.carvis/*` 文件和 ready 判定
- 日常排障流程与常见失败码
- 跳转到 schedule 专题 runbook

#### `docs/index.md`

承担以下职责：

- docs 总入口
- 为 developer 提供“从哪开始看”的导航
- 汇总系统地图、核心概念、测试分层和相关专题
- 把 `specs/*` 明确降级为设计档案入口，而不是主叙事入口

#### `docs/runbooks/local-runtime-cli.md`

调整为轻量入口页，保留少量高频说明并跳转到 operator 主手册，避免主手册和 runbook 双维护。

## 内容边界

### README 必须覆盖

- 项目定位
- 当前能力边界
- 前置依赖
- quickstart 命令
- 仓库结构
- 文档导航

### Operator 主手册必须覆盖

- 首次引导
- 已有配置的复用 / 修改 / 取消
- 运行时文件布局
- ready 判定
- 日常命令语义
- 错误码分流
- 排障顺序

### Developer 导航必须覆盖

- 系统地图
- 核心概念
- 架构入口
- 测试分层
- specs 和 plans 的使用方式

## 风险与控制

### 风险 1：README 重新膨胀

控制：

- 只保留“是什么、怎么开始、去哪里看”
- 深入内容一律链接到 `docs/`

### 风险 2：operator 文档与现有 runbook 重复

控制：

- 把 [docs/runbooks/local-runtime-cli.md](/Users/pipi/workspace/carvis/docs/runbooks/local-runtime-cli.md) 改为入口页
- 将 schedule runbook 保持为专题文档，不复制其特有内容

### 风险 3：开发文档入口继续被 `specs/*` 分散

控制：

- 在 `docs/index.md` 中显式区分“当前实现说明”和“设计档案”
- 只给出高价值 spec 索引，而不让新读者直接从编号目录起步

## 验证方式

文档变更完成后至少验证：

- `README.md` 链接到的关键文档都存在
- `docs/index.md` 的导航覆盖 operator、developer、architecture、runbooks
- `docs/runbooks/local-runtime-cli.md` 不再与 operator 主手册大段重复
- Markdown 文件格式检查通过
