import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RuntimeConfigFixture = {
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
    managedWorkspaceRoot: string;
    templatePath: string;
  };
  triggers: {
    scheduledJobs: Array<{
      id: string;
      enabled: boolean;
      workspace: string;
      agentId?: string;
      schedule: string;
      timezone?: string | null;
      promptTemplate: string;
      delivery: {
        kind: "none" | "feishu_chat";
        chatId?: string | null;
        label?: string | null;
      };
    }>;
    webhooks: Array<{
      id: string;
      enabled: boolean;
      slug: string;
      workspace: string;
      agentId?: string;
      promptTemplate: string;
      requiredFields: string[];
      optionalFields?: string[];
      secretEnv: string;
      replayWindowSeconds?: number;
      delivery: {
        kind: "none" | "feishu_chat";
        chatId?: string | null;
        label?: string | null;
      };
    }>;
  };
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends Record<string, unknown>
      ? DeepPartial<T[K]>
      : T[K];
};

function mergeStringRecord(
  base: Record<string, string>,
  override?: DeepPartial<Record<string, string>>,
): Record<string, string> {
  const merged: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }
  return merged;
}

type RuntimeHarnessOptions = {
  config?: DeepPartial<RuntimeConfigFixture>;
  env?: Partial<Record<string, string>>;
  presentation?: {
    failCardCreate?: boolean;
    failCardUpdate?: boolean;
  };
};

type RuntimeHarness = {
  cleanup: () => Promise<void>;
  env: Record<string, string>;
  paths: {
    configDir: string;
    configFile: string;
    homeDir: string;
    defaultWorkspaceDir: string;
    managedWorkspaceRoot: string;
    templateDir: string;
  };
  writeConfig: (config: RuntimeConfigFixture) => Promise<void>;
};

const DEFAULT_ENV = {
  FEISHU_APP_ID: "cli_test_app",
  FEISHU_APP_SECRET: "test_app_secret",
  POSTGRES_URL: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
  REDIS_URL: "redis://127.0.0.1:6379/1",
};

function mergeRuntimeConfig(
  baseConfig: RuntimeConfigFixture,
  overrideConfig?: DeepPartial<RuntimeConfigFixture>,
): RuntimeConfigFixture {
  if (!overrideConfig) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...overrideConfig,
    agent: {
      ...baseConfig.agent,
      ...overrideConfig.agent,
    },
    gateway: {
      ...baseConfig.gateway,
      ...overrideConfig.gateway,
    },
    executor: {
      ...baseConfig.executor,
      ...overrideConfig.executor,
    },
    feishu: {
      ...baseConfig.feishu,
      ...overrideConfig.feishu,
    },
    workspaceResolver: {
      ...baseConfig.workspaceResolver,
      ...overrideConfig.workspaceResolver,
      registry: mergeStringRecord(baseConfig.workspaceResolver.registry, overrideConfig.workspaceResolver?.registry),
      chatBindings: mergeStringRecord(
        baseConfig.workspaceResolver.chatBindings,
        overrideConfig.workspaceResolver?.chatBindings,
      ),
    },
    triggers: {
      scheduledJobs: overrideConfig.triggers?.scheduledJobs
        ? (overrideConfig.triggers.scheduledJobs as RuntimeConfigFixture["triggers"]["scheduledJobs"])
        : baseConfig.triggers.scheduledJobs,
      webhooks: overrideConfig.triggers?.webhooks
        ? (overrideConfig.triggers.webhooks as RuntimeConfigFixture["triggers"]["webhooks"])
        : baseConfig.triggers.webhooks,
    },
  };
}

function createDefaultRuntimeConfig(paths: {
  defaultWorkspaceDir: string;
  managedWorkspaceRoot: string;
  templateDir: string;
}): RuntimeConfigFixture {
  return {
    agent: {
      id: "codex-main",
      bridge: "codex",
      defaultWorkspace: "main",
      timeoutSeconds: 60,
      maxConcurrent: 1,
    },
    gateway: {
      port: 8787,
      healthPath: "/healthz",
    },
    executor: {
      pollIntervalMs: 1000,
    },
    feishu: {
      allowFrom: ["*"],
      requireMention: false,
    },
    workspaceResolver: {
      registry: {
        main: paths.defaultWorkspaceDir,
      },
      chatBindings: {},
      managedWorkspaceRoot: paths.managedWorkspaceRoot,
      templatePath: paths.templateDir,
    },
    triggers: {
      scheduledJobs: [],
      webhooks: [],
    },
  };
}

export async function createRuntimeHarness(
  options: RuntimeHarnessOptions = {},
): Promise<RuntimeHarness> {
  const homeDir = await mkdtemp(join(tmpdir(), "carvis-runtime-"));
  const configDir = join(homeDir, ".carvis");
  const configFile = join(configDir, "config.json");
  const managedWorkspaceRoot = join(homeDir, "managed-workspaces");
  const defaultWorkspaceDir = join(managedWorkspaceRoot, "main");
  const templateDir = join(homeDir, "templates", "default-workspace");
  const config = mergeRuntimeConfig(
    createDefaultRuntimeConfig({
      defaultWorkspaceDir,
      managedWorkspaceRoot,
      templateDir,
    }),
    options.config,
  );

  await mkdir(configDir, { recursive: true });
  await mkdir(defaultWorkspaceDir, { recursive: true });
  await mkdir(config.workspaceResolver.managedWorkspaceRoot, { recursive: true });
  await mkdir(config.workspaceResolver.templatePath, { recursive: true });
  await writeStarterTemplate(config.workspaceResolver.templatePath);
  await writeFile(configFile, JSON.stringify(config, null, 2));

  return {
    async cleanup() {
      await rm(homeDir, { force: true, recursive: true });
    },
    env: {
      ...DEFAULT_ENV,
      ...options.env,
      ...(options.presentation?.failCardCreate ? { CARVIS_FAIL_CARD_CREATE: "1" } : {}),
      ...(options.presentation?.failCardUpdate ? { CARVIS_FAIL_CARD_UPDATE: "1" } : {}),
      HOME: homeDir,
    },
    paths: {
      configDir,
      configFile,
      homeDir,
      defaultWorkspaceDir,
      managedWorkspaceRoot: config.workspaceResolver.managedWorkspaceRoot,
      templateDir: config.workspaceResolver.templatePath,
    },
    async writeConfig(nextConfig: RuntimeConfigFixture) {
      await writeFile(configFile, JSON.stringify(nextConfig, null, 2));
    },
  };
}

async function writeStarterTemplate(templateDir: string) {
  await writeFile(join(templateDir, "README.md"), "# runtime template\n\nManaged workspace starter.\n");
  await writeFile(join(templateDir, ".gitignore"), ".DS_Store\nnode_modules/\n.codex/\n");
  await writeFile(
    join(templateDir, "AGENTS.md"),
    "This is a managed workspace starter. Keep work local to this directory.\n",
  );
}
