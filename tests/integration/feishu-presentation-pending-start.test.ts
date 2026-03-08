import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("presentation pending_start", () => {
  test("run.queued 持久化 pending_start 呈现且不写入 CardKit 标识", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("请排队执行");
    expect(response.status).toBe(202);

    const run = (await harness.repositories.runs.listRuns())[0];
    const presentation = run ? await harness.repositories.presentations.getPresentationByRunId(run.id) : null;

    expect(presentation?.phase).toBe("pending_start");
    expect(presentation?.streamingMessageId).toBeNull();
    expect(presentation?.streamingCardId).toBeNull();
    expect(presentation?.streamingElementId).toBeNull();
    expect(harness.presentationOperations).toEqual([]);
  });
});
