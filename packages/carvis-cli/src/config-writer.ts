import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

type FileSetOptions = {
  homeDir?: string;
};

export type CarvisRuntimeFileSet = {
  configDir: string;
  configPath: string;
  logsDir: string;
  runtimeEnvPath: string;
  stateDir: string;
  templateDir: string;
};

export type OnboardConfigDraft = {
  adapter: "feishu";
  allowFrom: string[];
  feishuAppId: string;
  feishuAppSecret: string;
  managedWorkspaceRoot?: string;
  postgresUrl: string;
  redisUrl: string;
  requireMention: boolean;
  templatePath?: string;
  workspaceKey?: string;
  workspacePath: string;
};

export type StructuredRuntimeConfig = {
  agent: {
    id: string;
    bridge: string;
    defaultWorkspace: string;
    timeoutSeconds: number;
    maxConcurrent: number;
  };
  gateway: {
    port: number;
    healthPath: string;
  };
  executor: {
    pollIntervalMs: number;
  };
  feishu: {
    allowFrom: string[];
    requireMention: boolean;
  };
  workspaceResolver: {
    registry: Record<string, string>;
    chatBindings: Record<string, string>;
    sandboxModes: Record<string, string>;
    managedWorkspaceRoot: string;
    templatePath: string;
  };
  triggers: {
    scheduledJobs: Array<unknown>;
    webhooks: Array<unknown>;
  };
};

export type RuntimeEnvValues = Record<string, string>;

export class InvalidWorkspacePathError extends Error {
  constructor(workspacePath: string) {
    super(`workspacePath must be an existing directory: ${workspacePath}`);
    this.name = "InvalidWorkspacePathError";
  }
}

export class InvalidManagedWorkspaceRootError extends Error {
  constructor(workspaceKey: string, managedWorkspaceRoot: string, workspacePath: string) {
    super(
      `workspaceResolver.registry.${workspaceKey} must stay within managedWorkspaceRoot: ${managedWorkspaceRoot} <- ${workspacePath}`,
    );
    this.name = "InvalidManagedWorkspaceRootError";
  }
}

type WriteCarvisRuntimeConfigOptions = {
  existingConfig?: StructuredRuntimeConfig;
  existingRuntimeEnv?: RuntimeEnvValues;
  fileSet?: CarvisRuntimeFileSet;
};

export function resolveCarvisRuntimeFileSet(options: FileSetOptions = {}): CarvisRuntimeFileSet {
  const baseHomeDir = options.homeDir ?? homedir();
  const configDir = resolve(baseHomeDir, ".carvis");

  return {
    configDir,
    configPath: join(configDir, "config.json"),
    logsDir: join(configDir, "logs"),
    runtimeEnvPath: join(configDir, "runtime.env"),
    stateDir: join(configDir, "state"),
    templateDir: join(configDir, "templates", "default-workspace"),
  };
}

export async function writeCarvisRuntimeConfig(
  draft: OnboardConfigDraft,
  options: WriteCarvisRuntimeConfigOptions = {},
): Promise<CarvisRuntimeFileSet> {
  await ensureWorkspacePath(draft.workspacePath);

  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet();
  const workspaceKey = draft.workspaceKey ?? "main";
  const managedWorkspaceRoot = draft.managedWorkspaceRoot ?? dirname(resolve(draft.workspacePath));
  ensureWorkspaceWithinManagedRoot({
    managedWorkspaceRoot,
    workspaceKey,
    workspacePath: draft.workspacePath,
  });
  const templatePath = draft.templatePath ?? fileSet.templateDir;
  const runtimeConfig = buildStructuredRuntimeConfig(draft, {
    existingConfig: options.existingConfig,
    managedWorkspaceRoot,
    templatePath,
    workspaceKey,
  });
  const runtimeEnv = {
    ...(options.existingRuntimeEnv ?? {}),
    FEISHU_APP_ID: draft.feishuAppId,
    FEISHU_APP_SECRET: draft.feishuAppSecret,
    POSTGRES_URL: draft.postgresUrl,
    REDIS_URL: draft.redisUrl,
  };
  const runtimeEnvText = serializeRuntimeEnv(runtimeEnv);

  await mkdir(fileSet.configDir, { recursive: true });
  await mkdir(fileSet.logsDir, { recursive: true });
  await mkdir(fileSet.stateDir, { recursive: true });
  await mkdir(templatePath, { recursive: true });
  await mkdir(managedWorkspaceRoot, { recursive: true });
  await writeFile(fileSet.configPath, JSON.stringify(runtimeConfig, null, 2));
  await writeFile(fileSet.runtimeEnvPath, `${runtimeEnvText}\n`);

  return fileSet;
}

