import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  getFeishuSetupSpec,
  probeFeishuCredentials as probeFeishuCredentialsDefault,
  validateFeishuSetupInput,
  type FeishuProbeResult,
} from "@carvis/channel-feishu";

import {
  InvalidManagedWorkspaceRootError,
  InvalidWorkspacePathError,
  readOnboardConfigDraft,
  readRuntimeEnvFile,
  readStructuredRuntimeConfig,
  resolveCarvisRuntimeFileSet,
  writeCarvisRuntimeConfig,
  type CarvisRuntimeFileSet,
} from "./config-writer.ts";
import { presentFeishuFieldHint } from "./adapter-guidance.ts";
import { createClackPrompter, PromptCancelledError, type PromptFlow } from "./prompt-runtime.ts";

export type OnboardingPrompter = {
  confirm(input: {
    defaultValue?: boolean;
    id: string;
    message: string;
  }): Promise<boolean>;
  input(input: {
    defaultValue?: string;
    id: string;
    message: string;
    secret?: boolean;
  }): Promise<string>;
  select(input: {
    defaultValue?: string;
    id: string;
    message: string;
    options: string[];
  }): Promise<string>;
  note?(message: string, title?: string): void | Promise<void>;
};

export type OnboardingResult =
  | {
      fileSet: CarvisRuntimeFileSet;
      status: "configured";
      summary: string;
    }
  | {
      fileSet: CarvisRuntimeFileSet;
      status: "reuse_existing";
      summary: string;
    }
  | {
      fileSet: CarvisRuntimeFileSet;
      status: "cancelled";
      summary: string;
    }
  | {
      fileSet: CarvisRuntimeFileSet;
      reason: string;
      status: "failed";
      summary: string;
    };

export type ProbeFeishuCredentials = (input: {
  appId: string;
  appSecret: string;
}) => Promise<FeishuProbeResult>;

