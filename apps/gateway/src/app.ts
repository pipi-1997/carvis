import { Hono } from "hono";

import { createFeishuWebhookHandler } from "./routes/feishu-webhook.ts";

export function createGatewayApp(input: Parameters<typeof createFeishuWebhookHandler>[0]) {
  const app = new Hono();
  const handler = createFeishuWebhookHandler(input);

  app.post("/webhooks/feishu", async (context) => {
    const rawBody = await context.req.text();
    const result = await handler(rawBody, {
      "x-feishu-request-timestamp": context.req.header("x-feishu-request-timestamp"),
      "x-feishu-signature": context.req.header("x-feishu-signature"),
    });
    return context.json(result.body, result.status as 200 | 202 | 400 | 401 | 403);
  });

  app.get("/healthz", (context) => context.json({ ok: true }));

  return app;
}
