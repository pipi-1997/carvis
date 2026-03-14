import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

import { z } from "zod";

import type { AgentConfig } from "../domain/models.ts";
import type {
  ExternalWebhookRuntimeDefinition,
  RuntimeConfig,
  RuntimeDependencyTargets,
  RuntimeFingerprintInput,
  RuntimeSecrets,
  ScheduledJobRuntimeDefinition,
  TriggerConfig,
} from "../domain/runtime-models.ts";

export const DEFAULT_RUNTIME_CONFIG_PATH = ".carvis/config.json";

const runtimeFileSchema = z.object({
  agent: z.object({
    id: z.string().min(1, "agent.id is required"),
    bridge: z.literal("codex"),
    defaultWorkspace: z.string().min(1, "agent.defaultWorkspace is required"),
    timeoutSeconds: z.number().int().positive("agent.timeoutSeconds must be > 0"),
    maxConcurrent: z.number().int().positive("agent.maxConcurrent must be > 0"),
  }),
  gateway: z.object({
    port: z.number().int().positive("gateway.port must be > 0"),
    healthPath: z.string().min(1, "gateway.healthPath is required"),
  }),
  executor: z.object({
    pollIntervalMs: z.number().int().positive("executor.pollIntervalMs must be > 0"),
  }),
  feishu: z.object({
    allowFrom: z.array(z.string().min(1)).min(1, "feishu.allowFrom must not be empty"),
    requireMention: z.boolean(),
  }),
  workspaceResolver: z.object({
    registry: z.record(z.string(), z.string().min(1)).refine(
      (value) => Object.keys(value).length > 0,
      "workspaceResolver.registry must not be empty",
    ),
    chatBindings: z.record(z.string(), z.string().min(1)).default({}),
    sandboxModes: z.record(z.string(), z.enum(["workspace-write", "danger-full-access"])),
    managedWorkspaceRoot: z.string().min(1, "workspaceResolver.managedWorkspaceRoot is required"),
    templatePath: z.string().min(1, "workspaceResolver.templatePath is required"),
  }),
  triggers: z.object({
    scheduledJobs: z.array(z.object({
      id: z.string().min(1, "triggers.scheduledJobs.id is required"),
      enabled: z.boolean(),
      workspace: z.string().min(1, "triggers.scheduledJobs.workspace is required"),
      agentId: z.string().min(1).optional(),
      schedule: z.string().min(1, "triggers.scheduledJobs.schedule is required"),
      timezone: z.string().min(1).nullable().optional(),
      promptTemplate: z.string().min(1, "triggers.scheduledJobs.promptTemplate is required"),
      delivery: z.object({
        kind: z.enum(["none", "feishu_chat"]),
        chatId: z.string().min(1).nullable().optional(),
        label: z.string().min(1).nullable().optional(),
      }),
    })).default([]),
    webhooks: z.array(z.object({
      id: z.string().min(1, "triggers.webhooks.id is required"),
      enabled: z.boolean(),
      slug: z.string().min(1, "triggers.webhooks.slug is required"),
      workspace: z.string().min(1, "triggers.webhooks.workspace is required"),
      agentId: z.string().min(1).optional(),
      promptTemplate: z.string().min(1, "triggers.webhooks.promptTemplate is required"),
      requiredFields: z.array(z.string().min(1)).default([]),
      optionalFields: z.array(z.string().min(1)).default([]),
      secretEnv: z.string().min(1, "triggers.webhooks.secretEnv is required"),
      replayWindowSeconds: z.number().int().positive().default(300),
      delivery: z.object({
        kind: z.enum(["none", "feishu_chat"]),
        chatId: z.string().min(1).nullable().optional(),
        label: z.string().min(1).nullable().optional(),
      }),
    })).default([]),
  }).default({
    scheduledJobs: [],
    webhooks: [],
  }),
});

type RuntimeFileConfig = z.infer<typeof runtimeFileSchema>;

type LoadRuntimeConfigOptions = {
  env?: Record<string, string | undefined>;
  configPath?: string;
};

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeConfig> {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? resolveRuntimeConfigPath(env);

  if (!existsSync(configPath)) {
    throw new Error(`runtime config not found: ${configPath}`);
  }

  const rawConfig = await readFile(configPath, "utf8");
  const parsedConfig = runtimeFileSchema.parse(JSON.parse(rawConfig)) satisfies RuntimeFileConfig;
  const secrets = loadRuntimeSecrets(env);
  validateWorkspaceResolver(parsedConfig);
  validateTriggerDefinitions(parsedConfig, env);
  const resolvedDefaultWorkspace = parsedConfig.workspaceResolver.registry[parsedConfig.agent.defaultWorkspace];

  return {
    agent: {
      ...parsedConfig.agent,
      workspace: resolvedDefaultWorkspace,
    } satisfies AgentConfig,
    gateway: parsedConfig.gateway,
    executor: parsedConfig.executor,
    feishu: parsedConfig.feishu,
    workspaceResolver: parsedConfig.workspaceResolver,
    triggers: resolveTriggerConfig(parsedConfig, env),
    secrets,
  };
}

