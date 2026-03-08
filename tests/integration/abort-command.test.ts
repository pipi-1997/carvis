import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("/abort integration", () => {
  test("取消 active run 并回推取消结果", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });

    await harness.postFeishuText("运行一个长任务");
    const running = harness.executor.processNext();

    const response = await harness.postFeishuText("/abort", {
      message_id: "msg-abort",
    });

    expect(response.status).toBe(200);

    await running;

    const latestRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(latestRun?.status).toBe("cancelled");

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.some((delivery) => delivery.content.includes("已发出取消请求"))).toBe(true);
    expect(deliveries.some((delivery) => delivery.deliveryKind === "card_complete")).toBe(true);
    expect(deliveries.some((delivery) => delivery.deliveryKind === "fallback_terminal")).toBe(false);
    expect(deliveries.at(-1)?.content).toContain("cancel requested");
  });

  test("没有 active run 时返回明确提示", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/abort");

    expect(response.status).toBe(200);

    const latestDelivery = (await harness.repositories.deliveries.listDeliveries()).at(-1);
    expect(latestDelivery?.content).toContain("当前没有活动运行");
  });
});
