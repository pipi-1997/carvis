# Docker Managed Local Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace user-supplied Postgres/Redis URLs with Docker-managed local infrastructure so `carvis install` + `carvis onboard` can converge a local instance with only Docker, Codex, and Feishu credentials prepared.

**Architecture:** Keep the daemon-first deployment model. `carvis install` writes install metadata plus Docker Compose assets, `carvis onboard` only writes Feishu/workspace config, and `apps/daemon` reconciles Docker-managed Postgres/Redis before starting `gateway` and `executor`. Layered `status` and `doctor` continue to report install, infra, external dependency, daemon, and runtime state separately.

**Tech Stack:** Bun 1.x, TypeScript 5.x, Docker CLI, Docker Compose, launchd/systemd user services, Hono, PostgreSQL, Redis

---

### Task 1: Refresh Product Contracts For Docker-Managed Infra

**Files:**
- Modify: `README.md`
- Modify: `specs/016-daemon-deployment/spec.md`
- Modify: `specs/016-daemon-deployment/plan.md`
- Modify: `specs/016-daemon-deployment/tasks.md`
- Modify: `specs/016-daemon-deployment/quickstart.md`
- Modify: `docs/reference/reference-cli.md`
- Modify: `docs/runbooks/local-managed-deployment.md`
- Modify: `docs/architecture.md`
- Modify: `AGENTS.md`

**Step 1: Write the failing documentation assertions**

Check that docs still claim users must prepare Postgres/Redis:

Run: `rg -n "Postgres|Redis|POSTGRES_URL|REDIS_URL|docker compose|Docker" README.md specs/016-daemon-deployment docs/reference/reference-cli.md docs/runbooks/local-managed-deployment.md docs/architecture.md AGENTS.md`
Expected: existing docs still mention user-supplied Postgres/Redis or do not mention Docker-managed infra.

**Step 2: Update the docs to the new product boundary**

Document:
- Docker-compatible environment as the only new infra prerequisite
- `carvis install` as Docker preflight + compose asset install + daemon install
- `carvis onboard` no longer asks for `POSTGRES_URL` / `REDIS_URL`
- default uninstall keeps Docker volumes/data

**Step 3: Re-run the documentation assertions**

Run: `rg -n "POSTGRES_URL|REDIS_URL" README.md specs/016-daemon-deployment docs/reference/reference-cli.md docs/runbooks/local-managed-deployment.md docs/architecture.md AGENTS.md`
Expected: operator docs no longer describe DB/cache URLs as onboarding inputs.

**Step 4: Commit**

```bash
git add README.md specs/016-daemon-deployment/spec.md specs/016-daemon-deployment/plan.md specs/016-daemon-deployment/tasks.md specs/016-daemon-deployment/quickstart.md docs/reference/reference-cli.md docs/runbooks/local-managed-deployment.md docs/architecture.md AGENTS.md
git commit -m "docs: switch managed deployment spec to docker infra"
```

### Task 2: Add Docker Install Layout And Preflight

