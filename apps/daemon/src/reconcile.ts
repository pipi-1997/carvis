import { createStatusService } from "../../../packages/carvis-cli/src/index.ts";

import { createManagedInfraManager } from "./infra-manager.ts";
import { createManagedProcessSupervisor } from "./process-supervisor.ts";

export async function reconcileManagedRuntime(options: {
  env?: Record<string, string | undefined>;
  infraOperation?: "rebuild" | "restart" | "start";
  infraManager?: ReturnType<typeof createManagedInfraManager>;
  processSupervisor?: ReturnType<typeof createManagedProcessSupervisor>;
}) {
  const infraManager = options.infraManager ?? createManagedInfraManager({
    env: options.env,
  });
  const processSupervisor = options.processSupervisor ?? createManagedProcessSupervisor({
    env: options.env,
  });

  const infra = await (
    options.infraOperation === "restart"
      ? infraManager.restart()
      : options.infraOperation === "rebuild"
        ? infraManager.rebuild()
        : infraManager.start()
  );
  const infraReady = infra.postgres.status === "ready" && infra.redis.status === "ready";

  if (infraReady) {
    await processSupervisor.start();
  } else {
    await processSupervisor.stop().catch(() => null);
  }

  return createStatusService({
    env: options.env,
  }).getStatus();
}
