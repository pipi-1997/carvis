import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";

export type ManagedServiceManagerKind = "launchd_user" | "systemd_user" | null;

export type ManagedInstallLayout = CarvisRuntimeFileSet & {
  activeBundlePath: string;
  activeVersionPath: string;
  currentDir: string;
  daemonLogPath: string;
  daemonSocketPath: string;
  dataDir: string;
  installManifestPath: string;
  installRoot: string;
  platform: NodeJS.Platform | string;
  postgresDataDir: string;
  redisDataDir: string;
  runDir: string;
  serviceDefinitionPath: string | null;
  serviceDefinitionsDir: string | null;
  serviceManagerKind: ManagedServiceManagerKind;
  versionsDir: string;
  infraDir: string;
  composeFilePath: string;
  composeEnvPath: string;
  composeProjectName: string;
};

export function resolveManagedInstallLayout(options: {
  homeDir?: string;
  platform?: NodeJS.Platform | string;
} = {}): ManagedInstallLayout {
  const homeDir = options.homeDir ?? homedir();
  const fileSet = resolveCarvisRuntimeFileSet({
    homeDir,
  });
  const platform = options.platform ?? process.platform;
  const serviceManagerKind = resolveServiceManagerKind(platform);
  const currentDir = join(fileSet.configDir, "current");
  const serviceDefinitionsDir = serviceManagerKind === "launchd_user"
    ? join(homeDir, "Library", "LaunchAgents")
    : serviceManagerKind === "systemd_user"
      ? join(homeDir, ".config", "systemd", "user")
      : null;
  const serviceDefinitionPath = serviceManagerKind === "launchd_user"
    ? join(serviceDefinitionsDir!, "com.carvis.daemon.plist")
    : serviceManagerKind === "systemd_user"
      ? join(serviceDefinitionsDir!, "carvis-daemon.service")
      : null;

  return {
    ...fileSet,
    activeBundlePath: currentDir,
    activeVersionPath: join(fileSet.configDir, "active-version"),
    currentDir,
    daemonLogPath: join(fileSet.logsDir, "daemon.log"),
    daemonSocketPath: join(fileSet.configDir, "run", "daemon.sock"),
    dataDir: join(fileSet.configDir, "data"),
    installManifestPath: join(fileSet.configDir, "install-manifest.json"),
    installRoot: fileSet.configDir,
    platform,
    postgresDataDir: join(fileSet.configDir, "data", "postgres"),
    redisDataDir: join(fileSet.configDir, "data", "redis"),
    runDir: join(fileSet.configDir, "run"),
    serviceDefinitionPath,
    serviceDefinitionsDir,
    serviceManagerKind,
    infraDir: join(fileSet.configDir, "infra"),
    composeFilePath: join(fileSet.configDir, "infra", "docker-compose.yml"),
    composeEnvPath: join(fileSet.configDir, "infra", ".env"),
    composeProjectName: "carvis-managed",
    versionsDir: join(fileSet.configDir, "versions"),
  };
}

export function resolveManagedBundlePath(layout: ManagedInstallLayout, version: string) {
  return resolve(layout.versionsDir, version);
}

function resolveServiceManagerKind(platform: NodeJS.Platform | string): ManagedServiceManagerKind {
  if (platform === "darwin") {
    return "launchd_user";
  }
  if (platform === "linux") {
    return "systemd_user";
  }
  return null;
}
