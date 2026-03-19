# 任务清单：Monorepo Release PR 自动化

**输入**: `/specs/017-changesets-release/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`

**测试要求**: 本功能触及仓库发布契约、公开包筛选、operator 可见发布结果与项目级协作规则，因此必须同时覆盖：
- release PR / publish eligibility 的契约测试
- release workflow / publish 流程的集成测试
- 文档与 runbook 的验证步骤

## Phase 1：Setup（共享准备）

**目的**: 为 release 自动化建立基础目录、依赖与文档入口

- [X] T001 在 `/Users/pipi/workspace/carvis-release-automation/package.json` 中添加 `@changesets/cli` 与 release 相关 scripts
- [X] T002 [P] 在 `/Users/pipi/workspace/carvis-release-automation/.changeset/README.md` 中建立 changeset 编写约定与公开包范围说明
- [X] T003 [P] 在 `/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md` 中建立 operator release runbook 骨架

---

## Phase 2：Foundational（阻塞性前置）

**目的**: 建立所有用户故事共享的公开包筛选、fixed release group 与发布入口

**⚠️ CRITICAL**: 本阶段完成前，不开始任何用户故事实现

- [X] T004 [P] 在 `/Users/pipi/workspace/carvis-release-automation/tests/contract/publish-eligibility.contract.test.ts` 中编写公开包资格筛选与当前 8 包快照锁定契约测试
- [X] T005 [P] 在 `/Users/pipi/workspace/carvis-release-automation/tests/contract/release-workflow.contract.test.ts` 中编写“仅 eligible changeset 才生成 release PR”与统一版本节奏契约测试
- [X] T006 在 `/Users/pipi/workspace/carvis-release-automation/scripts/release/publishable-workspaces.mjs` 和 `/Users/pipi/workspace/carvis-release-automation/scripts/release/release-group.mjs` 中实现公开包清单与 fixed release group 解析
- [X] T007 在 `/Users/pipi/workspace/carvis-release-automation/.changeset/config.json` 和 `/Users/pipi/workspace/carvis-release-automation/package.json` 中配置 fixed release group 与 release 命令入口
- [X] T008 在 `/Users/pipi/workspace/carvis-release-automation/scripts/publish-npm.sh` 中接入共享包筛选逻辑，输出逐包 `published` / `skipped_existing_version` / `failed` 结果，并保持 rerun-safe 幂等语义

**检查点**: 公开包集合、统一版本策略和可复用的发布入口已经就位，用户故事可开始实现

---

## Phase 3：用户故事 1 - 审核单一 release PR（优先级：P1）🎯 MVP

**目标**: 日常功能 PR 合并到 `main` 后，仓库自动创建或更新单一 release PR，operator 可在一处审核统一版本推进与变更摘要

**独立验证**: 合并一个带 changeset 的普通功能 PR 后，GitHub 自动出现或更新一条 release PR；docs-only 或 internal-only 改动不会错误创建公开 release PR

### 用户故事 1 的测试

- [X] T009 [P] [US1] 在 `/Users/pipi/workspace/carvis-release-automation/tests/integration/release-pr-workflow.test.ts` 中编写 release PR 创建与更新集成测试
- [X] T010 [P] [US1] 在 `/Users/pipi/workspace/carvis-release-automation/tests/contract/changeset-entry.contract.test.ts` 中编写 changeset entry、docs-only / internal-only 行为与 ineligible package 不触发公开 release PR 的契约测试

### 用户故事 1 的实现

- [X] T011 [US1] 在 `/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml` 中实现基于 `changesets/action` 的 release PR workflow，并以 eligible changeset 作为唯一生成门槛
- [X] T012 [US1] 在 `/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml` 和 `/Users/pipi/workspace/carvis-release-automation/.changeset/README.md` 中补齐单一 release PR 约定、空发布抑制与作者操作说明

**检查点**: 到这里，User Story 1 应可独立运行并验证“单一 release PR + 统一版本预览”主路径

---

## Phase 4：用户故事 2 - 合并后完成统一发布（优先级：P2）

**目标**: release PR 合并后，自动完成 git tag、GitHub release 与 npm publish，并清晰区分成功、跳过与失败结果

**独立验证**: 合并一条有效 release PR 后，公开包以统一版本节奏完成发布；私有包不会被纳入；已存在版本会按 skip 结果显示

### 用户故事 2 的测试

- [X] T013 [P] [US2] 在 `/Users/pipi/workspace/carvis-release-automation/tests/integration/release-publish-workflow.test.ts` 中编写 release PR 合并后发布流程的集成测试
- [X] T014 [P] [US2] 在 `/Users/pipi/workspace/carvis-release-automation/tests/contract/publish-npm.contract.test.ts` 中编写已存在版本跳过、私有包排除与 rerun-safe 幂等语义契约测试

### 用户故事 2 的实现

- [X] T015 [US2] 在 `/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml` 中接入 tag、GitHub release 与 npm publish 阶段
- [X] T016 [US2] 在 `/Users/pipi/workspace/carvis-release-automation/scripts/publish-npm.sh` 和 `/Users/pipi/workspace/carvis-release-automation/scripts/release/publishable-workspaces.mjs` 中落实 existing-version skip 与逐包发布摘要输出
- [X] T017 [US2] 在 `/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml` 和 `/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md` 中落地 workflow summary / artifact 的 operator 结果摘要，以及 workflow rerun / 手工 fallback 补救路径