export function resolveRuntimeConfigPath(env: Record<string, string | undefined> = process.env): string {
  const homeDir = env.HOME && env.HOME.length > 0 ? env.HOME : homedir();
  return resolve(homeDir, DEFAULT_RUNTIME_CONFIG_PATH);
}

export function loadRuntimeSecrets(env: Record<string, string | undefined> = process.env): RuntimeSecrets {
  return {
    feishuAppId: requireEnv(env, "FEISHU_APP_ID"),
    feishuAppSecret: requireEnv(env, "FEISHU_APP_SECRET"),
    postgresUrl: requireEnv(env, "POSTGRES_URL"),
    redisUrl: requireEnv(env, "REDIS_URL"),
  };
}

export function buildRuntimeFingerprint(config: RuntimeConfig): string {
  const dependencyTargets = extractRuntimeDependencyTargets(config.secrets);
  const payload: RuntimeFingerprintInput = {
    agentId: config.agent.id,
    bridge: config.agent.bridge,
    defaultWorkspace: config.agent.defaultWorkspace,
    workspace: config.agent.workspace,
    workspaceRegistryEntries: Object.entries(config.workspaceResolver.registry)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, path]) => `${key}=${path}`),
    workspaceChatBindings: Object.entries(config.workspaceResolver.chatBindings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([chatId, workspaceKey]) => `${chatId}=${workspaceKey}`),
    workspaceSandboxModeEntries: Object.entries(config.workspaceResolver.sandboxModes ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([workspaceKey, sandboxMode]) => `${workspaceKey}=${sandboxMode}`),
    managedWorkspaceRoot: config.workspaceResolver.managedWorkspaceRoot,
    templatePath: config.workspaceResolver.templatePath,
    feishuAllowFrom: [...config.feishu.allowFrom].sort(),
    feishuRequireMention: config.feishu.requireMention,
    feishuAppId: config.secrets.feishuAppId,
    postgresTarget: dependencyTargets.postgresTarget,
    redisTarget: dependencyTargets.redisTarget,
    triggerDefinitionEntries: serializeTriggerDefinitions(config.triggers),
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildRuntimeScope(input: {
  agentId: string;
  configPath?: string;
  env?: Record<string, string | undefined>;
}): string {
  const configPath = input.configPath ?? resolveRuntimeConfigPath(input.env);
  return createHash("sha256").update(`${input.agentId}:${configPath}`).digest("hex");
}

export function extractRuntimeDependencyTargets(secrets: RuntimeSecrets): RuntimeDependencyTargets {
  return {
    postgresTarget: sanitizeConnectionTarget(secrets.postgresUrl),
    redisTarget: sanitizeConnectionTarget(secrets.redisUrl),
  };
}

