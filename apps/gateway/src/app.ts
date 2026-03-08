import { Hono } from "hono";

import { createFeishuWebhookHandler } from "./routes/feishu-webhook.ts";

type GatewayAppInput = Parameters<typeof createFeishuWebhookHandler>[0] & {
  health?: {
    refresh?(): Promise<void>;
    snapshot(): {
      ok: boolean;
      state: Record<string, unknown>;
    };
  };
  healthPath?: string;
};

export function createGatewayApp(input: GatewayAppInput) {
  const app = new Hono();
  const handler = createFeishuWebhookHandler(input);
  const healthPath = input.healthPath ?? "/healthz";

  app.post("/webhooks/feishu", async (context) => {
    const rawBody = await context.req.text();
    const result = await handler(rawBody, {
      "x-feishu-request-timestamp": context.req.header("x-feishu-request-timestamp"),
      "x-feishu-signature": context.req.header("x-feishu-signature"),
    });
    return context.json(result.body, result.status as 200 | 202 | 400 | 401 | 403);
  });

  app.get(healthPath, async (context) => {
    await input.health?.refresh?.();
    const snapshot = input.health?.snapshot() ?? { ok: true, state: { ready: true } };
    return context.json(snapshot);
  });

  return app;
}
