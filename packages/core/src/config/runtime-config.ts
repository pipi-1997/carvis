import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import { z } from "zod";

import type { AgentConfig } from "../domain/models.ts";
import type {
  RuntimeConfig,
  RuntimeDependencyTargets,
  RuntimeFingerprintInput,
  RuntimeSecrets,
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
    managedWorkspaceRoot: z.string().min(1, "workspaceResolver.managedWorkspaceRoot is required"),
    templatePath: z.string().min(1, "workspaceResolver.templatePath is required"),
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
    managedWorkspaceRoot: config.workspaceResolver.managedWorkspaceRoot,
    templatePath: config.workspaceResolver.templatePath,
    feishuAllowFrom: [...config.feishu.allowFrom].sort(),
    feishuRequireMention: config.feishu.requireMention,
    feishuAppId: config.secrets.feishuAppId,
    postgresTarget: dependencyTargets.postgresTarget,
    redisTarget: dependencyTargets.redisTarget,
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
}

function requireEnv(env: Record<string, string | undefined>, key: keyof RuntimeSecretsMap): string {
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

type RuntimeSecretsMap = {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  POSTGRES_URL: string;
  REDIS_URL: string;
};
