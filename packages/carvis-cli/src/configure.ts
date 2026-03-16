import {
  getFeishuSetupSpec,
  probeFeishuCredentials as probeFeishuCredentialsDefault,
  validateFeishuSetupInput,
} from "@carvis/channel-feishu";

import {
  InvalidManagedWorkspaceRootError,
  InvalidWorkspacePathError,
  readOnboardConfigDraft,
  readRuntimeEnvFile,
  readStructuredRuntimeConfig,
  resolveCarvisRuntimeFileSet,
  writeCarvisRuntimeConfig,
} from "./config-writer.ts";
import { presentFeishuFieldHint } from "./adapter-guidance.ts";
import type { OnboardingPrompter, ProbeFeishuCredentials } from "./onboarding.ts";
import { createClackPrompter, PromptCancelledError } from "./prompt-runtime.ts";

type ConfigureSection = "feishu" | "workspace";

type ConfigureResult =
  | {
      section: ConfigureSection;
      status: "updated";
      summary: string;
    }
  | {
      reason: string;
      section: ConfigureSection;
      status: "failed";
      summary: string;
    };

export async function runConfigure(
  section: ConfigureSection,
  options: {
    env?: Record<string, string | undefined>;
    probeFeishuCredentials?: ProbeFeishuCredentials;
    prompter?: OnboardingPrompter;
    yes?: boolean;
  },
): Promise<ConfigureResult> {
  const prompter = options.prompter ?? createClackPrompter({
    command: "configure",
    yes: options.yes,
  });
  const fileSet = resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const draft = await readOnboardConfigDraft(fileSet);
  const existingConfig = await readStructuredRuntimeConfig(fileSet);
  const existingRuntimeEnv = await readRuntimeEnvFile(fileSet);
  if (!draft || !existingConfig) {
    return {
      reason: "missing_config",
      section,
      status: "failed",
      summary: "current config not found",
    };
  }

  try {
    if ("begin" in prompter && typeof prompter.begin === "function") {
      prompter.begin(`Carvis Configure ${section}`);
    }

    if (section === "feishu") {
      const spec = getFeishuSetupSpec();
      const fieldsByKey = new Map(spec.fields.map((field) => [field.key, field]));
      await presentFeishuFieldHint(prompter, fieldsByKey.get("appId")!);
      const appId = await prompter.input({
        defaultValue: draft.feishuAppId,
        id: "appId",
        message: "请输入 Feishu App ID",
      });
      await presentFeishuFieldHint(prompter, fieldsByKey.get("appSecret")!);
      const appSecret = await prompter.input({
        defaultValue: draft.feishuAppSecret,
        id: "appSecret",
        message: "请输入 Feishu App Secret",
        secret: true,
      });
      await presentFeishuFieldHint(prompter, fieldsByKey.get("allowFrom")!);
      const allowFromRaw = await prompter.input({
        defaultValue: draft.allowFrom.join(","),
        id: "allowFrom",
        message: "请输入 allowFrom，多个值用逗号分隔",
      });
      await presentFeishuFieldHint(prompter, fieldsByKey.get("requireMention")!);
      const requireMention = await prompter.confirm({
        defaultValue: draft.requireMention,
        id: "requireMention",
        message: "群聊中是否必须 @ 机器人？",
      });
      const validated = validateFeishuSetupInput({
        allowFrom: normalizeAllowFrom(allowFromRaw),
        appId,
        appSecret,
        requireMention,
      });
      if (!validated.ok) {
        return {
          reason: "invalid_feishu_setup",
          section,
          status: "failed",
          summary: validated.errors.join("；"),
        };
      }
      const probe = "withSpinner" in prompter && typeof prompter.withSpinner === "function"
        ? await prompter.withSpinner(
            "验证 Feishu 凭据",
            () =>
              (options.probeFeishuCredentials ?? probeFeishuCredentialsDefault)({
                appId: validated.value.appId,
                appSecret: validated.value.appSecret,
              }),
          )
        : await (options.probeFeishuCredentials ?? probeFeishuCredentialsDefault)({
            appId: validated.value.appId,
            appSecret: validated.value.appSecret,
          });
      if (!probe.ok) {
        return {
          reason: probe.code,
          section,
          status: "failed",
          summary: probe.message,
        };
      }

      await writeCarvisRuntimeConfig(
        {
          ...draft,
          allowFrom: validated.value.allowFrom,
          feishuAppId: validated.value.appId,
          feishuAppSecret: validated.value.appSecret,
          requireMention: validated.value.requireMention,
        },
        {
          existingConfig,
          existingRuntimeEnv,
          fileSet,
        },
      );

      if ("end" in prompter && typeof prompter.end === "function") {
        prompter.end("Feishu 配置已更新。");
      }

      return {
        section,
        status: "updated",
        summary: "feishu updated",
      };
    }

    const workspaceKey = await prompter.input({
      defaultValue: draft.workspaceKey ?? "main",
      id: "workspaceKey",
      message: "请输入默认 workspace key",
    });
    const workspacePath = await prompter.input({
      defaultValue: draft.workspacePath,
      id: "workspacePath",
      message: "请输入默认 workspace 路径",
    });
    const managedWorkspaceRoot = await prompter.input({
      defaultValue: draft.managedWorkspaceRoot,
      id: "managedWorkspaceRoot",
      message: "请输入 managed workspace root",
    });
    const templatePath = await prompter.input({
      defaultValue: draft.templatePath,
      id: "templatePath",
      message: "请输入 workspace template 路径",
    });

    await writeCarvisRuntimeConfig(
      {
        ...draft,
        managedWorkspaceRoot,
        templatePath,
        workspaceKey,
        workspacePath,
      },
      {
        existingConfig,
        existingRuntimeEnv,
        fileSet,
      },
    );

    if ("end" in prompter && typeof prompter.end === "function") {
      prompter.end("Workspace 配置已更新。");
    }

    return {
      section,
      status: "updated",
      summary: "workspace updated",
    };
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      return {
        reason: "cancelled",
        section,
        status: "failed",
        summary: "已取消 configure。",
      };
    }
    if (error instanceof InvalidWorkspacePathError) {
      return {
        reason: "invalid_workspace_path",
        section,
        status: "failed",
        summary: error.message,
      };
    }
    if (error instanceof InvalidManagedWorkspaceRootError) {
      return {
        reason: "invalid_managed_workspace_root",
        section,
        status: "failed",
        summary: error.message,
      };
    }
    throw error;
  }
}

export function createConfigureService(options: {
  env?: Record<string, string | undefined>;
  probeFeishuCredentials?: ProbeFeishuCredentials;
  prompter?: OnboardingPrompter;
  yes?: boolean;
}) {
  return {
    run(section: ConfigureSection) {
      return runConfigure(section, options);
    },
  };
}

function normalizeAllowFrom(raw: string) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
