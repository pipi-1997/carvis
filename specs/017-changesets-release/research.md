# Research: Monorepo Release PR 自动化

## 决策 1：采用 `Changesets + changesets/action`，不采用 `semantic-release` 或 `Release Please`

- **Decision**: 版本推进与 release PR 主流程采用 `@changesets/cli` 与 `changesets/action`。
- **Rationale**: `Changesets` 天然面向多 package 仓库，能够把 changeset 文件折叠成统一的版本推进和 changelog；`changesets/action` 则提供“自动创建/更新 release PR，合并后可继续 publish”的标准 GitHub 路径。相比之下，`semantic-release` 更偏无人工闸门的全自动发版，`Release Please` 在 monorepo 包依赖联动与 workspace 语义上没有 `Changesets` 直接。
- **Alternatives considered**:
  - `semantic-release`: 自动化更彻底，但对 commit discipline 和失败回滚要求更高，不适合当前仓库第一版。
  - `Release Please`: release PR 体验良好，但本仓库更需要 workspace 包之间的版本联动与 changeset 文件化约束。
  - 继续手工 tag / GitHub release / npm publish: 无法长期保证版本号、tag、release notes 与 registry 一致。

## 决策 2：所有实际对外发布的公开 `@carvis/*` 包进入同一个 fixed release group

- **Decision**: 将当前 7 个实际对外发布的 workspace 包作为同一个 fixed release group 管理；`@carvis/carvis-media-cli` 虽然保留 workspace 包形态，但作为内部 transport CLI 不进入公开 release group。
- **Rationale**: 用户明确要求“尽量保持统一的版本节奏”，但统一节奏只应覆盖真正需要对外发布的包。`@carvis/carvis-media-cli` 当前仅通过 monorepo 内本地 bin 注入供 runtime 使用，没有外部安装面；把它继续放在公开 release group 中，只会制造不必要的 npm 发布与 trusted publishing 负担。
- **Alternatives considered**:
  - 独立版本号: 灵活，但很快会违背统一节奏目标。
  - 部分包统一、部分包独立: 规则复杂，agent 和开发者更容易忘。

## 决策 3：release PR 合并后自动 publish，但保留人工审核闸门

- **Decision**: `main` 上的 workflow 负责创建或更新单一 release PR；operator 合并该 PR 后，workflow 自动执行发布。
- **Rationale**: 这样同时满足“自动化减负”和“人为控制发版窗口”两个目标。release PR 合并前，operator 可以审阅版本推进、changelog、是否真的要发版；合并后则不再手工逐包 publish。
- **Alternatives considered**:
  - 只自动创建 release PR，不自动 publish: 会保留版本与 registry 之间的人工同步成本。
  - 合并普通功能 PR 后立即自动发版: 对当前仓库过于激进，也会削弱 operator 的发布控制点。

## 决策 4：发布命令必须对已存在版本做 skip 处理

- **Decision**: 发布入口继续沿用仓库自己的批处理逻辑，但要显式把“registry 中已有同版本”视为 skip，而不是 hard fail。
- **Rationale**: `changesets/action` 官方文档明确提示，发布后可能仍会有后续提交落到默认分支，因此自定义 publish 逻辑需要自行处理“某些版本已存在”的情况。仓库现有 `/Users/pipi/workspace/carvis-release-automation/scripts/publish-npm.sh` 已具备按包检查版本是否已存在并跳过的基础，适合作为演进起点。
- **Alternatives considered**:
  - 完全依赖 `changeset publish` 默认行为: 遇到重复版本时可恢复性较差，也不满足用户对明确 skip 语义的要求。
  - 完全丢弃现有脚本改成黑盒第三方 action: 会失去对公开包筛选、skip 结果与日志格式的仓库级控制。

## 决策 5：`gh` 是推荐工具，不是系统硬依赖

- **Decision**: 仓库 runbook 与 agent 规则中推荐使用 `gh` 查看 release PR、workflow run 与 release 状态，但 CI/workflow 主路径不依赖 `gh`。
- **Rationale**: GitHub Actions 与 `changesets/action` 已足够完成 release PR 与 publish 主流程。强制依赖 `gh` 只会增加环境前置条件，而不会增强流程正确性。真正需要固化的是“必须通过 release PR 发版”，不是“必须用某个 CLI”。
- **Alternatives considered**:
  - 把 `gh` 设为 CI 核心依赖: 增加运行时要求，收益有限。
  - 完全不提 `gh`: 会让本地 operator 缺少一致的辅助工具建议。

## 决策 6：agent 规则与 operator 文档必须同步更新

- **Decision**: 除实现配置外，必须同步更新 `AGENTS.md` 和 onboarding/runbook 文档，把 release PR 规则写成明确的协作契约。
- **Rationale**: 仅有 workflow 并不能阻止后续开发者或 agent 手工改版本号。仓库级协作文档必须明确告知：公开包版本推进通过 changeset 和 release PR；agent 不得绕过这一路径。
- **Alternatives considered**:
  - 只改 CI 不改文档: 很快会因协作方遗忘而回到手工流程。
  - 只在口头约定中强调: 不可审计，也无法作为 agent 的长期上下文。

## 决策 7：第一版不新增复杂的 release dashboard，而是依赖 GitHub / npm 原生可见产物

- **Decision**: operator 可见性基于 release PR、workflow logs、git tag、GitHub release、npm registry 查询结果和文档化检查步骤实现。
- **Rationale**: 这是仓库层自动化，不需要为第一版额外建设内部 dashboard。GitHub 与 npm 已提供足够的可审计表面；补齐规则和 runbook 即可满足需求。
- **Alternatives considered**:
  - 新建自定义发布状态面板: 成本高，当前没有必要。
  - 只看 workflow 成败: 无法区分哪些包成功、哪些包跳过。
