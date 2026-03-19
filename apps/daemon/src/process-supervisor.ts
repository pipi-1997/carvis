import { createProcessManager } from "../../../packages/carvis-cli/src/index.ts";

export function createManagedProcessSupervisor(options: {
  env?: Record<string, string | undefined>;
}) {
  if ((options.env?.CARVIS_DAEMON_SKIP_RUNTIME ?? process.env.CARVIS_DAEMON_SKIP_RUNTIME) === "1") {
    return {
      async start() {
        return {
          status: "ready",
          summary: "runtime skipped in daemon test mode",
        };
      },
      async stop() {
        return {
          status: "stopped",
          summary: "runtime stopped",
        };
      },
    };
  }

  const manager = createProcessManager({
    env: options.env,
  });

  return {
    async start() {
      if (!manager.start) {
        return {
          status: "failed",
          summary: "runtime start not supported",
        };
      }
      return manager.start();
    },
    async stop() {
      if (!manager.stop) {
        return {
          status: "failed",
          summary: "runtime stop not supported",
        };
      }
      return manager.stop();
    },
  };
}
