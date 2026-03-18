import type { Hono } from "hono";

import type { createRunMediaPresenter } from "../services/run-media-presenter.ts";

export function registerInternalRunMediaRoutes(input: {
  app: Hono;
  presenter: ReturnType<typeof createRunMediaPresenter>;
}) {
  input.app.get("/internal/run-media", async (context) => {
    const runId = context.req.query("runId") ?? undefined;
    const mediaDeliveries = await input.presenter.listMediaDeliveries(runId);
    return context.json({
      ok: true,
      mediaDeliveries,
    });
  });
}
