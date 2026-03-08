import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("queued card gating", () => {
  test("排队中的第二个请求在真正开始前不创建过程卡片", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });

    await harness.postFeishuText("第一个请求");
    const firstProcess = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    await harness.postFeishuText("第二个请求", {
      message_id: "msg-002",
      user_id: "user-002",
    });

    const runs = await harness.repositories.runs.listRuns();
    const firstRun = runs.find((run) => run.triggerMessageId === "msg-001");
    const secondRun = runs.find((run) => run.triggerMessageId === "msg-002");
    const secondPresentation = secondRun
      ? await harness.repositories.presentations.getPresentationByRunId(secondRun.id)
      : null;

    expect(secondRun?.status).toBe("queued");
    expect(secondPresentation?.phase).toBe("pending_start");
    expect(secondPresentation?.streamingCardId).toBeNull();
    expect(
      harness.presentationOperations.filter(
        (operation) => "runId" in operation && operation.runId === secondRun?.id,
      ),
    ).toEqual([]);

    if (firstRun) {
      await harness.cancelSignals.requestCancellation(firstRun.id);
    }
    await firstProcess;
  });
});
