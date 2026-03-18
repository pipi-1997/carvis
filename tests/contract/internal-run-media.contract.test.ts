import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("internal run media contract", () => {
  test("查询面能返回 media delivery audit 列表", async () => {
    const harness = createHarness();
    await harness.repositories.runMediaDeliveries.createMediaDelivery({
      runId: "run-001",
      sessionId: "session-001",
      chatId: "chat-001",
      sourceType: "local_path",
      sourceRef: "/tmp/result.png",
      mediaKind: "image",
      resolvedFileName: "result.png",
    });

    const response = await harness.getInternalRunMedia(undefined, { runId: "run-001" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mediaDeliveries).toEqual([
      expect.objectContaining({
        runId: "run-001",
        sourceType: "local_path",
        mediaKind: "image",
      }),
    ]);
  });
});
