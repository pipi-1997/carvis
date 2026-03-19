import { mkdir } from "node:fs/promises";

import { resolveManagedInstallLayout } from "../../../packages/carvis-cli/src/index.ts";

import { createDaemonSupervisor } from "./supervisor.ts";

export async function bootstrapCarvisDaemon(options: {
  env?: Record<string, string | undefined>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  await mkdir(layout.runDir, { recursive: true });
  await mkdir(layout.logsDir, { recursive: true });

  const supervisor = createDaemonSupervisor({
    env: options.env,
    socketPath: layout.daemonSocketPath,
  });

  return supervisor.start();
}
