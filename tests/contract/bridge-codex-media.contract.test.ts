import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCodexCliTransport } from "../../packages/bridge-codex/src/cli-transport.ts";
import type { RunRequest } from "../../packages/core/src/domain/models.ts";

const baseRequest: RunRequest = {
  id: "run-001",
  sessionId: "session-001",
  chatId: "chat-001",
  agentId: "codex-main",
  workspace: "/tmp/carvis-workspace",
  prompt: "把图片直接发给我",
  requestedSandboxMode: "workspace-write",
  resolvedSandboxMode: "workspace-write",
  sandboxModeSource: "workspace_default",
  triggerMessageId: "msg-001",
  triggerUserId: "user-001",
  timeoutSeconds: 60,
  createdAt: "2026-03-08T00:00:00.000Z",
};

describe("bridge codex media contract", () => {
  test("普通 run 会为 carvis-media CLI 注入运行时上下文与 PATH", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-media-"));
    try {
      const envFile = join(tempDir, "env.txt");
      const codexShim = join(tempDir, "codex-shim.sh");
      await writeFile(
        codexShim,
        `#!/bin/sh
printf '%s\n' "CARVIS_GATEWAY_BASE_URL=$CARVIS_GATEWAY_BASE_URL" > "${envFile}"
printf '%s\n' "CARVIS_WORKSPACE=$CARVIS_WORKSPACE" >> "${envFile}"
printf '%s\n' "CARVIS_RUN_ID=$CARVIS_RUN_ID" >> "${envFile}"
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
printf '%s' '已发送图片' > "$out_file"
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
      }, {
        signal: new AbortController().signal,
      })) {
        chunks.push(chunk);
      }

      const envText = await Bun.file(envFile).text();
      expect(envText).toContain("CARVIS_GATEWAY_BASE_URL=http://127.0.0.1:8787");
      expect(envText).toContain(`CARVIS_WORKSPACE=${tempDir}`);
      expect(envText).toContain("CARVIS_RUN_ID=run-001");
      expect(envText).toContain("CARVIS_SESSION_ID=session-001");
      expect(envText).toContain("CARVIS_CHAT_ID=chat-001");
      expect(envText).toContain("CARVIS_USER_ID=user-001");
      expect(envText).toContain("CARVIS_REQUESTED_TEXT=把图片直接发给我");
      expect(envText).toContain("packages/carvis-media-cli/bin");
      expect(chunks.at(-1)).toEqual({
        type: "result",
        resultSummary: "已发送图片",
        sessionOutcome: "unchanged",
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