export async function readStructuredRuntimeConfig(fileSet: CarvisRuntimeFileSet): Promise<StructuredRuntimeConfig | null> {
  const content = await readFile(fileSet.configPath, "utf8").catch(() => null);
  if (!content) {
    return null;
  }
  return JSON.parse(content) as StructuredRuntimeConfig;
}

export async function readRuntimeEnvFile(fileSet: CarvisRuntimeFileSet): Promise<RuntimeEnvValues> {
  const content = await readFile(fileSet.runtimeEnvPath, "utf8").catch(() => "");
  return parseRuntimeEnv(content);
}

export async function readOnboardConfigDraft(fileSet: CarvisRuntimeFileSet): Promise<OnboardConfigDraft | null> {
  const config = await readStructuredRuntimeConfig(fileSet);
  if (!config) {
    return null;
  }
  const envValues = await readRuntimeEnvFile(fileSet);
  const workspaceKey = config.agent.defaultWorkspace;
  const workspacePath = config.workspaceResolver.registry[workspaceKey];
  if (!workspacePath) {
    return null;
  }
  return {
    adapter: "feishu",
    allowFrom: [...config.feishu.allowFrom],
    feishuAppId: envValues.FEISHU_APP_ID ?? "",
    feishuAppSecret: envValues.FEISHU_APP_SECRET ?? "",
    managedWorkspaceRoot: config.workspaceResolver.managedWorkspaceRoot,
    postgresUrl: envValues.POSTGRES_URL ?? "",
    redisUrl: envValues.REDIS_URL ?? "",
    requireMention: config.feishu.requireMention,
    templatePath: config.workspaceResolver.templatePath,
    workspaceKey,
    workspacePath,
  };
}

export function serializeRuntimeEnv(runtimeEnv: RuntimeEnvValues): string {
  return Object.entries(runtimeEnv)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseRuntimeEnv(content: string): RuntimeEnvValues {
  const entries = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return [key, rest.join("=")] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry[0].length > 0);

  return Object.fromEntries(entries);
}

function buildStructuredRuntimeConfig(
  draft: OnboardConfigDraft,
  input: {
    existingConfig?: StructuredRuntimeConfig;
    managedWorkspaceRoot: string;
    templatePath: string;
    workspaceKey: string;
  },
): StructuredRuntimeConfig {
  const existingConfig = input.existingConfig;
  const workspaceRegistry = {
    ...(existingConfig?.workspaceResolver.registry ?? {}),
    [input.workspaceKey]: resolve(draft.workspacePath),
  };
  const sandboxModes = {
    ...(existingConfig?.workspaceResolver.sandboxModes ?? {}),
    [input.workspaceKey]: (existingConfig?.workspaceResolver.sandboxModes?.[input.workspaceKey] ?? "workspace-write"),
  };

  return {
    agent: {
      id: existingConfig?.agent.id ?? "codex-main",
      bridge: existingConfig?.agent.bridge ?? "codex",
      defaultWorkspace: input.workspaceKey,
      timeoutSeconds: existingConfig?.agent.timeoutSeconds ?? 5400,
      maxConcurrent: existingConfig?.agent.maxConcurrent ?? 1,
    },
    gateway: {
      port: existingConfig?.gateway.port ?? 8787,
      healthPath: existingConfig?.gateway.healthPath ?? "/healthz",
    },
    executor: {
      pollIntervalMs: existingConfig?.executor.pollIntervalMs ?? 1000,
    },
    feishu: {
      allowFrom: [...draft.allowFrom],
      requireMention: draft.requireMention,
    },
    workspaceResolver: {
      registry: workspaceRegistry,
      chatBindings: existingConfig?.workspaceResolver.chatBindings ?? {},
      sandboxModes,
      managedWorkspaceRoot: input.managedWorkspaceRoot,
      templatePath: input.templatePath,
    },
    triggers: {
      scheduledJobs: existingConfig?.triggers.scheduledJobs ?? [],
      webhooks: existingConfig?.triggers.webhooks ?? [],
    },
  };
}

async function ensureWorkspacePath(workspacePath: string) {
  const target = await stat(workspacePath).catch(() => null);
  if (!target?.isDirectory()) {
    throw new InvalidWorkspacePathError(workspacePath);
  }
}

function ensureWorkspaceWithinManagedRoot(input: {
  managedWorkspaceRoot: string;
  workspaceKey: string;
  workspacePath: string;
}) {
  const resolvedRoot = resolve(input.managedWorkspaceRoot);
  const resolvedWorkspace = resolve(input.workspacePath);
  const relativePath = relative(resolvedRoot, resolvedWorkspace);
  const withinRoot = relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));

  if (!withinRoot) {
    throw new InvalidManagedWorkspaceRootError(
      input.workspaceKey,
      input.managedWorkspaceRoot,
      input.workspacePath,
    );
  }
}