**Files:**
- Create: `packages/carvis-cli/src/docker-engine.ts`
- Modify: `packages/carvis-cli/src/install-layout.ts`
- Modify: `packages/carvis-cli/src/install.ts`
- Modify: `packages/carvis-cli/src/platform-service-manager.ts`
- Test: `tests/unit/carvis-cli-install-layout.test.ts`
- Test: `tests/unit/carvis-cli-platform-service-manager.test.ts`
- Test: `tests/contract/carvis-cli-lifecycle.contract.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- install layout resolves `~/.carvis/infra/docker-compose.yml` and `~/.carvis/infra/.env`
- install fails with stable reason when `docker` or `docker compose` is unavailable
- install manifest records compose asset paths and project name

**Step 2: Run the targeted tests to verify they fail**

Run: `bun test tests/unit/carvis-cli-install-layout.test.ts tests/contract/carvis-cli-lifecycle.contract.test.ts`
Expected: FAIL because Docker layout/preflight behavior does not exist yet.

**Step 3: Write minimal implementation**

Implement:
- `detectDockerEngine()` in `packages/carvis-cli/src/docker-engine.ts`
- install layout fields for `infraDir`, `composeFilePath`, `composeEnvPath`, `composeProjectName`
- `install` writes compose assets and fails early when Docker preflight fails

**Step 4: Run the targeted tests to verify they pass**

Run: `bun test tests/unit/carvis-cli-install-layout.test.ts tests/contract/carvis-cli-lifecycle.contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/carvis-cli/src/docker-engine.ts packages/carvis-cli/src/install-layout.ts packages/carvis-cli/src/install.ts packages/carvis-cli/src/platform-service-manager.ts tests/unit/carvis-cli-install-layout.test.ts tests/unit/carvis-cli-platform-service-manager.test.ts tests/contract/carvis-cli-lifecycle.contract.test.ts
git commit -m "feat: add docker preflight to managed install"
```

### Task 3: Remove User-Supplied Postgres/Redis From Onboarding

**Files:**
- Modify: `packages/carvis-cli/src/onboarding.ts`
- Modify: `packages/carvis-cli/src/config-writer.ts`
- Modify: `packages/carvis-cli/src/prompt-runtime.ts`
- Test: `tests/contract/carvis-cli-onboard.contract.test.ts`
- Test: `tests/integration/carvis-onboard-cli.test.ts`
- Test: `tests/integration/carvis-onboard-feishu-guidance.test.ts`
- Test: `tests/unit/carvis-cli-config-writer.test.ts`

**Step 1: Write the failing tests**

Add assertions that:
- onboarding prompts do not include `postgresUrl` or `redisUrl`
- `runtime.env` after onboarding only contains Feishu secrets until daemon reconcile injects infra URLs
- reuse/modify flows do not reintroduce DB/cache prompts

**Step 2: Run the targeted tests to verify they fail**

Run: `bun test tests/contract/carvis-cli-onboard.contract.test.ts tests/unit/carvis-cli-config-writer.test.ts`
Expected: FAIL because onboarding still asks for DB/cache URLs and config writer still requires them.

**Step 3: Write minimal implementation**

Implement:
- remove `postgresUrl` / `redisUrl` from `OnboardConfigDraft`
- stop prompting for DB/cache URLs in `runOnboarding`
- keep `writeCarvisRuntimeConfig()` responsible only for structured config and external secrets
- preserve existing `runtime.env` values when daemon has already injected managed URLs

**Step 4: Run the targeted tests to verify they pass**

Run: `bun test tests/contract/carvis-cli-onboard.contract.test.ts tests/unit/carvis-cli-config-writer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/carvis-cli/src/onboarding.ts packages/carvis-cli/src/config-writer.ts packages/carvis-cli/src/prompt-runtime.ts tests/contract/carvis-cli-onboard.contract.test.ts tests/integration/carvis-onboard-cli.test.ts tests/integration/carvis-onboard-feishu-guidance.test.ts tests/unit/carvis-cli-config-writer.test.ts
git commit -m "feat: remove db cache urls from onboarding"
```

### Task 4: Implement Docker-Managed Infra In The Daemon

**Files:**
- Modify: `apps/daemon/src/infra-manager.ts`
- Modify: `apps/daemon/src/reconcile.ts`
- Modify: `apps/daemon/src/supervisor.ts`
- Modify: `packages/carvis-cli/src/infra-command.ts`
- Modify: `packages/carvis-cli/src/daemon-command.ts`
- Modify: `packages/carvis-cli/src/daemon-client.ts`
- Test: `tests/integration/carvis-managed-install.test.ts`
- Test: `tests/integration/carvis-layered-status.test.ts`
- Test: `tests/integration/carvis-infra-lifecycle.test.ts`
- Test: `tests/contract/carvis-daemon-supervision.contract.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- daemon `start` runs Docker-managed infra reconcile before runtime start
- `infra status/start/stop/restart/rebuild` maps to stable Docker-backed results
- failed Docker health checks keep runtime stopped and infra marked failed

**Step 2: Run the targeted tests to verify they fail**

Run: `bun test tests/integration/carvis-managed-install.test.ts tests/contract/carvis-daemon-supervision.contract.test.ts`
Expected: FAIL because infra-manager still only probes external URLs.

**Step 3: Write minimal implementation**

Implement:
- Docker command wrapper usage in daemon infra manager
- compose `up/down/ps` lifecycle
- health probes against managed localhost ports
- write managed `POSTGRES_URL` / `REDIS_URL` into `~/.carvis/runtime.env`
- block runtime start until infra is `ready`

**Step 4: Run the targeted tests to verify they pass**

