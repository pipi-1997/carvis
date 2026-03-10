import type { Context, Hono } from "hono";
import type { RepositoryBundle, RuntimeConfig, TriggerDefinition } from "@carvis/core";

import { verifyExternalWebhookRequest } from "../services/external-webhook-auth.ts";
import {
  renderExternalWebhookPrompt,
  validateExternalWebhookPayload,
} from "../services/external-webhook-payload.ts";
import { createInputDigest, type createTriggerDispatcher } from "../services/trigger-dispatcher.ts";
import type { createTriggerDefinitionSync } from "../services/trigger-definition-sync.ts";

type ExternalWebhookRouteInput = {
  app: Hono;
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  repositories: RepositoryBundle;
  triggerConfig: RuntimeConfig["triggers"];
  triggerDefinitionSync: ReturnType<typeof createTriggerDefinitionSync>;
  triggerDispatcher: ReturnType<typeof createTriggerDispatcher>;
  now?: () => Date;
};

export function registerExternalWebhookRoute(input: ExternalWebhookRouteInput) {
  const now = input.now ?? (() => new Date());

  input.app.post("/webhooks/external/:slug", async (context) => {
    const slug = context.req.param("slug");
    const rawBody = await context.req.text();
    await input.triggerDefinitionSync.syncDefinitions();

    const runtimeDefinition = input.triggerConfig.webhooks.find((definition) => definition.slug === slug);
    if (!runtimeDefinition) {
      input.logger?.warn("trigger.webhook.rejected", {
        role: "gateway",
        slug,
        reason: "unknown_definition",
      });
      return context.json({
        ok: false,
        status: "rejected",
        reason: "unknown_definition",
      }, 404);
    }

    const definition = await input.repositories.triggerDefinitions.getDefinitionById(runtimeDefinition.id);
    if (!definition || definition.sourceType !== "external_webhook") {
      input.logger?.warn("trigger.webhook.rejected", {
        role: "gateway",
        slug,
        definitionId: runtimeDefinition.id,
        reason: "unknown_definition",
      });
      return context.json({
        ok: false,
        status: "rejected",
        reason: "unknown_definition",
      }, 404);
    }

    return handlePersistedWebhookDefinition(input, context, definition, runtimeDefinition.secret, runtimeDefinition.replayWindowSeconds, rawBody, now);
  });
}

async function handlePersistedWebhookDefinition(
  input: ExternalWebhookRouteInput,
  context: Context,
  definition: TriggerDefinition,
  secret: string,
  replayWindowSeconds: number,
  rawBody: string,
  now: () => Date,
) {
  if (!definition.enabled) {
    const execution = await input.triggerDispatcher.recordRejectedExecution({
      definition,
      reason: "definition_disabled",
      triggeredAt: now().toISOString(),
    });
    input.logger?.warn("trigger.webhook.rejected", {
      role: "gateway",
      slug: definition.slug,
      definitionId: definition.id,
      executionId: execution.id,
      reason: "definition_disabled",
    });
    return context.json({
      ok: false,
      status: "rejected",
      reason: "definition_disabled",
      executionId: execution.id,
    }, 409);
  }

  const verified = verifyExternalWebhookRequest({
    body: rawBody,
    headers: {
      "x-carvis-webhook-signature": context.req.header("x-carvis-webhook-signature"),
      "x-carvis-webhook-timestamp": context.req.header("x-carvis-webhook-timestamp"),
    },
    now,
    replayWindowSeconds,
    secret,
  });

  const triggeredAt = verified.ok
    ? new Date(Number(verified.timestamp) * 1_000).toISOString()
    : now().toISOString();

  if (!verified.ok) {
    const execution = await input.triggerDispatcher.recordRejectedExecution({
      definition,
      reason: verified.reason,
      triggeredAt,
    });
    input.logger?.warn("trigger.webhook.rejected", {
      role: "gateway",
      slug: definition.slug,
      definitionId: definition.id,
      executionId: execution.id,
      reason: verified.reason,
    });
    return context.json({
      ok: false,
      status: "rejected",
      reason: verified.reason,
      executionId: execution.id,
    }, verified.reason === "invalid_signature" ? 401 : 400);
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    const execution = await input.triggerDispatcher.recordRejectedExecution({
      definition,
      reason: "invalid_json",
      triggeredAt,
    });
    return context.json({
      ok: false,
      status: "rejected",
      reason: "invalid_json",
      executionId: execution.id,
    }, 400);
  }

  const validatedPayload = validateExternalWebhookPayload({
    payload,
    requiredFields: definition.requiredFields,
    optionalFields: definition.optionalFields,
  });
  if (!validatedPayload.ok) {
    const execution = await input.triggerDispatcher.recordRejectedExecution({
      definition,
      reason: validatedPayload.reason,
      triggeredAt,
    });
    input.logger?.warn("trigger.webhook.rejected", {
      role: "gateway",
      slug: definition.slug,
      definitionId: definition.id,
      executionId: execution.id,
      reason: validatedPayload.reason,
    });
    return context.json({
      ok: false,
      status: "rejected",
      reason: validatedPayload.reason,
      executionId: execution.id,
    }, 400);
  }

  const prompt = renderExternalWebhookPrompt({
    promptTemplate: definition.promptTemplate,
    variables: validatedPayload.variables,
  });
  const result = await input.triggerDispatcher.dispatchExternalWebhook({
    definition,
    inputDigest: createInputDigest(rawBody),
    prompt,
    triggeredAt,
  });
  input.logger?.info("trigger.webhook.accepted", {
    role: "gateway",
    slug: definition.slug,
    definitionId: definition.id,
    executionId: result.execution.id,
    runId: result.run.id,
  });
  return context.json({
    ok: true,
    status: "accepted",
    slug: definition.slug,
    definitionId: definition.id,
    executionId: result.execution.id,
    runId: result.run.id,
  }, 202);
}

function parsePayload(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
