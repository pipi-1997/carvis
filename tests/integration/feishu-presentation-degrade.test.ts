import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("presentation degrade integration", () => {
  test("过程卡片更新失败后停止卡片链路，且不得补发第二条成功终态消息", async () => {
    const harness = createHarness({
      presentation: {
        failCardUpdate: true,
      },
      transportScript: [
        { type: "delta", deltaText: "正在分析", sequence: 1, source: "assistant" },
        { type: "result", resultSummary: "已完成" },
      ],
    });

    await harness.postFeishuText("请检查仓库");
    await harness.executor.processNext();

    const run = (await harness.repositories.runs.listRuns())[0]!;
    const presentation = await harness.repositories.presentations.getPresentationByRunId(run.id);
    expect(presentation?.phase).toBe("degraded");
    expect(presentation?.degradedReason).toBe("presentation complete failed");
    expect(harness.presentationOperations).toEqual([
      expect.objectContaining({ action: "create-card", runId: run.id }),
    ]);

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(
      deliveries.find((delivery) => delivery.deliveryKind === "card_update")?.status,
    ).toBe("failed");
    expect(deliveries.some((delivery) => delivery.deliveryKind === "fallback_terminal")).toBe(false);
  });

  test("过程卡片创建失败后发送单条终态兜底消息", async () => {
    const harness = createHarness({
      presentation: {
        failCardCreate: true,
      },
      transportScript: [{ type: "result", resultSummary: "已完成" }],
    });

    await harness.postFeishuText("请检查仓库");
    await harness.executor.processNext();

    const run = (await harness.repositories.runs.listRuns())[0]!;
    const presentation = await harness.repositories.presentations.getPresentationByRunId(run.id);
    expect(presentation?.phase).toBe("degraded");
    expect(presentation?.degradedReason).toBe("presentation create failed");
    expect(harness.presentationOperations).toEqual([
      expect.objectContaining({ action: "send-fallback-terminal", runId: run.id }),
    ]);

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(
      deliveries.find((delivery) => delivery.deliveryKind === "fallback_terminal")?.status,
    ).toBe("sent");
  });
});
