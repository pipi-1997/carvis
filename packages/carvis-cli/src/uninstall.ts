import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

import { createDaemonClient } from "./daemon-client.ts";
import { resolveManagedInstallLayout } from "./install-layout.ts";
import { createPlatformServiceManager } from "./platform-service-manager.ts";

const execFileAsync = promisify(execFile);

export function createUninstallService(options: {
  daemonClient?: ReturnType<typeof createDaemonClient>;
  env?: Record<string, string | undefined>;
  execImpl?: (
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined> },
  ) => Promise<{ stderr: string; stdout: string }>;
  platformServiceManager?: ReturnType<typeof createPlatformServiceManager>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const daemonClient = options.daemonClient ?? createDaemonClient({
    env: options.env,
  });
  const execImpl = options.execImpl ?? execFileAsync;
  const env = options.env ?? process.env;
  const platformServiceManager = options.platformServiceManager ?? createPlatformServiceManager({
    homeDir: options.env?.HOME,
  });

  return {
    async run(input: {
      purge?: boolean;
    } = {}) {
      const removed = ["bundle", "service_definition"];
      await daemonClient.request({
        action: "daemon_stop",
      }).catch(() => null);
      let composeDownError: unknown = null;
      await execImpl("docker", [
        "compose",
        "--project-name",
        layout.composeProjectName,
        "--file",
        layout.composeFilePath,
        "--env-file",
        layout.composeEnvPath,
        "down",
      ], {
        env,
      }).catch((error) => {
        composeDownError = error;
      });

      if (composeDownError) {
        const error = composeDownError;
        return {
          command: "uninstall",
          purge: Boolean(input.purge),
          removed: [],
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
        };
      }
      await rm(layout.currentDir, {
        force: true,
        recursive: true,
      }).catch(() => {});
      await rm(layout.versionsDir, {
        force: true,
        recursive: true,
      }).catch(() => {});
      await rm(layout.installManifestPath, {
        force: true,
      }).catch(() => {});
      await rm(layout.infraDir, {
        force: true,
        recursive: true,
      }).catch(() => {});
      await rm(layout.runDir, {
        force: true,
        recursive: true,
      }).catch(() => {});
      await platformServiceManager.removeDefinition().catch(() => null);

      if (input.purge) {
        await rm(layout.dataDir, {
          force: true,
          recursive: true,
        }).catch(() => {});
        await rm(layout.stateDir, {
          force: true,
          recursive: true,
        }).catch(() => {});
        removed.push("data", "state");
      }

      return {
        command: "uninstall",
        purge: Boolean(input.purge),
        removed,
        status: "completed",
        summary: "carvis uninstalled",
      };
    },
  };
}
