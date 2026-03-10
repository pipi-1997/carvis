import type { Hono } from "hono";

import type { createTriggerDefinitionSync } from "../services/trigger-definition-sync.ts";
import type { createTriggerStatusPresenter } from "../services/trigger-status-presenter.ts";

type InternalTriggersRouteInput = {
  app: Hono;
  triggerDefinitionSync: ReturnType<typeof createTriggerDefinitionSync>;
  triggerStatusPresenter: ReturnType<typeof createTriggerStatusPresenter>;
};

export function registerInternalTriggersRoutes(input: InternalTriggersRouteInput) {
  input.app.get("/internal/triggers/definitions", async (context) => {
    await input.triggerDefinitionSync.syncDefinitions();
    const definitions = await input.triggerStatusPresenter.listDefinitions();
    return context.json({
      ok: true,
      definitions,
    });
  });

  input.app.get("/internal/triggers/definitions/:definitionId", async (context) => {
    await input.triggerDefinitionSync.syncDefinitions();
    const definition = await input.triggerStatusPresenter.getDefinition(context.req.param("definitionId"));
    if (!definition) {
      return context.json({
        ok: false,
        reason: "definition_not_found",
      }, 404);
    }
    return context.json({
      ok: true,
      definition,
    });
  });

  input.app.get("/internal/triggers/definitions/:definitionId/executions", async (context) => {
    const executions = await input.triggerStatusPresenter.listExecutionsByDefinition(context.req.param("definitionId"));
    return context.json({
      ok: true,
      executions,
    });
  });

  input.app.get("/internal/triggers/executions/:executionId", async (context) => {
    const execution = await input.triggerStatusPresenter.getExecution(context.req.param("executionId"));
    if (!execution) {
      return context.json({
        ok: false,
        reason: "execution_not_found",
      }, 404);
    }
    return context.json({
      ok: true,
      execution,
    });
  });
}
