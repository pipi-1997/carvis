# Feishu On-Demand Guidance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把飞书引导从默认整页渲染改成字段级按需提示，并保留一个显式可选的完整帮助入口。

**Architecture:** 保留 `@clack/prompts` 作为 prompt runtime，不引入新的全屏 TUI 框架。`packages/channel-feishu` 负责输出字段级提示和完整 guide，`packages/carvis-cli` 负责决定在 `onboard/configure feishu` 中何时展示字段提示与完整帮助。

**Tech Stack:** Bun 1.x、TypeScript、@clack/prompts、bun test

---

### Task 1: 固定新的交互合同

**Files:**
- Modify: `tests/integration/carvis-onboard-feishu-guidance.test.ts`
- Modify: `tests/unit/carvis-cli-configure.test.ts`
- Modify: `tests/contract/feishu-setup.contract.test.ts`

**Step 1: Write the failing test**

- 把 `onboard` 集成测试改成默认只断言字段级提示，不再断言默认整套 guide 全展示
- 增加“显式查看完整引导时才展示完整 guide”的断言
- 在 `configure feishu` 单测中同步覆盖同样的行为
- 在 `feishu setup` contract test 中断言字段存在 `promptHint` / `promptHelpTitle`

**Step 2: Run test to verify it fails**

Run: `bun test tests/contract/feishu-setup.contract.test.ts tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts`
Expected: FAIL，因为当前实现仍默认输出整套 guide，且字段级提示结构尚不存在。

**Step 3: Write minimal implementation**

- 调整测试脚本用的 prompter，让它能记录字段级 note 与完整帮助 note

**Step 4: Run test to verify it passes**

Run: `bun test tests/contract/feishu-setup.contract.test.ts tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/contract/feishu-setup.contract.test.ts tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts
git commit -m "test: cover on-demand feishu guidance"
```

### Task 2: 重构 adapter-owned guidance 模型

**Files:**
- Modify: `packages/channel-feishu/src/setup.ts`
- Modify: `packages/channel-feishu/src/index.ts`

**Step 1: Write the failing test**

- 如果 Task 1 还没覆盖到字段级提示结构，这里补最小 contract 断言

**Step 2: Run test to verify it fails**

Run: `bun test tests/contract/feishu-setup.contract.test.ts`
Expected: FAIL，因为 `promptHint` / `promptHelpTitle` 尚未实现。

**Step 3: Write minimal implementation**

- 为 `FeishuSetupField` 增加字段级提示结构
- 保留完整 `guide`，但把字段提示从大段 section 中分离出来

**Step 4: Run test to verify it passes**

Run: `bun test tests/contract/feishu-setup.contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/channel-feishu/src/setup.ts packages/channel-feishu/src/index.ts tests/contract/feishu-setup.contract.test.ts
git commit -m "feat: add feishu field-level setup hints"
```

### Task 3: 调整 CLI 展示逻辑

**Files:**
- Modify: `packages/carvis-cli/src/adapter-guidance.ts`
- Modify: `packages/carvis-cli/src/onboarding.ts`
- Modify: `packages/carvis-cli/src/configure.ts`
- Modify: `packages/carvis-cli/src/prompt-runtime.ts`

**Step 1: Write the failing test**

- 依赖 Task 1 的失败测试

**Step 2: Run test to verify it fails**

Run: `bun test tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts`
Expected: FAIL，因为当前实现会默认输出完整 guide。

**Step 3: Write minimal implementation**

- 新增 `presentFeishuFieldHint()` 和 `presentFeishuFullGuide()`
- `onboard/configure feishu` 先询问是否查看完整说明
- 默认只在字段输入前展示当前字段短提示
- 完整 guide 仅在用户显式选择时展示

**Step 4: Run test to verify it passes**

Run: `bun test tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/carvis-cli/src/adapter-guidance.ts packages/carvis-cli/src/onboarding.ts packages/carvis-cli/src/configure.ts packages/carvis-cli/src/prompt-runtime.ts tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-configure.test.ts
git commit -m "feat: make feishu guidance progressive"
```

### Task 4: 同步 spec kit 和设计文档

**Files:**
- Modify: `specs/013-carvis-onboard-cli/spec.md`
- Modify: `specs/013-carvis-onboard-cli/research.md`
- Modify: `specs/013-carvis-onboard-cli/tasks.md`
- Modify: `specs/013-carvis-onboard-cli/quickstart.md`
- Create: `docs/plans/2026-03-16-feishu-on-demand-guidance-design.md`

**Step 1: Write the failing test**

- 无自动化测试；以需求一致性检查替代

**Step 2: Run test to verify it fails**

- 人工对照当前 spec，确认它仍然把“默认完整 guide”描述为期望行为

**Step 3: Write minimal implementation**

- 把 spec/research/tasks/quickstart 调整为“字段级按需提示 + 可选完整帮助”

**Step 4: Run test to verify it passes**

Run: `git diff -- specs/013-carvis-onboard-cli docs/plans`
Expected: 只包含本轮交互策略调整，无无关文档漂移。

**Step 5: Commit**

```bash
git add specs/013-carvis-onboard-cli docs/plans/2026-03-16-feishu-on-demand-guidance-design.md
git commit -m "docs: define progressive feishu guidance"
```

### Task 5: 完整验证与沙盒 TTY 验证

**Files:**
- Modify: none

**Step 1: Write the failing test**

- 无；执行完整验证

**Step 2: Run test to verify it fails**

- 不适用

**Step 3: Write minimal implementation**

- 无；只验证

**Step 4: Run test to verify it passes**

Run: `bun run lint`
Expected: PASS

Run: `bun test`
Expected: PASS

Run: `git diff --check -- .`
Expected: PASS

Run: `HOME=$(mktemp -d /tmp/carvis-cli-sandbox.XXXXXX) bun packages/carvis-cli/src/bin.ts onboard`
Expected: 默认先进入短提示式流程，不再一上来渲染整页说明；取消后不写真实 `~/.carvis`

Run: `HOME=$(mktemp -d /tmp/carvis-cli-sandbox.XXXXXX) bun packages/carvis-cli/src/bin.ts configure feishu`
Expected: 默认字段级短提示；只有显式选择完整帮助时才展示完整 guide

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify progressive feishu onboarding"
```
