import type { RepositoryBundle } from "@carvis/core";

export function createRunMediaPresenter(input: { repositories: RepositoryBundle }) {
  return {
    async listMediaDeliveries(runId?: string) {
      const mediaDeliveries = await input.repositories.runMediaDeliveries.listMediaDeliveries();
      return mediaDeliveries.filter((delivery) => !runId || delivery.runId === runId);
    },
  };
}
