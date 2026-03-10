import type { OutboundDelivery, RepositoryBundle, Run, TriggerDefinition, TriggerExecution } from "@carvis/core";

type TriggerStatusPresenterInput = {
  repositories: RepositoryBundle;
};

type PresentArgs = {
  definitionId?: string | null;
  executionId?: string | null;
  slug?: string | null;
};

export function createTriggerStatusPresenter(input: TriggerStatusPresenterInput) {
  async function present(args: PresentArgs = {}) {
    const [definitions, executions, runs, deliveries] = await Promise.all([
      input.repositories.triggerDefinitions.listDefinitions(),
      input.repositories.triggerExecutions.listExecutions(),
      input.repositories.runs.listRuns(),
      input.repositories.deliveries.listDeliveries(),
    ]);

    const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
    const runById = new Map(runs.map((run) => [run.id, run]));
    const deliveriesByExecutionId = new Map<string, OutboundDelivery[]>();
    for (const delivery of deliveries) {
      if (!delivery.triggerExecutionId) {
        continue;
      }
      deliveriesByExecutionId.set(
        delivery.triggerExecutionId,
        [...(deliveriesByExecutionId.get(delivery.triggerExecutionId) ?? []), delivery],
      );
    }

    const filteredDefinitions = definitions.filter((definition) => {
      if (args.definitionId && definition.id !== args.definitionId) {
        return false;
      }
      if (args.slug && definition.slug !== args.slug) {
        return false;
      }
      return true;
    });
    const filteredDefinitionIds = new Set(filteredDefinitions.map((definition) => definition.id));
    const filteredExecutions = executions.filter((execution) => {
      if (args.executionId && execution.id !== args.executionId) {
        return false;
      }
      if (filteredDefinitionIds.size > 0 && !filteredDefinitionIds.has(execution.definitionId)) {
        return false;
      }
      if (!args.definitionId && !args.slug) {
        return true;
      }
      return filteredDefinitionIds.has(execution.definitionId);
    });

    return {
      definitions: filteredDefinitions.map((definition) => projectDefinition(definition, filteredExecutions)),
      executions: filteredExecutions.map((execution) =>
        projectExecution(
          execution,
          runById.get(execution.runId ?? ""),
          deliveriesByExecutionId.get(execution.id) ?? [],
          definitionById.get(execution.definitionId) ?? null,
        )
      ),
    };
  }

  return {
    getDefinition: async (definitionId: string) => {
      const payload = await present({ definitionId });
      return payload.definitions[0] ?? null;
    },
    getExecution: async (executionId: string) => {
      const payload = await present({ executionId });
      return payload.executions[0] ?? null;
    },
    listDefinitions: async () => {
      const payload = await present();
      return payload.definitions;
    },
    listExecutionsByDefinition: async (definitionId: string) => {
      const payload = await present({ definitionId });
      return payload.executions;
    },
    present,
  };
}

function projectDefinition(definition: TriggerDefinition, executions: TriggerExecution[]) {
  const relatedExecutions = executions
    .filter((execution) => execution.definitionId === definition.id)
    .sort((left, right) => right.triggeredAt.localeCompare(left.triggeredAt));

  return {
    id: definition.id,
    sourceType: definition.sourceType,
    slug: definition.slug,
    enabled: definition.enabled,
    workspace: definition.workspace,
    agentId: definition.agentId,
    promptTemplate: definition.promptTemplate,
    deliveryTarget: definition.deliveryTarget,
    scheduleExpr: definition.scheduleExpr,
    timezone: definition.timezone,
    nextDueAt: definition.nextDueAt,
    lastTriggeredAt: definition.lastTriggeredAt,
    lastTriggerStatus: definition.lastTriggerStatus,
    recentExecutions: relatedExecutions.slice(0, 10).map((execution) => ({
      id: execution.id,
      status: execution.status,
      triggeredAt: execution.triggeredAt,
      runId: execution.runId,
      rejectionReason: execution.rejectionReason,
      failureCode: execution.failureCode ?? null,
      failureMessage: execution.failureMessage ?? null,
      deliveryStatus: execution.deliveryStatus,
    })),
  };
}

function projectExecution(
  execution: TriggerExecution,
  run: Run | undefined,
  deliveries: OutboundDelivery[],
  definition: TriggerDefinition | null,
) {
  const operatorStatus =
    execution.failureCode === "heartbeat_expired"
      ? "heartbeat_expired"
      : execution.deliveryStatus === "failed"
      ? "delivery_failed"
      : execution.status;

  return {
    id: execution.id,
    definitionId: execution.definitionId,
    sourceType: execution.sourceType,
    status: execution.status,
    operatorStatus,
    triggeredAt: execution.triggeredAt,
    inputDigest: execution.inputDigest,
    runId: execution.runId,
    deliveryStatus: execution.deliveryStatus,
    rejectionReason: execution.rejectionReason,
    failureCode: execution.failureCode ?? null,
    failureMessage: execution.failureMessage ?? null,
    finishedAt: execution.finishedAt,
    definition: definition
      ? {
          id: definition.id,
          slug: definition.slug,
          enabled: definition.enabled,
          nextDueAt: definition.nextDueAt,
          lastTriggeredAt: definition.lastTriggeredAt,
          lastTriggerStatus: definition.lastTriggerStatus,
        }
      : null,
    run: run
      ? {
          id: run.id,
          status: run.status,
          workspace: run.workspace,
          triggerSource: run.triggerSource,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          failureCode: run.failureCode,
          failureMessage: run.failureMessage,
          requestedSessionMode: run.requestedSessionMode,
        }
      : null,
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      chatId: delivery.chatId,
      deliveryKind: delivery.deliveryKind,
      targetRef: delivery.targetRef,
      lastError: delivery.lastError,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    })),
  };
}
