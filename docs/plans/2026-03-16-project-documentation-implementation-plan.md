# Project Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a layered documentation entry point for carvis with a root README, an operator handbook, and a developer-facing docs index.

**Architecture:** Keep deep implementation detail in existing architecture and runbook files, while adding thin entry documents that route readers by task and audience. Reuse current architecture and runbook content instead of duplicating it, and convert the old local runtime runbook into a lightweight redirect page.

**Tech Stack:** Markdown, existing repository docs under `docs/`, Bun workspace command surface

---

### Task 1: Add design and planning artifacts

**Files:**

- Create: `docs/plans/2026-03-16-project-documentation-design.md`
- Create: `docs/plans/2026-03-16-project-documentation-implementation-plan.md`

**Step 1: Write the design document**

Write a Markdown design doc that captures:

- the missing entry-point problem
- the chosen `README + operator handbook + docs index` structure
- audience separation and content boundaries
- risks and verification criteria

**Step 2: Review the design document for boundary clarity**

Run: `sed -n '1,240p' docs/plans/2026-03-16-project-documentation-design.md`

Expected: the document clearly separates README, operator, developer, and runbook responsibilities.

**Step 3: Write the implementation plan**

Write this implementation plan with exact file paths and execution order.

**Step 4: Review the plan document**

Run: `sed -n '1,260p' docs/plans/2026-03-16-project-documentation-implementation-plan.md`

Expected: the plan names the exact docs files to create or modify.

### Task 2: Create the root README

**Files:**

- Create: `README.md`
- Reference: `docs/architecture.md`
- Reference: `docs/runbooks/schedule-management.md`
- Reference: `AGENTS.md`

**Step 1: Draft the README structure**

Include sections for:

- project positioning
- current scope
- prerequisites
- quickstart
- core capabilities and boundaries
- repository structure
- common commands
- documentation navigation

**Step 2: Check that the README stays shallow**

Run: `sed -n '1,260p' README.md`

Expected: the README links outward instead of inlining architecture or troubleshooting detail.

**Step 3: Verify command references**

Run: `rg -n "carvis onboard|carvis start|carvis status|carvis doctor|/bind|/mode|/new" README.md`

Expected: the README exposes the highest-value runtime and chat commands.

### Task 3: Create the operator handbook

**Files:**

- Create: `docs/guides/operator-handbook.md`
- Reference: `docs/runbooks/local-runtime-cli.md`
- Reference: `docs/runbooks/schedule-management.md`
- Reference: `docs/architecture.md`
- Reference: `packages/carvis-cli/src/index.ts`

**Step 1: Draft the handbook around operator tasks**

Cover:

- prerequisites
- onboarding
- existing config reuse/modify/cancel
- lifecycle commands
- ready/health checks
- local files
- troubleshooting flow
- common error codes
- schedule management pointer

**Step 2: Confirm the handbook contains operator-specific detail**

Run: `sed -n '1,320p' docs/guides/operator-handbook.md`

Expected: it includes `~/.carvis/*`, error codes, and a status/doctor/log-based recovery flow.

**Step 3: Confirm it does not duplicate schedule deep dives**

Run: `rg -n "managed-schedules|unsupported_schedule|ambiguous_target" docs/guides/operator-handbook.md`

Expected: either no matches or only a pointer to the schedule runbook.

### Task 4: Create the docs index for developers

**Files:**

- Create: `docs/index.md`
- Reference: `docs/architecture.md`
- Reference: `AGENTS.md`
- Reference: `specs/`

**Step 1: Draft the docs landing page**

Include sections for:

- reader paths
- system map
- core concepts
- development commands
- testing expectations
- feature guides and design archives

**Step 2: Verify it routes to the right destinations**

Run: `sed -n '1,280p' docs/index.md`

Expected: links to operator handbook, architecture doc, runbooks, and `specs/`.

### Task 5: Refine the legacy local runtime runbook

**Files:**

- Modify: `docs/runbooks/local-runtime-cli.md`
- Reference: `docs/guides/operator-handbook.md`

**Step 1: Replace duplicated primary guidance**

Keep this file as a short runbook entry that:

- points to the operator handbook for primary usage
- preserves a compact quick-reference list
- keeps compatibility for old links

**Step 2: Review the result**

Run: `sed -n '1,220p' docs/runbooks/local-runtime-cli.md`

Expected: the file is shorter and clearly points to `docs/guides/operator-handbook.md`.

### Task 6: Verify markdown outputs and link structure

**Files:**

- Verify: `README.md`
- Verify: `docs/index.md`
- Verify: `docs/guides/operator-handbook.md`
- Verify: `docs/runbooks/local-runtime-cli.md`

**Step 1: Run markdown formatting checks**

Run: `bunx prettier --check README.md docs/index.md docs/guides/operator-handbook.md docs/runbooks/local-runtime-cli.md docs/plans/2026-03-16-project-documentation-design.md docs/plans/2026-03-16-project-documentation-implementation-plan.md`

Expected: all listed Markdown files are formatted.

**Step 2: Sanity-check the main docs for headings and links**

Run: `rg -n "^# |^\[|operator-handbook|docs/index|architecture|runbooks" README.md docs/index.md docs/guides/operator-handbook.md docs/runbooks/local-runtime-cli.md`

Expected: the docs cross-link correctly and expose the intended navigation structure.

**Step 3: Review git diff**

Run: `git diff -- README.md docs/index.md docs/guides/operator-handbook.md docs/runbooks/local-runtime-cli.md docs/plans/2026-03-16-project-documentation-design.md docs/plans/2026-03-16-project-documentation-implementation-plan.md`

Expected: only documentation files changed, and the layering is obvious from the diff.
