# 实施计划：Monorepo Release PR 自动化

**分支**: `017-changesets-release` | **日期**: 2026-03-19 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis-release-automation/specs/017-changesets-release/spec.md)
**输入**: 来自 `/specs/017-changesets-release/spec.md` 的功能规格说明，以及当前仓库的 workspace/package 发布现状

## 摘要

本功能为 `carvis` 建立一条可持续的 monorepo 发版主路径：开发者或 agent 在普通功能变更中补充 changeset，`main` 上的 GitHub Action 自动维护单一 release PR，operator 审核并合并该 PR 后，再由同一条自动化链路完成统一版本号推进、git tag、GitHub release 与 npm publish。实现重点不是“再加一个发版脚本”，而是把版本推进、发布摘要、公开包筛选、失败可见性和协作规则固化成一套长期不会被遗忘的仓库制度。

## 当前修订范围

本计划仅覆盖仓库级 release 自动化与协作规则，不改变运行时消息、`ChannelAdapter`、`AgentBridge`、工作区队列锁、Postgres durable state 或 Redis coordination 语义。已有 `scripts/publish-npm.sh` 被视为人工兜底路径和现状基线；本次规划会把它要么收敛为自动发布入口，要么明确降级为仅在故障排查时使用的手工补救脚本。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x、GitHub Actions Ubuntu runner、Node/npm 发布环境
- **主要依赖**: `@changesets/cli`、`changesets/action`、GitHub Actions、npm registry、现有 `scripts/check-publish-runtime-deps.mjs` / `scripts/publish-npm.sh`
- **存储**: Git 分支与 tag、GitHub pull request / release 元数据、npm registry 版本元数据、仓库内 `.changeset/` 文件
- **测试**: `bun run lint`、`bun test`、新增 release 配置契约校验、发布脚本 dry-run / skip 逻辑验证、`git diff --check -- .`
- **目标平台**: GitHub `main` 分支上的仓库自动化、GitHub-hosted runner、npm 公共 registry
- **项目类型**: Bun monorepo，包含多公开 package、CLI package、runtime package 与内部私有 package
- **渠道范围**: GitHub repository、GitHub pull requests、GitHub releases、npm registry
- **智能体范围**: Codex 与项目内其他 agent 仅作为仓库协作者，需要遵守 release PR 规则；它们不直接成为发布系统组件
- **运行拓扑**: 开发分支 PR 合并到 `main` -> release workflow 创建或更新单一 release PR -> operator 合并 release PR -> workflow 发布 npm 并生成 tag / GitHub release -> operator 通过仓库产物与可选 `gh` 命令核验结果
- **可观测性**: release PR、workflow run summary、发布 artifact、发布日志、GitHub release、git tag、npm registry 查询结果，以及仓库文档中定义的 operator 检查步骤
- **性能目标**: `main` 上出现新的可发布变更后，仓库应在一次标准 workflow 内更新同一条 release PR；release PR 合并后，公开包应在单次发布流程中完成统一版本发版
- **约束条件**: 所有实际对外发布的公开 `@carvis/*` 包遵守统一版本节奏；仅 `private: false` 且具备有效版本号、同时属于公开 release group 的包参与发布；不把 `gh` 设为 CI 硬依赖；不发布私有 workspace 包；对已存在版本给出跳过结果而不是整体崩溃
- **规模/范围**: 当前按资格规则推导出的 7 个公开 workspace 包参与统一发版；这份成员快照需要由契约测试锁定；`packages/carvis-media-cli`、`packages/skill-media-cli` 与 `packages/skill-schedule-cli` 等内部包不参与 npm 公开发版；单仓库单默认分支，无多 registry 或多 release train

## 设计要点

### 1. `Changesets` 是版本意图层，release PR 是审核闸门

普通功能 PR 不再直接改多个 `package.json` 版本号，而是通过 changeset 声明“本次变更会如何进入下一轮发布”。只有命中公开 release group 的 changeset entry 才能推动 release PR；release PR 负责把这些意图折叠成统一版本推进与 changelog 结果，operator 只在 release PR 这一处审核“是否现在发版”。

### 2. 所有公开 `@carvis/*` 包进入同一个 fixed release group

