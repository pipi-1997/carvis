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
  test("将脚本化 transport 输出映射为 delta、摘要和完成事件", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        { type: "delta", deltaText: "正在", sequence: 1, source: "assistant" },
        { type: "delta", deltaText: "分析", sequence: 2, source: "assistant" },
        { type: "summary", summary: "正在分析", sequence: 1 },
        { type: "result", resultSummary: "总结完成" },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun(baseRequest);
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    for await (const event of handle.streamEvents()) {
      events.push({
        eventType: event.eventType,
        payload: event.payload as Record<string, unknown>,
      });
    }

    expect(events.map((event) => event.eventType)).toEqual([
      "agent.output.delta",
      "agent.output.delta",
      "agent.summary",
      "run.completed",
    ]);
    expect(events[0]?.payload).toEqual({
      delta_text: "正在",
      run_id: "run-001",
      sequence: 1,
      source: "assistant",
    });
    expect(events[1]?.payload).toEqual({
      delta_text: "分析",
      run_id: "run-001",
      sequence: 2,
      source: "assistant",
    });
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
