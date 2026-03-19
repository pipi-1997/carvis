import { stat } from "node:fs/promises";

import { parseCarvisCommand } from "./command-parser.ts";
import { createDaemonCommandService } from "./daemon-command.ts";
import { createConfigureService, runConfigure } from "./configure.ts";
import { createDoctorService } from "./doctor.ts";
import { createInfraCommandService } from "./infra-command.ts";
import { createInstallService } from "./install.ts";
import { resolveManagedInstallLayout } from "./install-layout.ts";
import { runOnboarding, type OnboardingPrompter, type ProbeFeishuCredentials } from "./onboarding.ts";
import { renderHumanResult } from "./output.ts";
import { createProcessManager } from "./process-manager.ts";
import { createStatusService } from "./status.ts";
import { createUninstallService } from "./uninstall.ts";
import type { PromptFlow } from "./prompt-runtime.ts";

export { parseCarvisCommand } from "./command-parser.ts";
export { createDaemonCommandService } from "./daemon-command.ts";
export { createConfigureService, runConfigure } from "./configure.ts";
export {
  resolveCarvisRuntimeFileSet,
  writeCarvisRuntimeConfig,
  type CarvisRuntimeFileSet,
  type OnboardConfigDraft,
} from "./config-writer.ts";
export { createInfraCommandService } from "./infra-command.ts";
export { createInstallService } from "./install.ts";
export { resolveManagedInstallLayout, resolveManagedBundlePath, type ManagedInstallLayout } from "./install-layout.ts";
export {
  createCarvisStateStore,
  type LocalRuntimeProcessState,
  type LocalRuntimeRole,
} from "./state-store.ts";
export { createProcessManager } from "./process-manager.ts";
export { createDoctorService, summarizeDoctorChecks, type DoctorCheck } from "./doctor.ts";
export { runOnboarding, type OnboardingPrompter, type OnboardingResult, type ProbeFeishuCredentials } from "./onboarding.ts";
export { createStatusService, summarizeRuntimeStatus, type RuntimeStatusSummary } from "./status.ts";
export { createUninstallService } from "./uninstall.ts";

