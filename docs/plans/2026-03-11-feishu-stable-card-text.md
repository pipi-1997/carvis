# Feishu Stable Card Text Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw Markdown syntax in Feishu card bodies with stable readable card text for headings, lists, inline code, and fenced code blocks.

**Architecture:** Keep the rendering boundary inside `packages/channel-feishu`, but change the transformer output from markdown-oriented strings to stable display blocks that do not rely on Feishu `lark_md` interpreting Markdown syntax. Preserve section ordering and failure semantics in the existing sender flow.

**Tech Stack:** Bun, TypeScript, Hono, Feishu interactive cards

---

### Task 1: Lock the regression with tests

**Files:**
- Modify: `tests/unit/feishu-rich-text-transformer.test.ts`
- Modify: `tests/unit/feishu-runtime-sender.test.ts`
- Modify: `tests/contract/feishu-richtext-rendering.contract.test.ts`

**Step 1: Write the failing tests**
- Add expectations that list items are rendered as stable bullets instead of raw `-`.
- Add expectations that inline code no longer shows raw backticks.
- Add expectations that fenced code blocks no longer show raw fences and remain readable in both streaming and terminal flows.

**Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/feishu-rich-text-transformer.test.ts tests/unit/feishu-runtime-sender.test.ts tests/contract/feishu-richtext-rendering.contract.test.ts`

**Step 3: Commit**
- Skip until implementation is complete.

### Task 2: Refactor rendering blocks

**Files:**
- Modify: `packages/channel-feishu/src/feishu-rich-text-transformer.ts`
- Modify: `packages/channel-feishu/src/feishu-card-content-mapper.ts`
- Modify: `packages/channel-feishu/src/runtime-sender.ts`

**Step 1: Write minimal implementation**
- Introduce stable block kinds for text and code display.
- Normalize list items, quotes, inline emphasis, inline code, links, and images into readable text.
- Strip fenced code markers from display while preserving content ordering and language hint.
- Map rendered blocks to card elements that do not depend on Markdown interpretation for these structures.

**Step 2: Run targeted tests**

Run: `bun test tests/unit/feishu-rich-text-transformer.test.ts tests/unit/feishu-runtime-sender.test.ts tests/contract/feishu-richtext-rendering.contract.test.ts`

### Task 3: Verify end to end

**Files:**
- Verify only

**Step 1: Run verification**

Run: `bun run lint`

Run: `bun test`

Run: `bunx tsc --noEmit`

Run: `git diff --check -- .`
