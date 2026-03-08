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
    for await (const chunk of transport.run(baseRequest, {
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
      },
    ]);
  });
});
