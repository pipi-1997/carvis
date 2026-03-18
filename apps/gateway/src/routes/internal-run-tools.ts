import type { Hono } from "hono";

import type { MediaToolInvocation, ScheduleToolInvocation } from "@carvis/core";

import type { createRunToolRouter } from "../services/run-tool-router.ts";

export function registerInternalRunToolRoutes(input: {
  app: Hono;
  runToolRouter: ReturnType<typeof createRunToolRouter>;
}) {
  input.app.post("/internal/run-tools/execute", async (context) => {
    const payload = await context.req.json() as {
      runId?: string;
      toolName: string;
      invocation: ScheduleToolInvocation | MediaToolInvocation;
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
    };

    const result = await input.runToolRouter.execute(payload);
    return context.json({
      ok: true,
      result,
    });
  });
}