export async function runOnboarding(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  fileSet?: CarvisRuntimeFileSet;
  flow?: PromptFlow;
  probeFeishuCredentials?: ProbeFeishuCredentials;
  prompter?: OnboardingPrompter;
  yes?: boolean;
} = {}): Promise<OnboardingResult> {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const prompter = options.prompter ?? createClackPrompter({
    command: "onboard",
    flow: options.flow,
    yes: options.yes,
  });
  const probeFeishuCredentials = options.probeFeishuCredentials ?? probeFeishuCredentialsDefault;
  const existingDraft = await readOnboardConfigDraft(fileSet);

  if ("begin" in prompter && typeof prompter.begin === "function") {
    prompter.begin("Carvis Onboard");
  }

  try {
    if (existsSync(fileSet.configPath)) {
      let existingConfigAction: "cancel" | "modify" | "reuse";
      try {
        existingConfigAction = await prompter.select({
          defaultValue: "reuse",
          id: "existingConfigAction",
          message: "检测到已有配置，请选择后续动作",
          options: ["reuse", "modify", "cancel"],
        }) as "cancel" | "modify" | "reuse";
      } catch {
        const reuseExistingConfig = await prompter.confirm({
          defaultValue: true,
          id: "reuseExistingConfig",
          message: "检测到已有配置，是否直接复用并重新启动？",
        });
        existingConfigAction = reuseExistingConfig ? "reuse" : "cancel";
      }

      if (existingConfigAction === "reuse") {
        return {
          fileSet,
          status: "reuse_existing",
          summary: "reuse existing config",
        };
      }

      if (existingConfigAction === "cancel") {
        return {
          fileSet,
          status: "cancelled",
          summary: "已取消 onboard，保留现有配置。",
        };
      }
    }

    const adapter = await prompter.select({
      defaultValue: existingDraft?.adapter ?? "feishu",
      id: "adapter",
      message: "请选择接入适配器",
      options: ["feishu"],
    });
    if (adapter !== "feishu") {
      return {
        fileSet,
        reason: "unsupported_adapter",
        status: "failed",
        summary: `暂不支持适配器：${adapter}`,
      };
    }

    const spec = getFeishuSetupSpec();
    const fieldsByKey = new Map(spec.fields.map((field) => [field.key, field]));
    const fieldDefaults = new Map(spec.fields.map((field) => [field.key, field.defaultValue]));
    await presentFeishuFieldHint(prompter, fieldsByKey.get("appId")!);
    const appId = await prompter.input({
      defaultValue: existingDraft?.feishuAppId,
      id: "appId",
      message: "请输入 Feishu App ID",
    });
    await presentFeishuFieldHint(prompter, fieldsByKey.get("appSecret")!);
    const appSecret = await prompter.input({
      defaultValue: existingDraft?.feishuAppSecret,
      id: "appSecret",
      message: "请输入 Feishu App Secret",
      secret: true,
    });
    await presentFeishuFieldHint(prompter, fieldsByKey.get("allowFrom")!);
    const allowFromRaw = await prompter.input({
      defaultValue:
        existingDraft?.allowFrom.join(",")
        ?? (fieldDefaults.get("allowFrom") as string[] | undefined)?.join(",")
        ?? "*",
      id: "allowFrom",
      message: "请输入 allowFrom，多个值用逗号分隔",
    });
    await presentFeishuFieldHint(prompter, fieldsByKey.get("requireMention")!);
    const requireMention = await prompter.confirm({
      defaultValue: existingDraft?.requireMention ?? (fieldDefaults.get("requireMention") as boolean | undefined),
      id: "requireMention",
      message: "群聊中是否必须 @ 机器人？",
    });
    const postgresUrl = await prompter.input({
      defaultValue: existingDraft?.postgresUrl,
      id: "postgresUrl",
      message: "请输入 POSTGRES_URL",
    });
    const redisUrl = await prompter.input({
      defaultValue: existingDraft?.redisUrl,
      id: "redisUrl",
      message: "请输入 REDIS_URL",
    });
    const workspacePath = await prompter.input({
      defaultValue: existingDraft?.workspacePath ?? options.cwd ?? process.cwd(),
      id: "workspacePath",
      message: "请输入默认 workspace 路径",
    });
    const workspaceKey = options.flow === "manual"
      ? await prompter.input({
          defaultValue: existingDraft?.workspaceKey ?? "main",
          id: "workspaceKey",
          message: "请输入默认 workspace key",
        })
      : (existingDraft?.workspaceKey ?? "main");
    const managedWorkspaceRoot = options.flow === "manual"
      ? await prompter.input({
          defaultValue: existingDraft?.managedWorkspaceRoot,
          id: "managedWorkspaceRoot",
          message: "请输入 managed workspace root",
        })
      : existingDraft?.managedWorkspaceRoot;
    const templatePath = options.flow === "manual"
      ? await prompter.input({
          defaultValue: existingDraft?.templatePath,
          id: "templatePath",
          message: "请输入 workspace template 路径",
        })
      : existingDraft?.templatePath;
    const effectiveManagedWorkspaceRoot = options.flow === "manual"
      ? managedWorkspaceRoot
      : normalizeManagedWorkspaceRoot(workspacePath, managedWorkspaceRoot);

    const validated = validateFeishuSetupInput({
      allowFrom: normalizeAllowFrom(allowFromRaw),
      appId,
      appSecret,
      requireMention,
    });
    if (!validated.ok) {
      return {
        fileSet,
        reason: "invalid_feishu_setup",
        status: "failed",
        summary: validated.errors.join("；"),
      };
    }

    const probe = "withSpinner" in prompter && typeof prompter.withSpinner === "function"
      ? await prompter.withSpinner("验证 Feishu 凭据", () => probeFeishuCredentials({
          appId: validated.value.appId,
          appSecret: validated.value.appSecret,
        }))
      : await probeFeishuCredentials({
          appId: validated.value.appId,
          appSecret: validated.value.appSecret,
        });
    if (!probe.ok) {
      return {
        fileSet,
        reason: probe.code,
        status: "failed",
        summary: probe.message,
      };
    }

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: validated.value.allowFrom,
        feishuAppId: validated.value.appId,
        feishuAppSecret: validated.value.appSecret,
        managedWorkspaceRoot: effectiveManagedWorkspaceRoot,
        postgresUrl,
        redisUrl,
        requireMention: validated.value.requireMention,
        templatePath,
        workspaceKey,
        workspacePath,
      },
      {
        existingConfig: await readStructuredRuntimeConfig(fileSet) ?? undefined,
        existingRuntimeEnv: await readRuntimeEnvFile(fileSet),
        fileSet,
      },
    );

    if ("end" in prompter && typeof prompter.end === "function") {
      prompter.end("配置已写入，准备启动 runtime。");
    }

    return {
      fileSet,
      status: "configured",
      summary: "configuration written",
    };
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      return {
        fileSet,
        status: "cancelled",
        summary: "已取消 onboard。",
      };
    }
    if (error instanceof InvalidWorkspacePathError) {
      return {
        fileSet,
        reason: "invalid_workspace_path",
        status: "failed",
        summary: error.message,
      };
    }
    if (error instanceof InvalidManagedWorkspaceRootError) {
      return {
        fileSet,
        reason: "invalid_managed_workspace_root",
        status: "failed",
        summary: error.message,
      };
    }
    throw error;
  }
}

function normalizeAllowFrom(raw: string) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeManagedWorkspaceRoot(workspacePath: string, managedWorkspaceRoot?: string) {
  if (!managedWorkspaceRoot) {
    return undefined;
  }

  const resolvedRoot = resolve(managedWorkspaceRoot);
  const resolvedWorkspace = resolve(workspacePath);
  const relativePath = relative(resolvedRoot, resolvedWorkspace);
  const withinRoot = relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));

  if (withinRoot) {
    return managedWorkspaceRoot;
  }

  return dirname(resolvedWorkspace);
}
