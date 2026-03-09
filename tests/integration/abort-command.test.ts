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

  test("会取消当前 session 在非默认 workspace 中的 active run", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });

    await harness.postFeishuText("/bind feature-abort", {
      chat_id: "chat-feature-abort",
      chat_type: "group",
      message_id: "msg-bind",
      user_id: "user-001",
    });
    await harness.postFeishuText("运行 feature workspace 长任务", {
      chat_id: "chat-feature-abort",
      chat_type: "group",
      message_id: "msg-run",
      user_id: "user-001",
    });
    const running = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    const response = await harness.postFeishuText("/abort", {
      chat_id: "chat-feature-abort",
      chat_type: "group",
      message_id: "msg-abort",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    await running;

    const latestRun = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-feature-abort");
    expect(latestRun?.status).toBe("cancelled");
  });

  test("没有 active run 时返回明确提示", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/abort");

    expect(response.status).toBe(200);

    const latestDelivery = (await harness.repositories.deliveries.listDeliveries()).at(-1);
    expect(latestDelivery?.content).toContain("当前没有活动运行");
  });
});
