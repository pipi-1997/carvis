import { afterEach, describe, expect, mock, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("Feishu media send failures", () => {
  test("远端 URL 获取失败时返回 fetch_failed 并留下 source_failed audit", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const harness = createHarness({
      transportScript: [
        {
          type: "tool_call",
          toolName: "media.send",
          arguments: {
            actionType: "send",
            sourceType: "remote_url",
            url: "https://example.com/missing.png",
            mediaKind: "image",
          },
        },
      ],
    });

    await harness.postFeishuText("把这个图片地址直接发给我");
    await harness.executor.processNext();

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.filter((delivery) => delivery.deliveryKind === "media_image")).toHaveLength(0);
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
      expect.objectContaining({
        sourceType: "remote_url",
        status: "source_failed",
        failureStage: "source",
      }),
    ]);
  });

  test("渠道最终发送失败时返回 delivery_failed 并留下 failed audit", async () => {
    const harness = createHarness({
      delivery: {
        failSendFile: true,
      },
      transportScript: [
        {
          type: "tool_call",
          toolName: "media.send",
          arguments: {
            actionType: "send",
            sourceType: "local_path",
            path: `${process.cwd()}/README.md`,
            mediaKind: "file",
          },
        },
      ],
    });

    await harness.postFeishuText("把文件直接发给我");
    await harness.executor.processNext();

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.filter((delivery) => delivery.deliveryKind === "media_file")).toEqual([
      expect.objectContaining({
        deliveryKind: "media_file",
        status: "failed",
      }),
    ]);
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
      expect.objectContaining({
        mediaKind: "file",
        status: "failed",
        failureStage: "delivery",
      }),
    ]);
  });

  test("渠道上传失败时返回 upload_failed 并留下 upload_failed audit", async () => {
    const harness = createHarness({
      delivery: {
        failUploadFile: true,
      },
      transportScript: [
        {
          type: "tool_call",
          toolName: "media.send",
          arguments: {
            actionType: "send",
            sourceType: "local_path",
            path: `${process.cwd()}/README.md`,
            mediaKind: "file",
          },
        },
      ],
    });

    await harness.postFeishuText("把文件直接发给我");
    await harness.executor.processNext();

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.filter((delivery) => delivery.deliveryKind === "media_file")).toHaveLength(0);
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
      expect.objectContaining({
        mediaKind: "file",
        status: "upload_failed",
        failureStage: "upload",
      }),
    ]);
  });
});
