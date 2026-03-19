# 功能规格说明：Monorepo Release PR 自动化

**功能分支**: `017-changesets-release`
**创建日期**: 2026-03-19
**状态**: 草稿
**输入**: 用户描述："为 carvis 建立基于 Changesets 和 GitHub Actions 的 monorepo release PR、统一版本节奏、tag、GitHub release、npm publish 自动化，并补充 agent release 规则。"

## 系统影响 *(必填)*

- **受影响渠道**: 无
- **受影响桥接器**: 无
- **受影响执行路径**: repository collaboration, versioning, release approval, npm publishing
- **运维影响**: release PR 审核、版本推进、tag / GitHub release 生成、npm 发布状态可见性
- **范围外内容**: 运行时消息处理、`ChannelAdapter` / `AgentBridge` 行为、Postgres / Redis 生命周期语义、完全无人审查直发、将 `gh` 设为 CI 硬依赖、发布私有 workspace 包

## 用户场景与测试 *(必填)*

### 用户故事 1 - 审核单一 release PR（优先级：P1）

作为维护 `carvis` 的 operator，我希望日常功能变更合入后，仓库能够自动整理出一条统一版本的 release PR，这样我只需要审核一处版本与变更摘要，就能决定是否发版。

**优先级原因**: 这是本功能的核心价值。若没有稳定的 release PR 闸门，版本号、变更摘要与发布节奏仍会依赖人工同步，无法解决当前问题。

**独立验证方式**: 合并一个带有发布说明的普通功能 PR 后，仓库自动出现或更新一条 release PR；该 PR 只包含统一版本推进和面向发布的变更摘要，operator 无需手工编辑多个包版本。

**验收场景**:

1. **Given** 默认分支上已有新的可发布变更且尚未形成 release PR，**When** 发布自动化运行，**Then** 仓库生成一条可审阅的 release PR，汇总本轮应发布的公开包版本变化与变更摘要。
2. **Given** 默认分支在 release PR 打开期间又合入新的可发布变更，**When** 发布自动化再次运行，**Then** 同一条 release PR 被更新，而不是并行生成多条互相竞争的 release PR。
3. **Given** 本轮变更只涉及不参与公开发布的内部内容，**When** 发布自动化运行，**Then** 系统不会错误创建面向公开包的 release PR。

---

### 用户故事 2 - 合并后完成统一发布（优先级：P2）

作为负责发版的 operator，我希望在合并 release PR 后，仓库自动完成统一版本的 tag、GitHub release 和 npm 发布，并清楚反映每个公开包的发布结果，这样我不必再手工逐包执行发版步骤。

**优先级原因**: 如果 release PR 合并后仍需手工执行多步发布，流程仍然脆弱，也无法保证 GitHub release、tag 与 npm registry 一致。

**独立验证方式**: 合并一条有效的 release PR 后，公开包在同一版本节奏下被发布；GitHub 上出现对应 tag 与 release，且私有包不会被错误纳入发布。

**验收场景**:

1. **Given** 一条有效的 release PR 已被合并，**When** 发布流程进入正式发布阶段，**Then** 所有参与本轮发布的公开包以同一版本节奏完成发布，并生成对应 tag 与 GitHub release。
2. **Given** 某个公开包的目标版本已存在于 npm registry，**When** 发布流程执行，**Then** 系统对该包给出明确的“已存在/已跳过”结果，而不是让整轮发布因重复版本直接失去可用性。
3. **Given** 仓库中存在 `private` workspace 包，**When** 发布流程执行，**Then** 这些包不会被纳入 npm 公开发布范围。

---

### 用户故事 3 - 遵守统一发版规则（优先级：P3）

作为在仓库中协作的 agent 或开发者，我希望项目文档和协作规则明确要求通过 release PR 流程推进版本，而不是随意手改多个 `package.json` 或跳过发布说明，这样后续协作不会因为遗忘流程而重新回到手工发版状态。

**优先级原因**: 工具链本身不足以保证长期一致性；如果 agent 和开发者没有看到明确规则，流程很快会被绕过。

**独立验证方式**: 查阅项目级 agent 指南和 operator 文档时，可以明确看到发布规则、推荐命令与禁止行为；普通开发变更能通过标准流程补充发布说明并等待 release PR 合并。

**验收场景**:

1. **Given** agent 或开发者准备让某个公开包参与下一次发布，**When** 其查阅项目协作规则，**Then** 文档明确要求通过 release PR 流程推进版本，而不是手工同步多个包版本号。
2. **Given** agent 或开发者需要查看或辅助处理 release PR，**When** 其阅读操作说明，**Then** 文档给出推荐的本地辅助方式，例如优先使用 `gh` 查看 PR / release 状态，但不把它定义为唯一可用路径。

### 边界与异常场景

- 当一次发布只涉及单个公开包时，系统仍应保持该轮所有参与发布的公开包处于统一版本节奏，而不是把同组包拆成彼此独立的版本轨道。
- 当默认分支存在尚未发布的多次普通合并时，系统应把这些变更合并到同一条 release PR 中，而不是要求 operator 手工整理发布范围。
- 当默认分支新增的改动没有任何命中公开 release group 的 changeset entry 时，系统不得创建面向公开包的 release PR。
- 当 release PR 已存在但仍未合并时，系统不得再创建第二条同用途的 release PR。
- 当仓库中存在未设置版本号或 `private: true` 的 workspace 包时，系统不得尝试把它们纳入公开发布。
- 当发布阶段部分包成功、部分包失败或被跳过时，operator 必须能明确区分“发布成功”“重复版本跳过”“发布失败待处理”这几种结果。
- 当发布流程失败时，仓库规则必须仍然保留 operator 的人工排查与重试路径，而不是把问题隐藏在黑盒自动化里。
- 当开发者只修改文档、内部工具或测试资产时，系统不得无意义地推动一次面向公开包的发布。

