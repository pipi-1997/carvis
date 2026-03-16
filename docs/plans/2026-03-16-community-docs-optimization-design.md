# 社区精品文档风格优化设计

## 背景

上一轮文档建设已经补齐了根 `README`、operator 主手册和 docs 导航，但整体仍然更像“仓库说明集合”，还不是“精品项目文档系统”。

和社区里优秀的 README / CLI 文档相比，当前问题集中在：

- 首页价值叙事偏弱，过早进入实现细节
- `README`、`docs/index`、operator 主手册都有导航职能，重复较多
- 命令、配置、会话指令等稳定事实缺少独立 `reference` 层
- operator 文档仍偏命令解释，而不是任务流
- `specs/` 与 `docs/plans/` 的设计档案属性没有被显式隔离

## 对标对象

本轮优化主要借鉴以下文档模式：

- `uv` README
  - 强价值定位
  - Installation 和 Features 分离
  - 首页直接把用户送去 docs
- `LangGraph` README
  - 一句话定位 + 快速开始 + resources
- `Supabase CLI` 文档
  - 任务流清晰
  - getting started、reference、troubleshooting 明确分栏
- `OpenHands` README
  - 对外介绍与深入文档入口分层

## 目标

把 `carvis` 的项目内文档优化成五层结构：

1. `README`
   - 负责价值定位、安装、最短跑通路径和角色分流
2. `Guides`
   - 负责连续任务流
3. `Reference`
   - 负责稳定事实表
4. `Runbooks`
   - 负责故障、恢复和专题排障
5. `Archives`
   - 负责保留设计历史，不作为首次入口

## 非目标

- 不引入新的 docs site 构建工具
- 不迁移 `specs/` 目录结构
- 不重写所有历史设计文档
- 不改变任何运行时行为

## 设计原则

### 1. 先讲价值，再讲机制

首页不再从“当前实现包含哪些内部组件”开始，而是先回答：

- 这个项目是干什么的
- 适合谁
- 如何最快跑起来

### 2. 一页只服务一个主要任务

- `README` 服务首次进入仓库的人
- operator 主手册服务本地操作者
- developer guide 服务新开发者
- reference 只给稳定事实，不承载流程

### 3. 导航按任务，不按来源

文档导航不再强调“docs / specs / plans”，而是强调：

- 我想跑起来
- 我想运维
- 我想改代码
- 我想查命令 / 配置 / 指令
- 我想看设计历史

### 4. 把稳定事实抽离成 `reference`

需要独立沉淀的内容：

- CLI 命令与输出语义
- Feishu 会话命令
- 本地配置 / state / log 文件

### 5. 设计档案显式归档

`specs/` 与 `docs/plans/` 保留，但在主导航里明确标注为：

- 设计档案
- 方案演化记录
- 非首次阅读入口

## 结构方案

### 顶层入口

#### `README.md`

建议结构：

1. Hero
2. 适合谁 / 不适合谁
3. Installation
4. Get started
5. Why carvis
6. Choose your path
7. Current scope
8. Repo snapshot

#### `docs/index.md`

建议改为路由页，而不是第二份 README。

建议结构：

1. 读者路径
2. Guides
3. Reference
4. Architecture
5. Runbooks
6. Archives

### Guides

新增或重构：

- `docs/guides/operator-handbook.md`
- `docs/guides/developer-onboarding.md`

其中：

- operator guide 负责首次安装、日常运维、重配、状态检查、故障分流
- developer guide 负责系统地图、边界、概念、测试分层和阅读顺序

### Reference

新增：

- `docs/reference/reference-cli.md`
- `docs/reference/reference-chat-commands.md`
- `docs/reference/reference-config.md`

### Runbooks

保留：

- `docs/runbooks/local-runtime-cli.md`
- `docs/runbooks/schedule-management.md`

但职责调整为：

- `local-runtime-cli` 只做快速索引和跳转
- `schedule-management` 只保留 schedule 专题

## 文案风格

### 首页文案

应采用“产品入口 + operator 友好”的风格：

- 多用“你可以做什么”
- 少用“当前实现包含什么”
- 段落更短
- 标题更像任务和收益，而不是内部模块

### Guide 文案

应采用“先做什么，接着做什么”的风格：

- 明确前置条件
- 给最短操作路径
- 再讲例外情况和故障分流

### Reference 文案

应采用“稳定事实表”的风格：

- 一页一个主题
- 不堆背景
- 不重复任务流

## 验证标准

优化完成后应满足：

- 新读者读完 `README` 能在 3 分钟内知道项目价值和最短上手路径
- operator 不必在 `README`、guide、runbook 之间来回跳读才能完成首次安装
- 开发者能从 `docs/index` 明确区分 guide、reference、runbook 和 archive
- 命令 / 配置 / 会话指令不再散落在多页重复维护
