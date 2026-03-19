import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { resolveManagedInstallLayout, type ManagedServiceManagerKind } from "./install-layout.ts";

export type ServiceDefinitionInstallResult = {
  definitionPath: string;
  enabled: boolean;
  kind: Exclude<ManagedServiceManagerKind, null>;
  loaded: boolean;
  unitNameOrLabel: string;
};

export function createPlatformServiceManager(options: {
  homeDir?: string;
  platform?: NodeJS.Platform | string;
  removeFileImpl?: typeof rm;
  statImpl?: typeof stat;
  mkdirImpl?: typeof mkdir;
  writeFileImpl?: (path: string, content: string) => Promise<void>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.homeDir,
    platform: options.platform,
  });
  const mkdirImpl = options.mkdirImpl ?? mkdir;
  const removeFileImpl = options.removeFileImpl ?? rm;
  const statImpl = options.statImpl ?? stat;
  const writeFileImpl = options.writeFileImpl ?? (async (path: string, content: string) => {
    await writeFile(path, content);
  });

  return {
    async getStatus() {
      if (!layout.serviceManagerKind || !layout.serviceDefinitionPath) {
        return {
          definitionPath: null,
          enabled: false,
          kind: null,
          loaded: false,
          supported: false,
          unitNameOrLabel: null,
        };
      }
      const exists = await statImpl(layout.serviceDefinitionPath).then(() => true).catch(() => false);
      return {
        definitionPath: layout.serviceDefinitionPath,
        enabled: exists,
        kind: layout.serviceManagerKind,
        loaded: false,
        supported: true,
        unitNameOrLabel: layout.serviceManagerKind === "launchd_user" ? "com.carvis.daemon" : "carvis-daemon.service",
      };
    },
    async installDefinition(input: {
      args?: string[];
      daemonProgram: string;
      env?: Record<string, string | undefined>;
      label?: string;
      logPath: string;
    }): Promise<ServiceDefinitionInstallResult> {
      if (!layout.serviceManagerKind || !layout.serviceDefinitionPath) {
        throw new Error(`unsupported platform: ${layout.platform}`);
      }

      const label = input.label
        ?? (layout.serviceManagerKind === "launchd_user" ? "com.carvis.daemon" : "carvis-daemon.service");
      const content = layout.serviceManagerKind === "launchd_user"
        ? renderLaunchdDefinition({
            env: input.env,
            label,
            logPath: input.logPath,
            program: input.daemonProgram,
            programArguments: input.args ?? [],
          })
        : renderSystemdDefinition({
            env: input.env,
            logPath: input.logPath,
            program: input.daemonProgram,
            programArguments: input.args ?? [],
          });

      await mkdirImpl(dirname(layout.serviceDefinitionPath), {
        recursive: true,
      });
      await writeFileImpl(layout.serviceDefinitionPath, `${content}\n`);

      return {
        definitionPath: layout.serviceDefinitionPath,
        enabled: true,
        kind: layout.serviceManagerKind,
        loaded: false,
        unitNameOrLabel: label,
      };
    },
    async removeDefinition() {
      if (!layout.serviceDefinitionPath) {
        return {
          removed: false,
          supported: false,
        };
      }
      await removeFileImpl(layout.serviceDefinitionPath, {
        force: true,
      });
      return {
        removed: true,
        supported: true,
      };
    },
  };
}

function renderLaunchdDefinition(input: {
  env?: Record<string, string | undefined>;
  label: string;
  logPath: string;
  program: string;
  programArguments: string[];
}) {
  const envEntries = Object.entries(input.env ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  const programArguments = [input.program, ...input.programArguments]
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join("\n");
  const environmentVariables = envEntries.length === 0
    ? ""
    : [
        "  <key>EnvironmentVariables</key>",
        "  <dict>",
        ...envEntries.flatMap(([key, value]) => [
          `    <key>${escapeXml(key)}</key>`,
          `    <string>${escapeXml(value)}</string>`,
        ]),
        "  </dict>",
      ].join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(input.label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    programArguments,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>StandardOutPath</key>",
    `  <string>${escapeXml(input.logPath)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${escapeXml(input.logPath)}</string>`,
    environmentVariables,
    "</dict>",
    "</plist>",
  ].filter(Boolean).join("\n");
}

function renderSystemdDefinition(input: {
  env?: Record<string, string | undefined>;
  logPath: string;
  program: string;
  programArguments: string[];
}) {
  const environment = Object.entries(input.env ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `Environment="${key}=${escapeSystemd(value)}"`);

  return [
    "[Unit]",
    "Description=Carvis daemon",
    "",
    "[Service]",
    `ExecStart=${[input.program, ...input.programArguments].map(escapeSystemd).join(" ")}`,
    `StandardOutput=append:${input.logPath}`,
    `StandardError=append:${input.logPath}`,
    "Restart=always",
    ...environment,
    "",
    "[Install]",
    "WantedBy=default.target",
  ].join("\n");
}

function escapeSystemd(value: string) {
  return value.replaceAll("\"", "\\\"");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
