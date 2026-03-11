import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureScheduleManagementIpcIgnored } from "../../apps/gateway/src/services/schedule-management-ipc-runtime.ts";

describe("schedule management ipc runtime", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  test("git workspace 会把 carvis-schedule-ipc 写入 .git/info/exclude，且重复调用不追加重复项", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "carvis-ipc-ignore-"));
    cleanup.push(() => rm(workspace, { force: true, recursive: true }));

    await mkdir(join(workspace, ".git", "info"), { recursive: true });
    await writeFile(join(workspace, ".git", "info", "exclude"), "# existing\n");

    await ensureScheduleManagementIpcIgnored(workspace);
    await ensureScheduleManagementIpcIgnored(workspace);

    const exclude = await readFile(join(workspace, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain("carvis-schedule-ipc/");
    expect(exclude.match(/carvis-schedule-ipc\//g)?.length).toBe(1);
  });

  test("worktree 风格 .git 文件也会写入真实 gitdir/info/exclude", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "carvis-ipc-worktree-"));
    const gitDir = await mkdtemp(join(tmpdir(), "carvis-ipc-gitdir-"));
    cleanup.push(() => rm(workspace, { force: true, recursive: true }));
    cleanup.push(() => rm(gitDir, { force: true, recursive: true }));

    await mkdir(join(gitDir, "info"), { recursive: true });
    await writeFile(join(workspace, ".git"), `gitdir: ${gitDir}\n`);

    await ensureScheduleManagementIpcIgnored(workspace);

    const exclude = await readFile(join(gitDir, "info", "exclude"), "utf8");
    expect(exclude).toContain("carvis-schedule-ipc/");
  });
});
