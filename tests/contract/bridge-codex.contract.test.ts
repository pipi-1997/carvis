import { describe, expect, test } from "bun:test";

import { CodexBridge, createScriptedCodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
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

describe("CodexBridge", () => {
  test("将脚本化 transport 输出映射为摘要和完成事件", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        { type: "summary", summary: "正在分析", sequence: 1 },
        { type: "result", resultSummary: "总结完成" },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun(baseRequest);
    const events = [];
    for await (const event of handle.streamEvents()) {
      events.push(event.eventType);
    }

    expect(events).toEqual(["agent.summary", "run.completed"]);
    expect(await bridge.healthcheck()).toEqual({
      ok: true,
      message: "codex bridge ready",
    });
  });

  test("支持取消当前运行", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        { type: "wait-for-cancel" },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun(baseRequest);
    await bridge.cancelRun(baseRequest.id);

    const events = [];
    for await (const event of handle.streamEvents()) {
      events.push(event.eventType);
    }

    expect(events).toEqual(["run.cancelled"]);
  });
});