**检查点**: 到这里，User Story 1 与 User Story 2 应可共同验证完整的 release PR 到 publish 闭环

---

## Phase 5：用户故事 3 - 遵守统一发版规则（优先级：P3）

**目标**: agent、开发者和 operator 能在项目文档中看到必须通过 changeset + release PR 发版的明确规则，并知道 `gh` 只是推荐辅助工具

**独立验证**: 查阅项目级协作文档即可得知 release PR 规则、changeset 编写要求、operator 检查步骤和推荐的 `gh` 用法

### 用户故事 3 的测试

- [X] T018 [P] [US3] 在 `/Users/pipi/workspace/carvis-release-automation/tests/contract/release-documentation.contract.test.ts` 中编写 AGENTS / onboarding / runbook / 其他现有 AI 入口规则覆盖契约测试

### 用户故事 3 的实现

- [X] T019 [US3] 在 `/Users/pipi/workspace/carvis-release-automation/AGENTS.md` 与仓库中其他现有 AI 工具指导文件中写入 changeset + release PR 的 agent 协作规则
- [X] T020 [US3] 在 `/Users/pipi/workspace/carvis-release-automation/docs/guides/developer-onboarding.md` 和 `/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md` 中补齐开发者与 operator 的 release 操作说明，并说明多 AI 入口需要保持规则一致

**检查点**: 到这里，User Story 3 应可独立验证“流程被文档化并对 agent / developer / operator 可见”

---

## Phase 6：Polish & Cross-Cutting Concerns

**目的**: 用真实仓库配置完成收尾、dogfooding 和回归验证

- [X] T021 [P] 在 `/Users/pipi/workspace/carvis-release-automation/.changeset/release-automation-dogfood.md` 中添加本功能自己的 dogfood changeset，用于验证新 release PR 主路径
- [X] T022 [P] 在 `/Users/pipi/workspace/carvis-release-automation/specs/017-changesets-release/quickstart.md` 和 `/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md` 中写回 GitHub secrets、dry-run、失败重试与核验步骤
- [X] T023 在 `/Users/pipi/workspace/carvis-release-automation/specs/017-changesets-release/quickstart.md` 中记录回归结果，并在仓库根目录运行 `bun run lint`、`bun test`、`git diff --check -- .`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（Setup）**: 无依赖，可立即开始
- **Phase 2（Foundational）**: 依赖 Phase 1，阻塞所有用户故事
- **Phase 3（US1）**: 依赖 Phase 2 完成，是 MVP
- **Phase 4（US2）**: 依赖 US1 的 release PR workflow 基线
- **Phase 5（US3）**: 依赖 Phase 2；为保证文档与真实实现一致，建议在 US1 / US2 基本完成后执行
- **Phase 6（Polish）**: 依赖所有目标用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: 可在 Foundational 完成后独立实施与验证
- **User Story 2 (P2)**: 依赖 User Story 1 已建立 release PR workflow
- **User Story 3 (P3)**: 依赖 Foundational 提供稳定规则边界；建议在 US1 / US2 后收尾以保持文档真实

### Parallel Opportunities

- Phase 1 中 `T002` 与 `T003` 可并行
- Phase 2 中 `T004` 与 `T005` 可并行
- User Story 1 中 `T009` 与 `T010` 可并行
- User Story 2 中 `T013` 与 `T014` 可并行
- User Story 3 中 `T018` 可与文档准备工作并行
- Polish 中 `T021` 与 `T022` 可并行

---

## Parallel Example: User Story 1

```bash
Task: "在 tests/integration/release-pr-workflow.test.ts 中编写 release PR 创建与更新集成测试"
Task: "在 tests/contract/changeset-entry.contract.test.ts 中编写 changeset entry 与 docs-only / internal-only 行为契约测试"
```

## Parallel Example: User Story 2

```bash
Task: "在 tests/integration/release-publish-workflow.test.ts 中编写 release PR 合并后发布流程的集成测试"
Task: "在 tests/contract/publish-npm.contract.test.ts 中编写已存在版本跳过与私有包排除契约测试"
```

## 实施策略

### MVP First（只做 User Story 1）

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational
3. 完成 Phase 3：User Story 1
4. 停下并验证 release PR 能否稳定创建 / 更新

### Incremental Delivery

1. Setup + Foundational 打好基础
2. 交付 User Story 1，先拿到单一 release PR
3. 交付 User Story 2，补齐真正的自动发布闭环
4. 交付 User Story 3，把规则固化到 agent / developer / operator 文档
5. 最后 dogfood 并完成全量回归

## Notes

- 所有任务都遵循 `- [ ] Txxx ...` 的 checklist 格式
- `private: true` 或缺失有效版本号的 workspace 包不得进入公开发布
- `gh` 是推荐辅助工具，不是 CI 主路径依赖
- 任何公开包版本推进都必须通过 changeset + release PR，而不是手工批量改版本号
- 若实现触及任何 AI 工具入口、prompt、command、rule 或 agent 指导文件，必须同步更新仓库中所有现有镜像入口与指导文件，例如 `.codex/prompts/`、`.cursor/commands/`、`CLAUDE.md`、`.opencode/`（若存在）
