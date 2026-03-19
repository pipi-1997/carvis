import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codexCliHealthcheck, createCodexCliTransport } from "../../packages/bridge-codex/src/cli-transport.ts";
import type { RunRequest } from "../../packages/core/src/domain/models.ts";

const baseRequest: RunRequest = {
  id: "run-001",
  sessionId: "session-001",
  agentId: "codex-main",
  workspace: "/tmp/carvis-workspace",
  prompt: "帮我总结仓库目标",
  requestedSandboxMode: "workspace-write",
  resolvedSandboxMode: "workspace-write",
  sandboxModeSource: "workspace_default",
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
    expect(argsText).toContain("exec\n--sandbox\nworkspace-write\nresume\n");
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

  test("danger-full-access run 会透传对应 sandbox 参数", async () => {
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
printf '%s' 'danger 模式总结' > "$out_file"
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
        requestedSandboxMode: "danger-full-access",
        resolvedSandboxMode: "danger-full-access",
      },
      {
        signal: new AbortController().signal,
      },
    )) {
      chunks.push(chunk);
    }

    const argsText = await Bun.file(argsFile).text();
    expect(argsText).toContain("exec\n--sandbox\ndanger-full-access\n--json\n--color\nnever\n");
    expect(chunks.at(-1)).toEqual({
      type: "result",
      resultSummary: "danger 模式总结",
      sessionOutcome: "unchanged",
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

  test("普通 run 会为 carvis-schedule CLI 注入运行时上下文与 PATH", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const argsFile = join(tempDir, "args.txt");
    const envFile = join(tempDir, "env.txt");
    const codexShim = join(tempDir, "codex-shim.sh");
    await writeFile(
      codexShim,
      `#!/bin/sh
printf '%s\n' "$@" > "${argsFile}"
printf '%s\n' "CARVIS_GATEWAY_BASE_URL=$CARVIS_GATEWAY_BASE_URL" > "${envFile}"
printf '%s\n' "CARVIS_WORKSPACE=$CARVIS_WORKSPACE" >> "${envFile}"
printf '%s\n' "CARVIS_SESSION_ID=$CARVIS_SESSION_ID" >> "${envFile}"
printf '%s\n' "CARVIS_CHAT_ID=$CARVIS_CHAT_ID" >> "${envFile}"
printf '%s\n' "CARVIS_USER_ID=$CARVIS_USER_ID" >> "${envFile}"
printf '%s\n' "CARVIS_REQUESTED_TEXT=$CARVIS_REQUESTED_TEXT" >> "${envFile}"
printf '%s\n' "PATH=$PATH" >> "${envFile}"
out_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out_file="$1"
  fi
  shift
done
printf '%s' '已创建日报' > "$out_file"
`,
    );
    await chmod(codexShim, 0o755);

    const transport = createCodexCliTransport({
      codexCommand: codexShim,
      gatewayBaseUrl: "http://127.0.0.1:8787",
    });

    const chunks = [];
    for await (const chunk of transport.run({
      ...baseRequest,
      workspace: tempDir,
      prompt: "Use the local carvis-schedule CLI to manage schedules.",
      chatId: "chat-001",
    }, {
      signal: new AbortController().signal,
    })) {
      chunks.push(chunk);
    }

    const argsText = await Bun.file(argsFile).text();
    const envText = await Bun.file(envFile).text();
    expect(argsText).toContain("exec\n--sandbox\nworkspace-write\n--json\n--color\nnever\n");
    expect(argsText).not.toContain("mcp_servers.");
    expect(argsText).not.toContain("--enable\nplugins\n");
    expect(envText).toContain("CARVIS_GATEWAY_BASE_URL=http://127.0.0.1:8787");
    expect(envText).toContain(`CARVIS_WORKSPACE=${tempDir}`);
    expect(envText).toContain("CARVIS_SESSION_ID=session-001");
    expect(envText).toContain("CARVIS_CHAT_ID=chat-001");
    expect(envText).toContain("CARVIS_USER_ID=user-001");
    expect(envText).toContain("CARVIS_REQUESTED_TEXT=Use the local carvis-schedule CLI to manage schedules.");
    expect(envText).toContain("packages/carvis-schedule-cli/bin");
    expect(chunks.at(-1)).toEqual({
      type: "result",
      resultSummary: "已创建日报",
      sessionOutcome: "unchanged",
    });
  });

  test("healthcheck 会同时探测 codex、carvis-schedule 与 carvis-media CLI 可执行性", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-health-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    const scheduleShim = join(tempDir, "carvis-schedule");
    const mediaShim = join(tempDir, "carvis-media");
    await writeFile(
      codexShim,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\n' 'codex-cli test'
  exit 0
fi
exit 0
`,
    );
    await chmod(codexShim, 0o755);
    await writeFile(
      scheduleShim,
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  printf '%s\n' 'carvis-schedule help'
  exit 0
fi
exit 1
`,
    );
    await chmod(scheduleShim, 0o755);
    await writeFile(
      mediaShim,
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  printf '%s\n' 'carvis-media help'
  exit 0
fi
exit 1
`,
    );
    await chmod(mediaShim, 0o755);

    await expect(
      codexCliHealthcheck({
        codexCommand: codexShim,
        scheduleCommand: scheduleShim,
        mediaCommand: mediaShim,
        workspace: tempDir,
      }),
    ).resolves.toEqual({
      ok: true,
      message: "codex cli ready",
    });
  }, 10_000);

  test("healthcheck 在 carvis-schedule 不可执行时失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-health-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    const scheduleShim = join(tempDir, "carvis-schedule");
    const mediaShim = join(tempDir, "carvis-media");
    await writeFile(
      codexShim,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\n' 'codex-cli test'
  exit 0
fi
exit 0
`,
    );
    await chmod(codexShim, 0o755);
    await writeFile(
      scheduleShim,
      `#!/bin/sh
exit 1
`,
    );
    await chmod(scheduleShim, 0o755);
    await writeFile(
      mediaShim,
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  exit 0
fi
exit 1
`,
    );
    await chmod(mediaShim, 0o755);

    await expect(
      codexCliHealthcheck({
        codexCommand: codexShim,
        scheduleCommand: scheduleShim,
        mediaCommand: mediaShim,
        workspace: tempDir,
      }),
    ).rejects.toThrow("carvis-schedule unavailable");
  });

  test("healthcheck 在 carvis-media 不可执行时失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-health-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    const scheduleShim = join(tempDir, "carvis-schedule");
    const mediaShim = join(tempDir, "carvis-media");
    await writeFile(
      codexShim,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '%s\n' 'codex-cli test'
  exit 0
fi
exit 0
`,
    );
    await chmod(codexShim, 0o755);
    await writeFile(
      scheduleShim,
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  exit 0
fi
exit 1
`,
    );
    await chmod(scheduleShim, 0o755);
    await writeFile(
      mediaShim,
      `#!/bin/sh
exit 1
`,
    );
    await chmod(mediaShim, 0o755);

    await expect(
      codexCliHealthcheck({
        codexCommand: codexShim,
        scheduleCommand: scheduleShim,
        mediaCommand: mediaShim,
        workspace: tempDir,
      }),
    ).rejects.toThrow("carvis-media unavailable");
  });

  test("healthcheck 在 codex 不可执行时失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-cli-health-"));
    cleanupCallbacks.push(() => rm(tempDir, { force: true, recursive: true }));

    const codexShim = join(tempDir, "codex-shim.sh");
    const scheduleShim = join(tempDir, "carvis-schedule");
    await writeFile(
      codexShim,
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  exit 1
fi
exit 0
`,
    );
    await chmod(codexShim, 0o755);
    await writeFile(
      scheduleShim,
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  exit 0
fi
exit 1
`,
    );
    await chmod(scheduleShim, 0o755);

    await expect(
      codexCliHealthcheck({
        codexCommand: codexShim,
        scheduleCommand: scheduleShim,
        mediaCommand: scheduleShim,
        workspace: tempDir,
      }),
    ).rejects.toThrow("codex");
  });
});