Run: `bun test tests/integration/carvis-managed-install.test.ts tests/contract/carvis-daemon-supervision.contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/daemon/src/infra-manager.ts apps/daemon/src/reconcile.ts apps/daemon/src/supervisor.ts packages/carvis-cli/src/infra-command.ts packages/carvis-cli/src/daemon-command.ts packages/carvis-cli/src/daemon-client.ts tests/integration/carvis-managed-install.test.ts tests/integration/carvis-layered-status.test.ts tests/integration/carvis-infra-lifecycle.test.ts tests/contract/carvis-daemon-supervision.contract.test.ts
git commit -m "feat: manage local infra with docker compose"
```

### Task 5: Update Layered Status, Doctor, And Uninstall

**Files:**
- Modify: `packages/carvis-cli/src/status.ts`
- Modify: `packages/carvis-cli/src/doctor.ts`
- Modify: `packages/carvis-cli/src/output.ts`
- Modify: `packages/carvis-cli/src/uninstall.ts`
- Modify: `packages/core/src/config/runtime-config.ts`
- Modify: `packages/core/src/runtime/local-runtime-state.ts`
- Test: `tests/unit/carvis-cli-status.test.ts`
- Test: `tests/unit/carvis-cli-doctor.test.ts`
- Test: `tests/contract/status-command.contract.test.ts`
- Test: `tests/integration/carvis-uninstall.test.ts`

**Step 1: Write the failing tests**

Add assertions that:
- Docker unavailable is attributed to install/infra, not external dependency
- doctor/status surface Docker-backed infra details
- uninstall default keeps data and purge removes managed infra data

**Step 2: Run the targeted tests to verify they fail**

Run: `bun test tests/unit/carvis-cli-status.test.ts tests/unit/carvis-cli-doctor.test.ts`
Expected: FAIL because status/doctor still assume URL-based infra configuration.

**Step 3: Write minimal implementation**

Implement:
- layered aggregation from install manifest + docker preflight + infra snapshot
- doctor probes for Docker plus managed localhost PG/Redis health
- uninstall default `docker compose down` with data retained
- purge path removes compose assets and managed data directories/volumes

**Step 4: Run the targeted tests to verify they pass**

Run: `bun test tests/unit/carvis-cli-status.test.ts tests/unit/carvis-cli-doctor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/carvis-cli/src/status.ts packages/carvis-cli/src/doctor.ts packages/carvis-cli/src/output.ts packages/carvis-cli/src/uninstall.ts packages/core/src/config/runtime-config.ts packages/core/src/runtime/local-runtime-state.ts tests/unit/carvis-cli-status.test.ts tests/unit/carvis-cli-doctor.test.ts tests/contract/status-command.contract.test.ts tests/integration/carvis-uninstall.test.ts
git commit -m "feat: report docker infra in status and doctor"
```

### Task 6: Run End-To-End Verification And Align The README

**Files:**
- Modify: `README.md`
- Modify: `specs/016-daemon-deployment/quickstart.md`
- Modify: `docs/runbooks/local-managed-deployment.md`

**Step 1: Run end-to-end verification in a temporary HOME**

Run:

```bash
bun run lint
bun test
TMP_HOME="$(mktemp -d)" HOME="$TMP_HOME" bun run --filter @carvis/carvis-cli carvis install --json
TMP_HOME="$(mktemp -d)" HOME="$TMP_HOME" bun run --filter @carvis/carvis-cli carvis onboard --json
TMP_HOME="$(mktemp -d)" HOME="$TMP_HOME" bun run --filter @carvis/carvis-cli carvis status --json
TMP_HOME="$(mktemp -d)" HOME="$TMP_HOME" bun run --filter @carvis/carvis-cli carvis doctor --json
git diff --check -- .
```

Expected:
- lint passes
- tests pass
- install succeeds when Docker is available
- onboard no longer asks for DB/cache URLs
- status/doctor report layered output with Docker-managed infra
- `git diff --check` is clean

**Step 2: Update README and runbook language to match verified behavior**

Document:
- Docker prerequisite
- `codex` + Feishu remain user-provided
- `carvis install` + `carvis onboard` path
- uninstall retention behavior

**Step 3: Commit**

```bash
git add README.md specs/016-daemon-deployment/quickstart.md docs/runbooks/local-managed-deployment.md
git commit -m "docs: align install guide with docker managed infra"
```