本仓库的目标不是最大化局部包独立性，而是保持统一版本节奏。因此所有 `private: false` 且实际对外发布的 `@carvis/*` 包都进入同一 fixed group：同一轮 release 中，公开包使用同一版本号推进，避免 CLI、runtime、adapter 和 bridge 版本相互漂移。

### 3. 发版自动化必须能优雅处理“版本已存在”

`changesets/action` 可以负责 release PR 和发布时机，但 registry 是否已存在目标版本仍需本仓库自己的发布命令兜底。发布命令必须按包判断目标版本是否已存在；若已存在，记录为 skip，而不是让整轮流程因为重复 publish 直接不可用。相同的幂等语义也应支撑 workflow rerun 与 operator 手工 fallback。

### 4. 项目级 agent 规则必须把流程写成硬约束

仅接入 workflow 不足以防止流程漂移。`AGENTS.md`、onboarding / runbook 以及仓库中其他现有 AI 工具入口或镜像指导文件都必须显式说明：公开包版本推进只能通过 changeset + release PR 完成；agent 不得手工批量修改多个 `package.json` 版本号模拟发版。`gh` 可以作为推荐本地辅助工具，但不是系统唯一依赖。

### 5. operator 结果摘要和失败补救必须落在 GitHub 可见表面

operator 不应只靠翻日志猜测发布是否完成。workflow 必须把统一版本号、参与发布包、逐包 `published/skipped_existing_version/failed` 结果以及 rerun / fallback 指引落到 workflow summary、artifact 或等价 GitHub 可见产物里。

### 6. 保持人工合并 release PR，而不是完全无人审查直发

仓库当前尚未建立成熟的“每次 merge 到 `main` 都自动发版”文化。保留 release PR 的人工合并闸门，可以在获得自动化收益的同时，维持对版本窗口、变更摘要和发布时机的控制权。

## 宪法检查

*门禁：在后续实现开始前通过；设计完成后再次复核。*

- [x] **接口边界纪律**: 本功能只触及仓库发布与协作层，不改变 `ChannelAdapter` / `AgentBridge` 边界，也不把渠道或 bridge 逻辑塞入 release 自动化。
- [x] **持久化运行生命周期**: 本功能不改变 run lifecycle durable state；新增的是 git / GitHub / npm 发布生命周期及其 operator-visible 结果。
- [x] **工作区串行化与安全**: 不触及 workspace 锁、FIFO 队列、取消、超时和 heartbeat 语义。
- [x] **可运维性即产品能力**: 计划要求 release PR、workflow summary / artifact、tag、GitHub release、publish skip / failure 结果对 operator 可见，并补充 rerun / fallback runbook。
- [x] **契约优先验证**: 后续任务必须覆盖 `.changeset` 约定、release workflow、公开包筛选与 publish skip 语义的契约验证；不能只靠 README 描述。

## 项目结构

### 文档产物（本功能）

```text
specs/017-changesets-release/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── changeset-entry.md
│   ├── publish-eligibility.md
│   └── release-workflow.md
└── tasks.md
```

### 源码结构（仓库根目录）

```text
.github/
└── workflows/

.changeset/

apps/
packages/
scripts/
docs/
tests/
AGENTS.md
package.json
```

**结构决策**: 实现主要会落在 `/Users/pipi/workspace/carvis-release-automation/package.json`、`/Users/pipi/workspace/carvis-release-automation/.changeset/`、`/Users/pipi/workspace/carvis-release-automation/.github/workflows/`、`/Users/pipi/workspace/carvis-release-automation/scripts/publish-npm.sh`、`/Users/pipi/workspace/carvis-release-automation/AGENTS.md`、`/Users/pipi/workspace/carvis-release-automation/docs/guides/developer-onboarding.md` 以及新增的 release runbook / 测试文件。重点是把仓库级发版意图、公开包筛选、自动发布入口和协作规则放到正确的边界，而不是把逻辑散落到各个业务 package。

## 复杂度追踪

当前无宪法例外。主要复杂度来自“统一版本节奏”和“已存在版本跳过”这两个仓库治理问题，而非运行时架构复杂度。
