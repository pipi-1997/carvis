import { afterEach, describe, expect, mock, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("Feishu remote media send integration", () => {
  test("活动 run 内可把远端图片发送到当前 session", async () => {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      if (String(input) === "https://example.com/result.png") {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    }) as unknown as typeof fetch;

    const harness = createHarness({
      transportScript: [
        {
          type: "tool_call",
          toolName: "media.send",
          arguments: {
            actionType: "send",
            sourceType: "remote_url",
            url: "https://example.com/result.png",
            mediaKind: "image",
            title: "result",
          },
        },
      ],
    });

    await harness.postFeishuText("把这个图片地址直接发给我");
    await harness.executor.processNext();

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.filter((delivery) => delivery.deliveryKind === "media_image")).toEqual([
      expect.objectContaining({
        deliveryKind: "media_image",
        status: "sent",
      }),
    ]);
    expect(harness.mediaOperations).toEqual([
      expect.objectContaining({
        action: "send-image",
        chatId: "chat-001",
      }),
    ]);
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
      expect.objectContaining({
        sourceType: "remote_url",
        mediaKind: "image",
        status: "sent",
      }),
    ]);
  });
});
