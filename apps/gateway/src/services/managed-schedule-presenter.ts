import type { RepositoryBundle } from "@carvis/core";

export function createManagedSchedulePresenter(input: { repositories: RepositoryBundle }) {
  return {
    async listDefinitions(workspace?: string) {
      const [definitions, actions, executions, runs, deliveries] = await Promise.all([
        input.repositories.triggerDefinitions.listEffectiveDefinitions(),
        input.repositories.scheduleManagementActions.listActions(),
        input.repositories.triggerExecutions.listExecutions(),
        input.repositories.runs.listRuns(),
        input.repositories.deliveries.listDeliveries(),
      ]);

      const runById = new Map(runs.map((run) => [run.id, run]));
      const deliveryByExecutionId = new Map<string, typeof deliveries>();
      for (const delivery of deliveries) {
        if (!delivery.triggerExecutionId) {
          continue;
        }
        deliveryByExecutionId.set(
          delivery.triggerExecutionId,
          [...(deliveryByExecutionId.get(delivery.triggerExecutionId) ?? []), delivery],
        );
      }

      return definitions
        .filter((definition) => !workspace || definition.workspace === workspace)
        .map((definition) => {
          const relatedActions = actions.filter((action) => action.targetDefinitionId === definition.definitionId);
          const latestAction = relatedActions.at(-1) ?? null;
          const relatedExecutions = executions
            .filter((execution) => execution.definitionId === definition.definitionId)
            .sort((left, right) => normalizeTimestamp(right.triggeredAt).localeCompare(normalizeTimestamp(left.triggeredAt)));
          const latestExecution = relatedExecutions[0] ?? null;
          const latestRun = latestExecution?.runId ? runById.get(latestExecution.runId) ?? null : null;
          const latestDeliveries = latestExecution ? deliveryByExecutionId.get(latestExecution.id) ?? [] : [];

          return {
            ...definition,
            lastManagedResult: latestAction?.resolutionStatus ?? null,
            latestAction,
            latestExecution: latestExecution
              ? {
                  ...latestExecution,
                  run: latestRun,
                  deliveries: latestDeliveries,
                }
              : null,
          };
        });
    },
    async listActions(workspace?: string) {
      const actions = await input.repositories.scheduleManagementActions.listActions();
      return actions.filter((action) => !workspace || action.workspace === workspace);
    },
  };
}

function normalizeTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}