function validateWorkspaceResolver(config: RuntimeFileConfig) {
  const defaultWorkspace = config.agent.defaultWorkspace;
  const registry = config.workspaceResolver.registry;
  const defaultWorkspacePath = registry[defaultWorkspace];

  if (!defaultWorkspacePath) {
    throw new Error("agent.defaultWorkspace must exist in workspaceResolver.registry");
  }

  if (!isPathWithinRoot(defaultWorkspacePath, config.workspaceResolver.managedWorkspaceRoot)) {
    throw new Error(
      `workspaceResolver.registry.${defaultWorkspace} must stay within workspaceResolver.managedWorkspaceRoot`,
    );
  }

  for (const [workspaceKey, workspacePath] of Object.entries(registry)) {
    if (!existsSync(workspacePath)) {
      throw new Error(`workspaceResolver.registry.${workspaceKey} must point to an existing directory`);
    }
  }

  for (const [chatId, workspaceKey] of Object.entries(config.workspaceResolver.chatBindings)) {
    if (!registry[workspaceKey]) {
      throw new Error("workspaceResolver.chatBindings must reference existing workspace keys");
    }
    if (!chatId) {
      throw new Error("workspaceResolver.chatBindings keys must not be empty");
    }
  }

  const sandboxModeKeys = Object.keys(config.workspaceResolver.sandboxModes);
  for (const workspaceKey of Object.keys(registry)) {
    if (!config.workspaceResolver.sandboxModes[workspaceKey]) {
      throw new Error("workspaceResolver.sandboxModes must define every workspace in workspaceResolver.registry");
    }
  }
  for (const workspaceKey of sandboxModeKeys) {
    if (!registry[workspaceKey]) {
      throw new Error("workspaceResolver.sandboxModes must only reference existing workspace keys");
    }
  }
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedTarget = resolve(targetPath);
  const relativePath = relative(resolvedRoot, resolvedTarget);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function validateTriggerDefinitions(
  config: RuntimeFileConfig,
  env: Record<string, string | undefined>,
) {
  const registry = config.workspaceResolver.registry;
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const definition of config.triggers.scheduledJobs) {
    if (seenIds.has(definition.id)) {
      throw new Error(`duplicate trigger definition id: ${definition.id}`);
    }
    seenIds.add(definition.id);

    if (!registry[definition.workspace]) {
      throw new Error(`trigger workspace must exist in workspaceResolver.registry: ${definition.workspace}`);
    }

    if (definition.delivery.kind === "feishu_chat" && !definition.delivery.chatId) {
      throw new Error(`trigger delivery chatId is required for feishu_chat: ${definition.id}`);
    }
  }

  for (const definition of config.triggers.webhooks) {
    if (seenIds.has(definition.id)) {
      throw new Error(`duplicate trigger definition id: ${definition.id}`);
    }
    seenIds.add(definition.id);

    if (seenSlugs.has(definition.slug)) {
      throw new Error(`duplicate external webhook slug: ${definition.slug}`);
    }
    seenSlugs.add(definition.slug);

    if (!registry[definition.workspace]) {
      throw new Error(`trigger workspace must exist in workspaceResolver.registry: ${definition.workspace}`);
    }

    if (definition.delivery.kind === "feishu_chat" && !definition.delivery.chatId) {
      throw new Error(`trigger delivery chatId is required for feishu_chat: ${definition.id}`);
    }

    requireEnv(env, definition.secretEnv);
  }
}

function resolveTriggerConfig(
  config: RuntimeFileConfig,
  env: Record<string, string | undefined>,
): TriggerConfig {
  return {
    scheduledJobs: config.triggers.scheduledJobs.map((definition) => ({
      id: definition.id,
      enabled: definition.enabled,
      workspace: definition.workspace,
      agentId: definition.agentId ?? config.agent.id,
      schedule: definition.schedule,
      timezone: definition.timezone ?? null,
      promptTemplate: definition.promptTemplate,
      delivery: {
        kind: definition.delivery.kind,
        chatId: definition.delivery.chatId ?? null,
        label: definition.delivery.label ?? null,
      },
    } satisfies ScheduledJobRuntimeDefinition)),
    webhooks: config.triggers.webhooks.map((definition) => ({
      id: definition.id,
      enabled: definition.enabled,
      slug: definition.slug,
      workspace: definition.workspace,
      agentId: definition.agentId ?? config.agent.id,
      promptTemplate: definition.promptTemplate,
      requiredFields: definition.requiredFields,
      optionalFields: definition.optionalFields,
      secretEnv: definition.secretEnv,
      secret: requireEnv(env, definition.secretEnv),
      replayWindowSeconds: definition.replayWindowSeconds,
      delivery: {
        kind: definition.delivery.kind,
        chatId: definition.delivery.chatId ?? null,
        label: definition.delivery.label ?? null,
      },
    } satisfies ExternalWebhookRuntimeDefinition)),
  };
}

function serializeTriggerDefinitions(triggers: TriggerConfig): string[] {
  const scheduledJobs = triggers.scheduledJobs.map((definition) => JSON.stringify({
    id: definition.id,
    sourceType: "scheduled_job",
    enabled: definition.enabled,
    workspace: definition.workspace,
    agentId: definition.agentId,
    schedule: definition.schedule,
    timezone: definition.timezone,
    promptTemplate: definition.promptTemplate,
    delivery: definition.delivery,
  }));
  const webhooks = triggers.webhooks.map((definition) => JSON.stringify({
    id: definition.id,
    sourceType: "external_webhook",
    enabled: definition.enabled,
    slug: definition.slug,
    workspace: definition.workspace,
    agentId: definition.agentId,
    promptTemplate: definition.promptTemplate,
    requiredFields: definition.requiredFields,
    optionalFields: definition.optionalFields,
    secretEnv: definition.secretEnv,
    secret: definition.secret,
    replayWindowSeconds: definition.replayWindowSeconds,
    delivery: definition.delivery,
  }));

  return [...scheduledJobs, ...webhooks].sort();
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function sanitizeConnectionTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return connectionString;
  }
}
