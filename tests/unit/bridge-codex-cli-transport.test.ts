import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCodexCliTransport } from "../../packages/bridge-codex/src/cli-transport.ts";
import type { RunRequest } from "../../packages/core/src/domain/models.ts";

const baseRequest: RunRequest = {
  id: "run-001",
  sessionId: "session-001",
  agentId: "codex-main",
  workspace: "/tmp/carvis-workspace",
  prompt: "帮我总结仓库目标",
  triggerMessageId: "msg-001",
  triggerUserId: "user-001",
  timeoutSeconds: 60,
  createdAt: "2026-03-08T00:00:00.000Z",
};

describe("createCodexCliTransport", () => {
  const cleanupCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      await cleanupCallbacks.pop()?.();
    }
  });

  test("从 codex jsonl stdout 提取 delta 并在最后返回结果", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    await writeFile(
      codexShim,
      `#!/bin/sh
out_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out_file="$1"
  fi
  shift
done
printf '%s\n' '{"type":"thread.started","thread_id":"thread-001"}'
printf '%s\n' '{"type":"agent_message_delta","delta":"第一段","source":"assistant"}'
printf '%s\n' '{"type":"agent_message_delta","delta":"第二段","source":"assistant"}'
printf '%s' '最终总结' > "$out_file"
`,
    );
    await chmod(codexShim, 0o755);

    const transport = createCodexCliTransport({
      codexCommand: codexShim,
    });

    const chunks = [];
    for await (const chunk of transport.run({
      ...baseRequest,
      workspace: tempDir,
    }, {
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: "delta",
        deltaText: "第一段",
        sequence: 1,
        source: "assistant",
      },
      {
        type: "delta",
        deltaText: "第二段",
        sequence: 2,
        source: "assistant",
      },
      {
        type: "result",
        resultSummary: "最终总结",
        bridgeSessionId: "thread-001",
        sessionOutcome: "created",
      },
    ]);
  });

  test("续聊请求改用 codex exec resume 并保留续聊 session 元数据", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const argsFile = join(tempDir, "args.txt");
    const codexShim = join(tempDir, "codex-shim.sh");
    await writeFile(
      codexShim,
      `#!/bin/sh
printf '%s\n' "$@" > "${argsFile}"
out_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out_file="$1"
  fi
  shift
done
printf '%s\n' '{"type":"thread.started","thread_id":"thread-continued"}'
printf '%s' '续聊总结' > "$out_file"
`,
    );
    await chmod(codexShim, 0o755);

    const transport = createCodexCliTransport({
      codexCommand: codexShim,
    });

    const chunks = [];
    for await (const chunk of transport.run(
      {
        ...baseRequest,
        workspace: tempDir,
        bridgeSessionId: "thread-continued",
        sessionMode: "continuation",
      },
      {
        signal: new AbortController().signal,
      },
    )) {
      chunks.push(chunk);
    }

    const argsText = await Bun.file(argsFile).text();
    expect(argsText).toContain("exec\nresume\n");
    expect(argsText).not.toContain("--color\n");
    expect(argsText).toContain("thread-continued\n帮我总结仓库目标\n");
    expect(chunks.at(-1)).toEqual({
      type: "result",
      resultSummary: "续聊总结",
      bridgeSessionId: "thread-continued",
      sessionOutcome: "continued",
    });
  });

  test("续聊请求如果返回了不同 thread id，则结果标记为 created", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    await writeFile(
      codexShim,
      `#!/bin/sh
out_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out_file="$1"
  fi
  shift
done
printf '%s\n' '{"type":"thread.started","thread_id":"thread-recovered"}'
printf '%s' '恢复后总结' > "$out_file"
`,
    );
    await chmod(codexShim, 0o755);

    const transport = createCodexCliTransport({
      codexCommand: codexShim,
    });

    const chunks = [];
    for await (const chunk of transport.run(
      {
        ...baseRequest,
        workspace: tempDir,
        bridgeSessionId: "thread-stale",
        sessionMode: "continuation",
      },
      {
        signal: new AbortController().signal,
      },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.at(-1)).toEqual({
      type: "result",
      resultSummary: "恢复后总结",
      bridgeSessionId: "thread-recovered",
      sessionOutcome: "created",
    });
  });

  test("workspace 非目录时直接失败而不是退回执行器 cwd", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const workspaceFile = join(tempDir, "workspace.txt");
    const codexShim = join(tempDir, "codex-shim.sh");
    await writeFile(workspaceFile, "not-a-directory");
    await writeFile(
      codexShim,
      `#!/bin/sh
out_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out_file="$1"
  fi
  shift
done
pwd > "$out_file"
`,
    );
    await chmod(codexShim, 0o755);

    const transport = createCodexCliTransport({
      codexCommand: codexShim,
    });

    const chunks = [];
    for await (const chunk of transport.run(
      {
        ...baseRequest,
        workspace: workspaceFile,
      },
      {
        signal: new AbortController().signal,
      },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.at(-1)).toEqual({
      type: "error",
      failureCode: "codex_exec_failed",
      failureMessage: `workspace is not a directory: ${workspaceFile}`,
      sessionInvalid: false,
    });
  });
});