## 需求 *(必填)*

### 功能需求

- **FR-001**: System MUST 为所有参与公开发布的 `@carvis/*` workspace 包定义统一版本节奏，使同一轮发布中的公开包使用一致的版本号推进规则。
- **FR-002**: System MUST 通过单一 release PR 作为公开发版的审核闸门，汇总本轮版本变化与发布摘要。
- **FR-003**: System MUST 在默认分支出现至少一条命中公开 release group 的 changeset entry 时，自动创建或更新现有 release PR，而不是要求维护者手工整理版本改动。
- **FR-004**: System MUST 在 release PR 合并后，自动推进对应的 git tag、GitHub release 与 npm 发布，使仓库版本状态和 registry 状态保持一致。
- **FR-005**: System MUST 仅将 `private: false` 且具备有效版本号的 workspace 包纳入公开发布范围。
- **FR-006**: System MUST 在目标版本已存在于 npm registry 时，对对应包产生清晰的跳过结果，并避免把该情况误报为整轮发布不可恢复失败。
- **FR-007**: System MUST 为 operator 提供清晰的发布结果可见性，使其能够判断本轮发布涉及哪些公开包、对应统一版本号为何、哪些步骤成功、哪些步骤失败或被跳过。
- **FR-008**: System MUST 仅以“是否存在命中公开 release group 的 changeset entry”作为是否生成公开 release PR 的判定门槛；不命中公开包的 docs-only、internal-only 或 ineligible package 变更不得推动公开 release PR。
- **FR-009**: Users MUST be able to 在日常功能开发中为可发布变更补充面向发布的说明，并让这些说明进入下一条 release PR。
- **FR-010**: System MUST 在项目级 agent / 协作文档中明确规定：公开包版本推进必须通过 release PR 流程完成，agent 不得通过手工批量修改多个 `package.json` 版本号来绕过该流程；若仓库同时存在多个 AI 工具入口、镜像命令树或 agent 指导文件，这些规则 MUST 同步更新到所有现有入口。
- **FR-011**: System MUST 在项目文档中给出 operator 的本地辅助操作方式，包括查看 release PR / release 状态的推荐命令；若仓库推荐 `gh`，也 MUST 将其定义为辅助工具而非系统唯一依赖。
- **FR-012**: System MUST 为 operator 提供一条 documented 且 rerun-safe 的失败补救路径，使其可以通过 workflow rerun 或手工 fallback 重试发布，而不要求重建整套发布配置；重复 publish 必须依赖现有 skip 语义保持幂等。

### 运维与可观测性需求 *(执行流变化时必填)*

- **OR-001**: System MUST 让 operator 能从 release PR、workflow run summary、workflow artifact 或 GitHub release 等仓库可见产物中区分“等待生成 release PR”“release PR 待审核”“release PR 已合并并进入发布”“发布成功”“发布部分跳过”“发布失败待处理”等状态。
- **OR-002**: System MUST 为每轮发布保留可审计的结果摘要，至少说明统一版本号、参与发布的公开包集合、每个包的发布结论，以及失败后建议使用的 rerun / fallback 路径。
- **OR-003**: System MUST 说明并记录本功能不会改变运行时 `ChannelAdapter` / `AgentBridge` 边界、工作区串行化约束、或现有 Postgres / Redis 生命周期语义。

### 关键实体 *(涉及数据时填写)*

- **Release PR**: 表示一轮待审核的公开发版提案，包含统一版本推进结果、发布摘要以及等待合并的状态。
- **Release Group**: 表示所有需要遵守统一版本节奏的公开 `@carvis/*` 包集合，是每轮发版的版本同步边界。
- **Release Note Entry**: 表示某次普通变更附带的发布说明，用于决定下一轮 release PR 中应出现的发布摘要。
- **Publish Result**: 表示某个公开包在一轮发布中的结论，例如成功、重复版本跳过或失败待处理。

### 假设与依赖

- 仓库继续以 GitHub 作为主托管平台，并以 npm 作为公开包 registry。
- 默认分支仍是 `main`，公开发布包继续使用 workspace 结构维护。
- 仓库操作者可以为发布自动化配置 GitHub 与 npm 所需凭据。

## 成功标准 *(必填)*

### 可度量结果

- **SC-001**: 对于任一包含公开包改动的发版周期，operator 无需手工编辑多个 `package.json` 版本号，即可在一条 release PR 中完成版本审核。
- **SC-002**: 100% 的参与公开发布包在同一轮发布后呈现一致的版本号，不出现同轮发布中公开包版本彼此漂移的情况。
- **SC-003**: 合并 release PR 后，operator 可以在一次标准发布流程内同时获得对应的 git tag、GitHub release 和 npm 发布结果，而无需逐包手工执行发版命令。
- **SC-004**: 100% 的 `private` workspace 包与缺失有效版本号的 workspace 包不会被纳入公开发布。
- **SC-005**: agent 与开发者在项目级协作文档中能明确看到 release PR 规则，且后续公开包相关变更不再依赖“记住口头约定”来决定是否补充发布说明。
