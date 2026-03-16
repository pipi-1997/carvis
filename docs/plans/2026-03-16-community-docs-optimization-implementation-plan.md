# Community Docs Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the repository docs from a basic project description set into a layered documentation system with clearer entrypoints, references, and task flows.

**Architecture:** Keep the current implementation docs and historical design artifacts, but reorganize user-facing content into five layers: README, guides, reference, runbooks, and archives. Reuse the existing architecture and runbook content while moving stable command/config facts into dedicated reference pages.

**Tech Stack:** Markdown, existing `docs/`, Bun workspace command surface

---

### Task 1: Record the optimization design

**Files:**

- Create: `docs/plans/2026-03-16-community-docs-optimization-design.md`
- Create: `docs/plans/2026-03-16-community-docs-optimization-implementation-plan.md`

**Step 1: Write the design doc**

Capture:

- why the current docs are still below “community-quality” standards
- the five-layer model: README / guides / reference / runbooks / archives
- the intended role of each document family

**Step 2: Review the design doc**

Run: `sed -n '1,260p' docs/plans/2026-03-16-community-docs-optimization-design.md`

Expected: the design explicitly separates entry docs from archives.

### Task 2: Rebuild the README as a true homepage

**Files:**

- Modify: `README.md`
- Reference: `docs/index.md`
- Reference: `docs/guides/operator-handbook.md`
- Reference: `docs/architecture.md`

**Step 1: Rewrite the README**

Restructure it around:

- value proposition
- who it is for
- installation
- get started
- benefits
- role-based path selection
- current scope

**Step 2: Review the README**

Run: `sed -n '1,260p' README.md`

Expected: the page reads like a homepage, not like an implementation dump.

### Task 3: Turn docs index into a routing page

**Files:**

- Modify: `docs/index.md`
- Create: `docs/guides/developer-onboarding.md`

**Step 1: Rewrite `docs/index.md`**

It should route readers to:

- guides
- reference
- architecture
- runbooks
- archives

**Step 2: Create a developer onboarding guide**

Cover:

- system map
- boundaries
- core concepts
- test layers
- reading order

**Step 3: Review both docs**

Run: `sed -n '1,260p' docs/index.md`

Run: `sed -n '1,320p' docs/guides/developer-onboarding.md`

Expected: `docs/index.md` becomes shorter and more navigational; developer detail moves to the guide.

### Task 4: Introduce a reference layer

**Files:**

- Create: `docs/reference/reference-cli.md`
- Create: `docs/reference/reference-chat-commands.md`
- Create: `docs/reference/reference-config.md`

**Step 1: Add CLI reference**

Document:

- supported commands
- expected invocation style inside this repo
- TTY / `--json` behavior
- human output vs JSON output

**Step 2: Add chat command reference**

Document:

- `/help`
- `/bind`
- `/status`
- `/mode`
- `/new`
- `/abort`

**Step 3: Add config reference**

Document:

- `~/.carvis/config.json`
- `~/.carvis/runtime.env`
- `~/.carvis/state/*.json`
- `~/.carvis/logs/*`

### Task 5: Rework operator docs into task flow

**Files:**

- Modify: `docs/guides/operator-handbook.md`
- Modify: `docs/runbooks/local-runtime-cli.md`
- Modify: `docs/runbooks/schedule-management.md`

**Step 1: Rewrite operator handbook**

Restructure around:

- before you begin
- first-time setup
- daily operations
- reconfiguration
- health and readiness
- troubleshooting matrix
- specialized docs

**Step 2: Simplify the local runtime runbook**

Keep it as:

- quick reference
- jump links
- compact high-priority reminders

**Step 3: Tighten the schedule runbook**

Clarify:

- what is a Codex-session path vs manual shell debugging
- when `carvis-schedule` can be run directly
- what extra context is needed outside the normal agent path

### Task 6: Verify formatting and navigation

**Files:**

- Verify: `README.md`
- Verify: `docs/index.md`
- Verify: `docs/guides/operator-handbook.md`
- Verify: `docs/guides/developer-onboarding.md`
- Verify: `docs/reference/reference-cli.md`
- Verify: `docs/reference/reference-chat-commands.md`
- Verify: `docs/reference/reference-config.md`
- Verify: `docs/runbooks/local-runtime-cli.md`
- Verify: `docs/runbooks/schedule-management.md`

**Step 1: Run markdown formatting**

Run: `bunx prettier --check README.md docs/index.md docs/guides/operator-handbook.md docs/guides/developer-onboarding.md docs/reference/reference-cli.md docs/reference/reference-chat-commands.md docs/reference/reference-config.md docs/runbooks/local-runtime-cli.md docs/runbooks/schedule-management.md docs/plans/2026-03-16-community-docs-optimization-design.md docs/plans/2026-03-16-community-docs-optimization-implementation-plan.md`

Expected: all files use the same Markdown style.

**Step 2: Check main links**

Run: `rg -n "guides/|reference/|runbooks/|architecture|AGENTS|README" README.md docs/index.md docs/guides docs/reference docs/runbooks`

Expected: entry docs clearly route to the new structure.