export async function runCarvisCli(
  argv: string[],
  input?: {
    configurePrompter?: OnboardingPrompter;
    configureService?: {
      run(section: "feishu" | "workspace"): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    cwd?: string;
    daemonCommandService?: {
      run(input: {
        operation: "restart" | "start" | "status" | "stop";
      }): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    doctorService?: {
      run(): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    env?: Record<string, string | undefined>;
    infraCommandService?: {
      run(input: {
        operation: "rebuild" | "restart" | "start" | "status" | "stop";
      }): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    installService?: {
      run(input?: {
        repair?: boolean;
      }): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    onboardingPrompter?: OnboardingPrompter;
    probeFeishuCredentials?: ProbeFeishuCredentials;
    processManager?: {
      start?(): Promise<{
        [key: string]: unknown;
        status: "failed" | "ready";
        summary: string;
      }>;
      stop?(): Promise<{
        [key: string]: unknown;
        status: "failed" | "partial" | "stopped";
        summary: string;
      }>;
    };
    processManagerOptions?: Parameters<typeof createProcessManager>[0];
    statusService?: {
      getStatus(): Promise<Record<string, unknown>>;
    };
    stdinIsTTY?: boolean;
    stdoutIsTTY?: boolean;
    uninstallService?: {
      run(input?: {
        purge?: boolean;
      }): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    stderr?(text: string): void;
    stdout?(text: string): void;
  },
): Promise<number> {
  const runtimeOptions = parseCliRuntimeOptions(argv);
  const stdoutIsTTY = input?.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  const stdinIsTTY = input?.stdinIsTTY ?? process.stdin.isTTY ?? false;
  const outputMode = runtimeOptions.outputMode ?? (stdoutIsTTY ? "human" : "json");
  const stdout = input?.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = input?.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));
  const positionalArgv = runtimeOptions.positionalArgv;

  if (positionalArgv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    stdout(buildHelpText());
    return 0;
  }

  const parsed = parseCarvisCommand(positionalArgv);
  if (!parsed.ok) {
    stderr(parsed.result.summary);
    return 3;
  }

  const emit = (command: "configure" | "daemon" | "doctor" | "infra" | "install" | "onboard" | "start" | "status" | "stop" | "uninstall", payload: Record<string, unknown>) => {
    if (outputMode === "json") {
      stdout(JSON.stringify(payload));
      return;
    }
    const rendered = renderHumanResult(command, payload);
    if (rendered.length > 0) {
      stdout(rendered);
    }
  };

  if ((parsed.command.action === "onboard" || parsed.command.action === "configure")
    && !input?.onboardingPrompter
    && !input?.configurePrompter
    && !input?.configureService
    && !stdinIsTTY) {
    stderr("当前不是交互式终端；请使用 TTY 运行，或显式提供非交互参数。");
    return 3;
  }

  if (parsed.command.action === "install") {
    const installService = input?.installService ?? createInstallService({
      env: input?.env,
    });
    const result = await installService.run({
      repair: parsed.command.repair,
    });
    emit("install", {
      command: "install",
      ...result,
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "onboard") {
    const onboarding = await runOnboarding({
      cwd: input?.cwd,
      env: input?.env,
      flow: runtimeOptions.flow,
      probeFeishuCredentials: input?.probeFeishuCredentials,
      prompter: input?.onboardingPrompter,
      yes: runtimeOptions.yes,
    });

    if (onboarding.status === "failed") {
      emit("onboard", {
        command: "onboard",
        reason: onboarding.reason,
        status: onboarding.status,
        summary: onboarding.summary,
      });
      return 3;
    }

    if (onboarding.status === "cancelled") {
      emit("onboard", {
        command: "onboard",
        status: onboarding.status,
        summary: onboarding.summary,
      });
      return 2;
    }

    const installLayout = resolveManagedInstallLayout({
      homeDir: input?.env?.HOME,
    });
    const hasInstallManifest = await stat(installLayout.installManifestPath).then(() => true).catch(() => false);

    const result = input?.daemonCommandService
      ? await input.daemonCommandService.run({
          operation: "start",
        })
      : hasInstallManifest
        ? await createDaemonCommandService({
            env: input?.env,
          }).run({
            operation: "start",
          })
        : input?.processManager
          ? await (async () => {
              if (!input.processManager?.start) {
                return {
                  reason: "not_supported",
                  status: "failed",
                  summary: "start not supported",
                };
              }
              return input.processManager.start();
            })()
          : {
              reason: "not_installed",
              status: "failed",
              summary: "carvis install is required before onboard",
            };
    if (result.status === "failed") {
      emit("onboard", {
        command: "onboard",
        reason: result.reason,
        status: result.status,
        summary: result.summary,
      });
      return 4;
    }
    emit("onboard", {
      command: "onboard",
      status: result.status,
      summary: result.summary,
    });
    return 0;
  }

  if (parsed.command.action === "start") {
    const result = input?.daemonCommandService
      ? await input.daemonCommandService.run({
          operation: "start",
        })
      : input?.processManager || input?.processManagerOptions
        ? await (async () => {
            const manager = input?.processManager ?? createProcessManager({
              ...input?.processManagerOptions,
              env: input?.env,
            });
            if (!manager.start) {
              return {
                reason: "not_supported",
                status: "failed",
                summary: "start not supported",
              };
            }
            return manager.start();
          })()
        : await createDaemonCommandService({
            env: input?.env,
          }).run({
            operation: "start",
          }).catch(async () => {
      const manager = input?.processManager ?? createProcessManager({
        ...input?.processManagerOptions,
        env: input?.env,
      });
      if (!manager.start) {
        return {
          reason: "not_supported",
          status: "failed",
          summary: "start not supported",
        };
      }
      return manager.start();
    });
    emit("start", {
      command: "start",
      ...(input?.daemonCommandService || !input?.processManager ? { mappedTo: "carvis daemon start" } : {}),
      ...(typeof result.reason === "string" ? { reason: result.reason } : {}),
      status: result.status,
      summary: result.summary,
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "stop") {
    const result = input?.daemonCommandService
      ? await input.daemonCommandService.run({
          operation: "stop",
        })
      : input?.processManager || input?.processManagerOptions
        ? await (async () => {
            const manager = input?.processManager ?? createProcessManager({
              ...input?.processManagerOptions,
              env: input?.env,
            });
            if (!manager.stop) {
              return {
                reason: "not_supported",
                status: "failed",
                summary: "stop not supported",
              };
            }
            return manager.stop();
          })()
        : await createDaemonCommandService({
            env: input?.env,
          }).run({
            operation: "stop",
          }).catch(async () => {
      const manager = input?.processManager ?? createProcessManager({
        ...input?.processManagerOptions,
        env: input?.env,
      });
      if (!manager.stop) {
        return {
          reason: "not_supported",
          status: "failed",
          summary: "stop not supported",
        };
      }
      return manager.stop();
    });
    emit("stop", {
      command: "stop",
      ...(input?.daemonCommandService || !input?.processManager ? { mappedTo: "carvis daemon stop" } : {}),
      ...(Array.isArray((result as { missing?: unknown }).missing) ? { missing: (result as { missing: unknown[] }).missing } : {}),
      ...(Array.isArray((result as { removedState?: unknown }).removedState)
        ? { removedState: (result as { removedState: unknown[] }).removedState }
        : {}),
      ...(typeof (result as { reason?: unknown }).reason === "string"
        ? { reason: (result as { reason: string }).reason }
        : {}),
      status: result.status,
      summary: result.summary,
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "daemon") {
    const daemonCommandService = input?.daemonCommandService ?? createDaemonCommandService({
      env: input?.env,
    });
    const result = await daemonCommandService.run({
      operation: parsed.command.operation,
    });
    emit("daemon", {
      ...result,
      command: "daemon",
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "infra") {
    const infraCommandService = input?.infraCommandService ?? createInfraCommandService({
      env: input?.env,
    });
    const result = await infraCommandService.run({
      operation: parsed.command.operation,
    });
    emit("infra", {
      ...result,
      command: "infra",
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "status") {
    const statusService = input?.statusService ?? createStatusService({
      env: input?.env,
    });
    const result = await statusService.getStatus();
    emit("status", {
      command: "status",
      ...result,
    });
    return 0;
  }

  if (parsed.command.action === "doctor") {
    const doctorService = input?.doctorService ?? createDoctorService({
      env: input?.env,
    });
    const result = await doctorService.run();
    emit("doctor", {
      command: "doctor",
      ...result,
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "configure") {
    const configureService = input?.configureService ?? createConfigureService({
      env: input?.env,
      probeFeishuCredentials: input?.probeFeishuCredentials,
      yes: runtimeOptions.yes,
      prompter: input?.configurePrompter ?? input?.onboardingPrompter,
    });
    const result = await configureService.run(parsed.command.section);
    emit("configure", {
      command: "configure",
      ...result,
    });
    return result.status === "failed" ? 4 : 0;
  }

  if (parsed.command.action === "uninstall") {
    const uninstallService = input?.uninstallService ?? createUninstallService({
      env: input?.env,
    });
    const result = await uninstallService.run({
      purge: parsed.command.purge,
    });
    emit("uninstall", {
      ...result,
      command: "uninstall",
    });
    return result.status === "failed" ? 4 : 0;
  }

  stderr(`${parsed.command.action} 尚未实现。`);
  return 4;
}

function parseCliRuntimeOptions(argv: string[]): {
  flow?: PromptFlow;
  interactive?: boolean;
  outputMode?: "human" | "json";
  positionalArgv: string[];
  yes?: boolean;
} {
  const positionalArgv: string[] = [];
  let flow: PromptFlow | undefined;
  let interactive: boolean | undefined;
  let outputMode: "human" | "json" | undefined;
  let yes = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      outputMode = "json";
      interactive = false;
      continue;
    }
    if (token === "--non-interactive") {
      interactive = false;
      continue;
    }
    if (token === "--yes") {
      yes = true;
      continue;
    }
    if (token === "--flow") {
      const value = argv[index + 1];
      if (value === "quickstart" || value === "manual") {
        flow = value;
        index += 1;
        continue;
      }
    }
    positionalArgv.push(token);
  }

  return {
    flow,
    interactive,
    outputMode,
    positionalArgv,
    yes,
  };
}

function buildHelpText() {
  return [
    "carvis <install|onboard|daemon|infra|status|doctor|uninstall|start|stop|configure>",
    "",
    "Examples:",
    "  carvis install",
    "  carvis onboard",
    "  carvis daemon start",
    "  carvis infra status",
    "  carvis configure feishu",
  ].join("\n");
}
