# 任务清单：Feishu 稳定富文本适配

**输入**: `/specs/008-feishu-richtext-adapter/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能触及 Feishu adapter、出站投递、单消息卡片语义和运行呈现边界，因此契约测试与集成测试均为必需；单元测试用于覆盖转换规则、降级边界和 sender payload 组装。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 任务所属用户故事（如 US1、US2、US3）
- 每条任务都包含明确文件路径

## Path Conventions

- **Gateway app**: `apps/gateway/src/`
- **Executor app**: `apps/executor/src/`
- **Shared packages**: `packages/<name>/src/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/unit/`

## Phase 1：初始化（共享基础设施）

**目的**: 为 Feishu 富文本适配补齐独立 worktree 下的验证入口和测试夹具

- [ ] T001 更新 Feishu runtime sender 测试夹具与 quickstart 基线断言入口在 `tests/unit/feishu-runtime-sender.test.ts`、`specs/008-feishu-richtext-adapter/quickstart.md`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 在实现任何用户故事前完成 `channel-feishu` 内统一转换入口与导出边界

**⚠️ CRITICAL**: 用户故事开发必须在本阶段完成后开始

- [ ] T002 创建 Feishu 富文本转换中间模型与公共类型在 `packages/channel-feishu/src/feishu-rich-text-transformer.ts`
- [ ] T003 [P] 创建 Feishu 卡片元素映射模块，封装 `RenderableBlock -> interactive card elements` 映射在 `packages/channel-feishu/src/feishu-card-content-mapper.ts`
- [ ] T004 [P] 更新 `channel-feishu` 导出面与 sender 依赖装配，接入统一转换入口在 `packages/channel-feishu/src/index.ts`、`packages/channel-feishu/src/runtime-sender.ts`
- [ ] T005 [P] 补齐转换阶段的可观测性出口，记录 normalized / degraded / fallback 等 operator-visible 状态在 `packages/core/src/observability/logger.ts`、`apps/gateway/src/services/run-notifier.ts`

**检查点**: `channel-feishu` 已具备共享转换骨架，用户故事可以围绕同一入口展开

---

## Phase 3：用户故事 1 - 流式输出稳定可读（优先级：P1）🎯 MVP

**目标**: 让运行中卡片在流式更新时稳定展示标题、列表、代码块、路径、命令和链接等结构

**独立验证方式**: 发起一次包含标题、列表、代码块、路径和链接的普通请求，确认运行中卡片持续更新且结构稳定可读

### 用户故事 1 的测试 ⚠️

- [ ] T006 [P] [US1] 新增转换器单元测试，覆盖标题 section 化、列表、强调、引用、图片保留和未闭合代码块容错在 `tests/unit/feishu-rich-text-transformer.test.ts`
- [ ] T007 [P] [US1] 新增长文本窗口与分段边界单元测试，覆盖超长输出的最小必要截断和顺序保持在 `tests/unit/feishu-rich-text-transformer.test.ts`
- [ ] T008 [P] [US1] 更新运行中卡片契约与集成测试，覆盖累计文本输入和流式稳定渲染在 `tests/contract/feishu-streaming-card.contract.test.ts`、`tests/integration/feishu-streaming-card.test.ts`

### 用户故事 1 的实现

- [ ] T009 [P] [US1] 在 `packages/channel-feishu/src/feishu-rich-text-transformer.ts` 实现 `streaming` 模式的解析、归一化和降级规则
- [ ] T010 [P] [US1] 在 `packages/channel-feishu/src/feishu-card-content-mapper.ts` 实现 section、段落、列表、强调、引用、图片、代码块和 rule 的 Feishu 元素映射
- [ ] T011 [US1] 在 `packages/channel-feishu/src/feishu-rich-text-transformer.ts` 实现长文本窗口、最小必要分段和阅读顺序保持策略
- [ ] T012 [US1] 将运行中 `createCard` / `updateCard` 改为基于统一转换结果构建卡片在 `packages/channel-feishu/src/runtime-sender.ts`

**检查点**: 到这里，流式卡片应能独立保持稳定可读

---

## Phase 4：用户故事 2 - 终态结果保持单消息结构（优先级：P2）

**目标**: 让终态结果继续落在同一张卡片上，并沿用与流式一致的结构表达规则

**独立验证方式**: 发起一次普通请求并等待其完成、失败或取消，确认同一张卡片切换为稳定可读的终态结果，且不新增第二条成功消息

### 用户故事 2 的测试 ⚠️

- [ ] T013 [P] [US2] 更新 sender 单元测试，覆盖 `terminal` 模式标题分段、代码块、链接、引用和图片在终态卡片中的稳定输出在 `tests/unit/feishu-runtime-sender.test.ts`
- [ ] T014 [P] [US2] 更新终态卡片契约与集成测试，覆盖 completed / failed / cancelled 的同卡片终态切换在 `tests/contract/feishu-terminal-card.contract.test.ts`、`tests/integration/feishu-terminal-card.test.ts`

### 用户故事 2 的实现

- [ ] T015 [P] [US2] 在 `packages/channel-feishu/src/feishu-rich-text-transformer.ts` 实现 `terminal` 模式的完整分段和标题归一化策略
- [ ] T016 [US2] 在 `packages/channel-feishu/src/runtime-sender.ts` 让 `completeCard` 复用统一转换主流程并维持单消息卡片语义
- [ ] T017 [US2] 收敛 `channel-feishu` 的终态卡片 payload 组装，确保 `streaming` / `terminal` 共享核心结构映射在 `packages/channel-feishu/src/runtime-sender.ts`、`packages/channel-feishu/src/feishu-card-content-mapper.ts`

**检查点**: 到这里，终态卡片与流式卡片应共享同一套结构语义

---

## Phase 5：用户故事 3 - 降级后仍然有可读交付（优先级：P3）

**目标**: 在不兼容语法或卡片链路失败时，维持可读降级和既有 fallback 交付语义，并让失败阶段可区分

**独立验证方式**: 模拟不支持语法、卡片创建失败和卡片更新失败，确认用户最终仍有可读交付，且不会破坏单消息成功路径

### 用户故事 3 的测试 ⚠️

- [ ] T018 [P] [US3] 新增降级边界单元测试，覆盖未知 HTML/XML 标签、HTMLBlock 和危险标签不得原样透传在 `tests/unit/feishu-rich-text-transformer.test.ts`
- [ ] T019 [P] [US3] 更新 fallback 契约与降级集成测试，覆盖“创建失败才 fallback”“更新失败不得补发第二条成功消息”在 `tests/contract/feishu-fallback-terminal.contract.test.ts`、`tests/integration/feishu-presentation-degrade.test.ts`、`tests/integration/feishu-fallback-terminal.test.ts`
- [ ] T020 [P] [US3] 在 `tests/unit/feishu-runtime-sender.test.ts` 和 `tests/contract/feishu-streaming-card.contract.test.ts` 对转换结果与发送失败边界补充断言，锁定 sender seam

### 用户故事 3 的实现

- [ ] T021 [P] [US3] 在 `packages/channel-feishu/src/feishu-rich-text-transformer.ts` 标注转换结果类型与降级片段，区分 `preserved` / `normalized` / `degraded`
- [ ] T022 [US3] 在 `packages/channel-feishu/src/runtime-sender.ts` 保持“内容降级不等于发送失败”的 sender 语义，并只在卡片从未成功创建时走 fallback terminal
- [ ] T023 [US3] 将转换成功、转换降级、卡片失败和 fallback terminal 的运维可见状态接入现有日志链路在 `packages/core/src/observability/logger.ts`、`apps/gateway/src/services/run-notifier.ts`

**检查点**: 到这里，异常路径应保持可靠且可审计

---

## Phase 6：收尾与横切关注点

**目的**: 完成最终验证并回写 feature 验收说明

- [ ] T024 [P] 补充运行控制流无回归的回归验证任务，锁定 queue / cancel / timeout / heartbeat / session-memory 相关现有集成测试在 `tests/integration/feishu-session-memory-commands.test.ts`、`tests/integration/run-heartbeat-expiry.test.ts`、`tests/integration/abort-command.test.ts`
- [ ] T025 [P] 依据最终实现更新 feature 验收步骤与预期结果在 `specs/008-feishu-richtext-adapter/quickstart.md`
- [ ] T026 运行 `bun run lint`、`bun test`、`bunx tsc --noEmit`、`git diff --check -- .` 并在 `specs/008-feishu-richtext-adapter/quickstart.md` 记录验证结论

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（初始化）**: 可立即开始
- **Phase 2（基础能力）**: 依赖 Phase 1 完成，并阻塞所有用户故事
- **Phase 3-5（用户故事）**: 都依赖 Phase 2 完成；建议按 P1 → P2 → P3 推进
- **Phase 6（收尾）**: 依赖需要交付的用户故事完成

### User Story Dependencies

- **US1（P1）**: 在 Phase 2 完成后即可开始，是 MVP
- **US2（P2）**: 依赖 US1 已具备共享转换入口和流式卡片稳定渲染
- **US3（P3）**: 依赖 US1、US2 已建立统一 sender seam，随后再锁定降级和 fallback 边界

### Within Each User Story

- 契约测试、集成测试和相关单元测试必须先写并先失败
- 转换器和 mapper 先于 sender 接线
- sender 接线先于异常路径与 fallback 约束收口
- 最终验证必须覆盖 lint、test、typecheck 和 diff 检查

### Parallel Opportunities

- T002 完成后，T003、T004、T005 可并行
- US1 中 T006、T007、T008、T009、T010 可并行
- US2 中 T013、T014、T015 可并行
- US3 中 T018、T019、T020、T021 可并行
- 收尾阶段 T024、T025 与最终命令准备可并行

---

## Parallel Example：User Story 1

```bash
# 先并行补测试
Task: "新增转换器单元测试在 tests/unit/feishu-rich-text-transformer.test.ts"
Task: "更新运行中卡片契约与集成测试在 tests/contract/feishu-streaming-card.contract.test.ts、tests/integration/feishu-streaming-card.test.ts"

# 再并行补转换骨架
Task: "实现 streaming 模式转换规则在 packages/channel-feishu/src/feishu-rich-text-transformer.ts"
Task: "实现 Feishu 卡片元素映射在 packages/channel-feishu/src/feishu-card-content-mapper.ts"
```

---

## 实施策略

### MVP First（仅 User Story 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：流式输出稳定可读
4. 停下来验证运行中卡片是否已经稳定

### Incremental Delivery

1. 先交付 US1，确保流式卡片稳定渲染
2. 再交付 US2，让终态结果落回同一张卡片
3. 最后交付 US3，锁定降级与 fallback 语义

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1-2 的共享转换骨架
2. 骨架完成后：
   - 开发者 A：US1 流式转换与 mapping
   - 开发者 B：US2 终态卡片切换
   - 开发者 C：US3 降级与 fallback 边界

---

## Notes

- [P] 任务表示不同文件、依赖可拆开的并行工作
- [US1] / [US2] / [US3] 保证任务能追溯到具体用户故事
- 不得把 Feishu 渲染规则上移到 `apps/gateway` 或 `packages/bridge-codex`
- 不得把转换层扩展成摘要器或内容重写器
- 不得为正常成功路径新增第二条终态成功消息
