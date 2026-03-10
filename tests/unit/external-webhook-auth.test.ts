import { createHmac } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { signExternalWebhookBody, verifyExternalWebhookRequest } from "../../apps/gateway/src/services/external-webhook-auth.ts";

describe("external webhook auth", () => {
  test("合法签名与时间戳通过校验", () => {
    const body = JSON.stringify({ summary: "build failed" });
    const timestamp = "1700000000";
    const signature = signExternalWebhookBody({
      body,
      secret: "build-secret",
      timestamp,
    });

    const result = verifyExternalWebhookRequest({
      body,
      headers: {
        "x-carvis-webhook-signature": signature,
        "x-carvis-webhook-timestamp": timestamp,
      },
      now: () => new Date("2023-11-14T22:13:30.000Z"),
      replayWindowSeconds: 60,
      secret: "build-secret",
    });

    expect(result).toEqual({
      ok: true,
      timestamp,
    });
  });

  test("错误签名被拒绝", () => {
    const body = JSON.stringify({ summary: "build failed" });

    const result = verifyExternalWebhookRequest({
      body,
      headers: {
        "x-carvis-webhook-signature": "bad-signature",
        "x-carvis-webhook-timestamp": "1700000000",
      },
      now: () => new Date("2023-11-14T22:13:30.000Z"),
      replayWindowSeconds: 60,
      secret: "build-secret",
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  test("超出 replay window 的请求被拒绝", () => {
    const body = JSON.stringify({ summary: "build failed" });
    const timestamp = "1700000000";
    const signature = signExternalWebhookBody({
      body,
      secret: "build-secret",
      timestamp,
    });

    const result = verifyExternalWebhookRequest({
      body,
      headers: {
        "x-carvis-webhook-signature": signature,
        "x-carvis-webhook-timestamp": timestamp,
      },
      now: () => new Date("2023-11-14T22:20:30.000Z"),
      replayWindowSeconds: 60,
      secret: "build-secret",
    });

    expect(result).toEqual({
      ok: false,
      reason: "timestamp_expired",
    });
  });

  test("签名使用标准 HMAC-SHA256", () => {
    const body = JSON.stringify({ summary: "build failed" });
    const timestamp = "1700000000";

    const signature = signExternalWebhookBody({
      body,
      secret: "build-secret",
      timestamp,
    });

    expect(signature).toBe(
      createHmac("sha256", "build-secret").update(`${timestamp}:${body}`).digest("hex"),
    );
  });
});
