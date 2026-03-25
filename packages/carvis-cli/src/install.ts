import { mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveManagedBundlePath, resolveManagedInstallLayout } from "./install-layout.ts";
import { createPlatformServiceManager } from "./platform-service-manager.ts";
import {
  createDockerEngine,
  DockerCliMissingError,
  DockerComposeMissingError,
  DockerDaemonUnavailableError,
} from "./docker-engine.ts";

type InstallManifest = {
  activeBundlePath: string;
  activeVersion: string;
  installedAt: string;
  installRoot: string;
  lastRepairAt: string | null;
  platform: string;
  serviceDefinitionPath: string | null;
  serviceManager: string | null;
  status: "drifted" | "installed" | "missing" | "partial";
  bundle: {
    checksum: string;
    components: Record<string, { args: string[]; program: string }>;
    bundlePath: string;
    platform: string;
    version: string;
  };
  compose: {
    projectName: string;
    filePath: string;
    envPath: string;
  };
};

export function createInstallService(options: {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  platformServiceManager?: ReturnType<typeof createPlatformServiceManager>;
  version?: string;
  dockerEngine?: ReturnType<typeof createDockerEngine>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const platformServiceManager = options.platformServiceManager ?? createPlatformServiceManager({
    homeDir: options.env?.HOME,
  });
  const now = options.now ?? (() => new Date());
  const version = options.version ?? "dev";
  const dockerEngine = options.dockerEngine ?? createDockerEngine({
    env: options.env,
  });
  const composeInfo = {
    projectName: layout.composeProjectName,
    filePath: layout.composeFilePath,
    envPath: layout.composeEnvPath,
  };

  return {
    async run(input: {
      repair?: boolean;
    } = {}) {
      const preflightError = await (async () => {
        try {
          await dockerEngine.preflight();
          return null;
        } catch (error) {
          if (
            error instanceof DockerCliMissingError
            || error instanceof DockerComposeMissingError
            || error instanceof DockerDaemonUnavailableError
          ) {
            return error;
          }
          throw error;
        }
      })();

      if (preflightError) {
        const summary = preflightError.message;
        return {
          install: {
            status: "failed",
            summary,
            composeFilePath: composeInfo.filePath,
            composeEnvPath: composeInfo.envPath,
            composeProjectName: composeInfo.projectName,
          },
          nextStep: "carvis install",
          status: "failed",
          summary,
        };
      }

      await mkdir(layout.versionsDir, { recursive: true });
      await mkdir(layout.logsDir, { recursive: true });
      await mkdir(layout.stateDir, { recursive: true });
      await mkdir(layout.runDir, { recursive: true });
      await mkdir(layout.dataDir, { recursive: true });
      await mkdir(layout.postgresDataDir, { recursive: true });
      await mkdir(layout.redisDataDir, { recursive: true });
      await mkdir(layout.infraDir, { recursive: true });

      const composeContent = `
version: "3.9"
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: carvis
      POSTGRES_PASSWORD: carvis
      POSTGRES_DB: carvis
    volumes:
      - "${join(layout.dataDir, "postgres")}:/var/lib/postgresql/data"
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - "${join(layout.dataDir, "redis")}:/data"
    ports:
      - "6379:6379"
`;

      await writeFile(layout.composeFilePath, composeContent.trimStart());
      await writeFile(layout.composeEnvPath, `COMPOSE_PROJECT_NAME=${composeInfo.projectName}\n`);

      const bundlePath = resolveManagedBundlePath(layout, version);
      await mkdir(bundlePath, { recursive: true });

      const manifest: InstallManifest = {
        activeBundlePath: bundlePath,
        activeVersion: version,
        bundle: {
          bundlePath,
          checksum: "dev-checksum",
          components: {
            daemon: {
              args: ["--bun", resolve(import.meta.dir, "../../../apps/daemon/src/index.ts")],
              program: process.execPath,
            },
            executor: {
              args: [],
              program: resolve(import.meta.dir, "../../../apps/executor/bin/carvis-executor.cjs"),
            },
            gateway: {
              args: [],
              program: resolve(import.meta.dir, "../../../apps/gateway/bin/carvis-gateway.cjs"),
            },
            postgres: {
              args: [],
              program: "managed-by-carvis",
            },
            redis: {
              args: [],
              program: "managed-by-carvis",
            },
          },
          platform: String(layout.platform),
          version,
        },
        compose: composeInfo,
        installRoot: layout.installRoot,
        installedAt: now().toISOString(),
        lastRepairAt: input.repair ? now().toISOString() : null,
        platform: String(layout.platform),
        serviceDefinitionPath: layout.serviceDefinitionPath,
        serviceManager: layout.serviceManagerKind,
        status: "installed",
      };

      await writeFile(layout.installManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(layout.activeVersionPath, `${version}\n`);
      await ensureCurrentPointer(layout.currentDir, bundlePath);

      let service = await platformServiceManager.getStatus();
      if (service.supported) {
        const installedService = await platformServiceManager.installDefinition({
          args: manifest.bundle.components.daemon.args,
          daemonProgram: manifest.bundle.components.daemon.program,
          env: {
            HOME: options.env?.HOME ?? process.env.HOME,
          },
          logPath: layout.daemonLogPath,
        });
        service = {
          ...installedService,
          supported: true,
        };
      }

      return {
        install: {
          activeBundlePath: bundlePath,
          activeVersion: version,
          serviceDefinitionPath: service.definitionPath,
          status: manifest.status,
          summary: input.repair ? "install repaired" : "install ready",
          composeFilePath: composeInfo.filePath,
          composeEnvPath: composeInfo.envPath,
          composeProjectName: composeInfo.projectName,
        },
        nextStep: "carvis onboard",
        status: manifest.status,
        summary: input.repair ? "install repaired" : "install ready",
      };
    },
    async readManifest() {
      return readJson<InstallManifest>(layout.installManifestPath);
    },
  };
}

async function ensureCurrentPointer(currentDir: string, bundlePath: string) {
  await unlink(currentDir).catch(() => {});
  await symlink(bundlePath, currentDir, "dir").catch(async () => {
    await mkdir(currentDir, { recursive: true });
  });
}

async function readJson<T>(path: string): Promise<T | null> {
  const content = await readFile(path, "utf8").catch(() => null);
  return content ? JSON.parse(content) as T : null;
}
