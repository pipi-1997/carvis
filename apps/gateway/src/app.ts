import type { RuntimeConfig } from "@carvis/core";

import { Hono } from "hono";

import { registerExternalWebhookRoute } from "./routes/external-webhook.ts";
import { createFeishuWebhookHandler } from "./routes/feishu-webhook.ts";
import { registerInternalManagedSchedulesRoutes } from "./routes/internal-managed-schedules.ts";
import { registerInternalRunMediaRoutes } from "./routes/internal-run-media.ts";
import { registerInternalRunToolRoutes } from "./routes/internal-run-tools.ts";
import { registerInternalTriggersRoutes } from "./routes/internal-triggers.ts";
import { createManagedSchedulePresenter } from "./services/managed-schedule-presenter.ts";
import { createMediaDeliveryService } from "./services/media-delivery-service.ts";
import { createRunMediaPresenter } from "./services/run-media-presenter.ts";
import { createRunToolRouter } from "./services/run-tool-router.ts";
import { createScheduleManagementService } from "./services/schedule-management-service.ts";
import { createTriggerDefinitionSync } from "./services/trigger-definition-sync.ts";
import { createTriggerDispatcher } from "./services/trigger-dispatcher.ts";
import { createTriggerStatusPresenter } from "./services/trigger-status-presenter.ts";

type GatewayAppInput = Parameters<typeof createFeishuWebhookHandler>[0] & {
  health?: {
    refresh?(): Promise<void>;
    snapshot(): {
      ok: boolean;
      state: Record<string, unknown>;
    };
  };
  healthPath?: string;
  triggerConfig?: RuntimeConfig["triggers"];
  triggerDispatcher?: ReturnType<typeof createTriggerDispatcher>;
  triggerStatusPresenter?: ReturnType<typeof createTriggerStatusPresenter>;
  managedSchedulePresenter?: ReturnType<typeof createManagedSchedulePresenter>;
  runMediaPresenter?: ReturnType<typeof createRunMediaPresenter>;
  runToolRouter?: ReturnType<typeof createRunToolRouter>;
};

export function createGatewayApp(input: GatewayAppInput) {
  const app = new Hono();
  const handler = createFeishuWebhookHandler(input);
  const triggerConfig = input.triggerConfig ?? {
    scheduledJobs: [],
    webhooks: [],
  };
  const triggerDefinitionSync = createTriggerDefinitionSync({
    config: triggerConfig,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
    now: input.now,
  });
  const triggerDispatcher = input.triggerDispatcher ?? createTriggerDispatcher({
    agentConfig: input.agentConfig,
    queue: input.queue,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
    notifier: input.notifier,
    logger: input.logger,
    now: input.now,
  });
  const triggerStatusPresenter = input.triggerStatusPresenter ?? createTriggerStatusPresenter({
    repositories: input.repositories,
  });
  const scheduleManagementService = createScheduleManagementService({
    repositories: input.repositories,
    now: input.now,
  });
  const mediaDeliveryService = createMediaDeliveryService({
    adapter: input.adapter,
    repositories: input.repositories,
  });
  const managedSchedulePresenter = input.managedSchedulePresenter ?? createManagedSchedulePresenter({
    repositories: input.repositories,
  });
  const runMediaPresenter = input.runMediaPresenter ?? createRunMediaPresenter({
    repositories: input.repositories,
  });
  const runToolRouter = input.runToolRouter ?? createRunToolRouter({
    mediaDeliveryService,
    scheduleManagementService,
    agentId: input.agentConfig.id,
  });
  const healthPath = input.healthPath ?? "/healthz";

  app.post("/webhooks/feishu", async (context) => {
    const rawBody = await context.req.text();
    const result = await handler(rawBody, {
      "x-feishu-request-timestamp": context.req.header("x-feishu-request-timestamp"),
      "x-feishu-signature": context.req.header("x-feishu-signature"),
    });
    return context.json(result.body, result.status as 200 | 202 | 400 | 401 | 403);
  });
  registerExternalWebhookRoute({
    app,
    logger: input.logger,
    repositories: input.repositories,
    triggerConfig,
    triggerDefinitionSync,
    triggerDispatcher,
    now: input.now,
  });
  registerInternalTriggersRoutes({
    app,
    triggerDefinitionSync,
    triggerStatusPresenter,
  });
  registerInternalManagedSchedulesRoutes({
    app,
    presenter: managedSchedulePresenter,
  });
  registerInternalRunMediaRoutes({
    app,
    presenter: runMediaPresenter,
  });
  registerInternalRunToolRoutes({
    app,
    runToolRouter,
  });

  app.get(healthPath, async (context) => {
    await input.health?.refresh?.();
    const snapshot = input.health?.snapshot() ?? { ok: true, state: { ready: true } };
    return context.json(snapshot);
  });

  return app;
}
