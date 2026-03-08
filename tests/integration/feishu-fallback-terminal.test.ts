import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("fallback terminal integration", () => {
  test("运行结束后优先把 agent 原始总结收敛到同一张终态卡片", async () => {
    const harness = createHarness({
      transportScript: [{ type: "result", resultSummary: "已完成仓库检查" }],
    });

    await harness.postFeishuText("请检查仓库");
    await harness.executor.processNext();

    const operations = harness.presentationOperations.filter((operation) => operation.action === "complete-card");
    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual(
      expect.objectContaining({
        action: "complete-card",
        body: "已完成仓库检查",
        title: "已完成",
      }),
    );
    expect(harness.presentationOperations.some((operation) => operation.action === "send-fallback-terminal")).toBe(false);

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.map((delivery) => delivery.deliveryKind)).toEqual(["card_create", "card_complete"]);
  });
});
