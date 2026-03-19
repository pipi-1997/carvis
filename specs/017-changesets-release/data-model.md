# 数据模型：Monorepo Release PR 自动化

## `ReleaseGroup`

- **作用**: 表示所有遵守统一版本节奏的公开 `@carvis/*` package 集合。
- **关键字段**:
  - `name`: 固定标识本仓库的统一发布组
  - `packages`: 公开 package 名称列表
  - `versionPolicy`: `fixed`
  - `visibilityRule`: 仅包含 `private: false` 且具备有效版本号的 workspace 包
- **当前成员**:
  - 该列表是基于当前资格规则推导出的成员快照，必须由契约测试锁定
  - `@carvis/core`
  - `@carvis/channel-feishu`
  - `@carvis/bridge-codex`
  - `@carvis/carvis-schedule-cli`
  - `@carvis/gateway`
  - `@carvis/executor`
  - `@carvis/carvis-cli`
- **约束**:
  - 组内包在同一轮发布中使用相同版本号
  - `private: true` 或缺失版本号的 workspace 包不得成为成员
  - `@carvis/carvis-media-cli` 作为内部 transport CLI，不属于公开发布成员
  - 成员资格优先由规则推导；当前快照若变化，必须同步更新契约测试与文档

## `ChangesetEntry`

- **作用**: 表示一次普通开发变更附带的发布意图记录。
- **关键字段**:
  - `id`: 唯一文件标识
  - `packages`: 本次声明会影响的公开 package 集合
  - `bumpType`: `patch` | `minor` | `major`
  - `summary`: 面向 release PR 与 changelog 的变更摘要
  - `authoringRule`: 由开发者或 agent 在功能变更阶段创建
- **约束**:
  - 内容必须面向发布摘要，而不是实现细节堆砌
  - 不得用手工改版本号替代 `ChangesetEntry`
  - docs-only 或内部-only 变更可不产生 entry

## `ReleaseProposal`

- **作用**: 表示一轮待审核的 release PR 聚合结果。
- **关键字段**:
  - `branchName`: release PR 分支
  - `targetBranch`: 默认为 `main`
  - `proposedVersion`: 本轮统一版本号
  - `includedPackages`: 参与本轮发布的公开包集合
  - `releaseNotes`: 根据 `ChangesetEntry` 聚合后的摘要
  - `status`: `pending_update` | `ready_for_review` | `merged` | `superseded`
- **约束**:
  - 任一时刻最多存在一条活跃 release PR
  - 新的可发布变更到达时应更新当前 proposal，而不是平行创建多条 proposal
  - 只有当至少一条 `ChangesetEntry` 命中当前 `ReleaseGroup` 时，proposal 才允许被创建

## `PublishableWorkspace`

- **作用**: 表示 workflow 在发布阶段扫描到的单个 workspace 包。
- **关键字段**:
  - `name`
  - `version`
  - `privateFlag`
  - `path`
  - `eligible`: `true` | `false`
  - `ineligibilityReason`: `private_package` | `missing_version` | `outside_release_group` | null
- **约束**:
  - 只有 `eligible = true` 的 package 才允许进入 publish 阶段
  - 资格判定必须可审计、可复现

## `PublishResult`

- **作用**: 表示单个公开 package 在一次发布中的最终结论。
- **关键字段**:
  - `packageName`
  - `version`
  - `status`: `published` | `skipped_existing_version` | `failed`
  - `registryRef`: npm registry 中的结果引用或查询依据
  - `reportSurface`: `workflow_summary` | `workflow_artifact` | `github_release_body`
  - `summary`
- **约束**:
  - 每个参与发布的公开包都必须有一个明确结果
  - `skipped_existing_version` 不应伪装成 `published`
  - `failed` 必须保留足够的 operator 排查信息
  - 结果必须落到至少一个 GitHub 可见表面，供 operator 判断是否需要 rerun 或 fallback

## `ReleaseOperatorRule`

- **作用**: 表示项目对 agent / 开发者 / operator 的协作约束。
- **关键字段**:
  - `ruleId`
  - `audience`: `agent` | `developer` | `operator`
  - `statement`
  - `enforcementSurface`: `AGENTS.md` | onboarding | runbook | CI | mirrored_agent_guidance
- **关键规则**:
  - 公开包版本推进必须通过 changeset + release PR
  - agent 不得手工批量修改多个 `package.json` 版本号来绕过流程
  - `gh` 是推荐辅助工具，不是唯一依赖
  - 发布失败后优先使用 workflow rerun；若仍失败，再按 runbook 走手工 fallback
  - 若仓库存在多个 AI 工具入口或镜像指导文件，release 规则必须同步更新到全部现有入口

## 关系摘要

1. 开发者或 agent 为可发布变更写入一个或多个 `ChangesetEntry`
2. workflow 扫描 changeset 后聚合出单一 `ReleaseProposal`
3. `ReleaseProposal` 只覆盖 `ReleaseGroup` 中符合资格的 `PublishableWorkspace`
4. operator 合并 release PR 后，workflow 对每个 `PublishableWorkspace` 产出一个 `PublishResult`
5. `PublishResult` 与 git tag / GitHub release 共同形成 operator-visible 发布结果

## 状态迁移摘要

1. 普通开发中:
   - 可发布变更新增 `ChangesetEntry`
   - docs-only 或内部-only 变更可不进入发布提案

2. release PR 生成:
   - workflow 汇总 `ChangesetEntry`
   - 创建或更新 `ReleaseProposal(status = ready_for_review)`

3. release PR 合并:
   - `ReleaseProposal(status = merged)`
   - 进入 publish 阶段

4. 发布阶段:
   - 每个 `PublishableWorkspace` 进入 `PublishResult`
   - 结果可能是 `published`、`skipped_existing_version` 或 `failed`

5. 发布完成:
   - git tag 与 GitHub release 对应本轮统一版本
   - operator 可按 package 查看最终结果
