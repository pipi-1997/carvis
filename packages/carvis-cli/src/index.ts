import { parseCarvisCommand } from "./command-parser.ts";
import { createConfigureService, runConfigure } from "./configure.ts";
import { createDoctorService } from "./doctor.ts";
import { runOnboarding, type OnboardingPrompter, type ProbeFeishuCredentials } from "./onboarding.ts";
import { renderHumanResult } from "./output.ts";
import { createProcessManager } from "./process-manager.ts";
import { createStatusService } from "./status.ts";
import type { PromptFlow } from "./prompt-runtime.ts";

export { parseCarvisCommand } from "./command-parser.ts";
export { createConfigureService, runConfigure } from "./configure.ts";
export {
  resolveCarvisRuntimeFileSet,
  writeCarvisRuntimeConfig,
  type CarvisRuntimeFileSet,
  type OnboardConfigDraft,
} from "./config-writer.ts";
export {
  createCarvisStateStore,
  type LocalRuntimeProcessState,
  type LocalRuntimeRole,
} from "./state-store.ts";
export { createProcessManager } from "./process-manager.ts";
export { createDoctorService, summarizeDoctorChecks, type DoctorCheck } from "./doctor.ts";
export { runOnboarding, type OnboardingPrompter, type OnboardingResult, type ProbeFeishuCredentials } from "./onboarding.ts";
export { createStatusService, summarizeRuntimeStatus, type RuntimeStatusSummary } from "./status.ts";

export async function runCarvisCli(
  argv: string[],
  input?: {
    configurePrompter?: OnboardingPrompter;
    configureService?: {
      run(section: "feishu" | "workspace"): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    cwd?: string;
    doctorService?: {
      run(): Promise<Record<string, unknown> & { status: string; summary: string }>;
    };
    env?: Record<string, string | undefined>;
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

  const emit = (command: "configure" | "doctor" | "onboard" | "start" | "status" | "stop", payload: Record<string, unknown>) => {
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

    const manager = input?.processManager ?? createProcessManager({
      ...input?.processManagerOptions,
      env: input?.env,
    });
    if (!manager.start) {
      emit("onboard", {
        command: "onboard",
        reason: "not_supported",
        status: "failed",
        summary: "start not supported",
      });
      return 4;
    }
    const result = await manager.start();
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
    const manager = input?.processManager ?? createProcessManager({
      ...input?.processManagerOptions,
      env: input?.env,
    });
    if (!manager.start) {
      emit("start", {
        command: "start",
        reason: "not_supported",
        status: "failed",
        summary: "start not supported",
      });
      return 4;
    }
    const result = await manager.start();
    if (result.status === "failed") {
      emit("start", {
        command: "start",
        reason: result.reason,
        status: result.status,
        summary: result.summary,
      });
      return 4;
    }
    emit("start", {
      command: "start",
      status: result.status,
      summary: result.summary,
    });
    return 0;
  }

  if (parsed.command.action === "stop") {
    const manager = input?.processManager ?? createProcessManager({
      ...input?.processManagerOptions,
      env: input?.env,
    });
    if (!manager.stop) {
      emit("stop", {
        command: "stop",
        reason: "not_supported",
        status: "failed",
        summary: "stop not supported",
      });
      return 4;
    }
    const result = await manager.stop();
    emit("stop", {
      command: "stop",
      ...result,
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
    "carvis <onboard|start|stop|status|doctor|configure>",
    "",
    "Examples:",
    "  carvis onboard",
    "  carvis start",
    "  carvis configure feishu",
  ].join("\n");
}
