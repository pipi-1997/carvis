import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory run failure visibility", () => {
  test("exposes heartbeat-expired failures without losing workspace-visible memory state", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      heartbeatTtlMs: 10,
    });

    await harness.postFeishuText("需要长时间运行的任务", {
      chat_id: "chat-failure-visibility",
      message_id: "msg-001",
    });
    const running = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    const runId = (await harness.repositories.runs.listRuns()).at(-1)?.id;
    if (!runId) throw new Error("expected active run");
    await harness.waitForHeartbeat(runId);
    harness.advanceTime(20);
    await harness.reaper.reapExpiredRuns();
    await running;

    expect(
      harness.logger.listEntries().some(
        (entry) => entry.message === "workspace.memory.failed" && entry.context?.failureCode === "heartbeat_expired",
      ),
    ).toBe(true);
  });

  test("exposes timeout failures as operator-visible memory failures", async () => {
    const transport: CodexTransport = {
      async *run() {
        yield {
          type: "error",
          failureCode: "timeout",
          failureMessage: "run timed out",
        };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("这轮执行会超时");
    await harness.executor.processNext();

    expect(
      harness.logger.listEntries().some(
        (entry) => entry.message === "workspace.memory.failed" && entry.context?.failureCode === "timeout",
      ),
    ).toBe(true);
  });
});
