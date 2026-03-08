import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type RuntimeConfigFixture = {
  agent: {
    id: string;
    bridge: string;
    workspace: string;
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
};

type RuntimeHarnessOptions = {
  config?: Partial<RuntimeConfigFixture>;
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
  };
  writeConfig: (config: RuntimeConfigFixture) => Promise<void>;
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfigFixture = {
  agent: {
    id: "codex-main",
    bridge: "codex",
    workspace: "/tmp/carvis-runtime-workspace",
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
};

const DEFAULT_ENV = {
  FEISHU_APP_ID: "cli_test_app",
  FEISHU_APP_SECRET: "test_app_secret",
  POSTGRES_URL: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
  REDIS_URL: "redis://127.0.0.1:6379/1",
};

function mergeRuntimeConfig(
  baseConfig: RuntimeConfigFixture,
  overrideConfig?: Partial<RuntimeConfigFixture>,
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
  };
}

export async function createRuntimeHarness(
  options: RuntimeHarnessOptions = {},
): Promise<RuntimeHarness> {
  const homeDir = await mkdtemp(join(tmpdir(), "carvis-runtime-"));
  const configDir = join(homeDir, ".carvis");
  const configFile = join(configDir, "config.json");
  const config = mergeRuntimeConfig(DEFAULT_RUNTIME_CONFIG, options.config);

  await mkdir(configDir, { recursive: true });
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
    },
    async writeConfig(nextConfig: RuntimeConfigFixture) {
      await writeFile(configFile, JSON.stringify(nextConfig, null, 2));
    },
  };
}
