# Global MCP/Skill Install Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 007 的 schedule 管理能力从“运行时动态注入 MCP”切换为“全局安装 MCP 与 skill，运行时只传递上下文并做 readiness probe”。

**Architecture:** 新增一个独立的 schedule MCP package，提供可全局注册到宿主 `Codex` 的稳定 server 入口；新增一个独立的 schedule skill package，提供安装到 skill 目录的 `SKILL.md`。`packages/bridge-codex` 移除按 run 动态注册 `mcp_servers.*` 的逻辑，只保留 external-MCP readiness probe 与运行时上下文传递契约。安装与排障流程统一收敛到文档和安装脚本。

**Tech Stack:** Bun 1.x、TypeScript 5.x、Codex CLI、workspace packages、Markdown docs

---

### Task 1: Formalize the global-install architecture

**Files:**
- Modify: `specs/007-agent-managed-scheduling/spec.md`
- Modify: `specs/007-agent-managed-scheduling/plan.md`
- Modify: `specs/007-agent-managed-scheduling/tasks.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbooks/schedule-management.md`

**Step 1: Write the failing doc expectation**

Document that `MCP` and skill are globally installed artifacts, not per-run dynamic registrations.

**Step 2: Verify mismatch exists**

Run: `rg -n "默认 `MCP`|动态|mcp_servers" specs/007-agent-managed-scheduling docs`

Expected: Existing docs still describe run-scoped or default runtime exposure.

**Step 3: Update docs minimally**

Describe:
- global MCP package
- global skill package
- runtime context propagation
- external-MCP readiness probe

**Step 4: Verify docs are consistent**

Run: `rg -n "全局|mcp_servers|CODEX_UNAVAILABLE" specs/007-agent-managed-scheduling docs`

Expected: updated architecture is reflected consistently.
