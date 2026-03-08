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
    workspace: z.string().min(1, "agent.workspace is required"),
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

  return {
    agent: parsedConfig.agent satisfies AgentConfig,
    gateway: parsedConfig.gateway,
    executor: parsedConfig.executor,
    feishu: parsedConfig.feishu,
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
    workspace: config.agent.workspace,
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
