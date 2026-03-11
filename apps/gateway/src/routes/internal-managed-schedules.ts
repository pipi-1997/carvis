import type { Hono } from "hono";

import type { createManagedSchedulePresenter } from "../services/managed-schedule-presenter.ts";

export function registerInternalManagedSchedulesRoutes(input: {
  app: Hono;
  presenter: ReturnType<typeof createManagedSchedulePresenter>;
}) {
  input.app.get("/internal/managed-schedules", async (context) => {
    const workspace = context.req.query("workspace") ?? undefined;
    const [definitions, actions] = await Promise.all([
      input.presenter.listDefinitions(workspace),
      input.presenter.listActions(workspace),
    ]);
    return context.json({
      ok: true,
      definitions,
      actions,
    });
  });
}
