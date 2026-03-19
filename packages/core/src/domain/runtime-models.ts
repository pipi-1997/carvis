import type { AgentConfig, TriggerDeliveryTarget } from "./models.ts";

export interface RuntimeSecrets {
  feishuAppId: string;
  feishuAppSecret: string;
  postgresUrl: string;
  redisUrl: string;
}

export interface FeishuConnectionConfig {
  allowFrom: string[];
  requireMention: boolean;
}

export interface GatewayConfig {
  port: number;
  healthPath: string;
}

export interface ExecutorConfig {
  pollIntervalMs: number;
}

export interface WorkspaceResolverConfig {
  registry: Record<string, string>;
  chatBindings: Record<string, string>;
  sandboxModes: Record<string, import("./models.ts").CodexSandboxMode>;
  managedWorkspaceRoot: string;
  templatePath: string;
}

export interface ScheduledJobRuntimeDefinition {
  id: string;
  enabled: boolean;
  workspace: string;
  agentId: string;
  schedule: string;
  timezone: string | null;
  promptTemplate: string;
  delivery: TriggerDeliveryTarget;
}

export interface ExternalWebhookRuntimeDefinition {
  id: string;
  enabled: boolean;
  slug: string;
  workspace: string;
  agentId: string;
  promptTemplate: string;
  requiredFields: string[];
  optionalFields: string[];
  secretEnv: string;
  secret: string;
  replayWindowSeconds: number;
  delivery: TriggerDeliveryTarget;
}

export interface TriggerConfig {
  scheduledJobs: ScheduledJobRuntimeDefinition[];
  webhooks: ExternalWebhookRuntimeDefinition[];
}

export interface RuntimeConfig {
  agent: AgentConfig;
  gateway: GatewayConfig;
  executor: ExecutorConfig;
  feishu: FeishuConnectionConfig;
  workspaceResolver: WorkspaceResolverConfig;
  triggers: TriggerConfig;
  secrets: RuntimeSecrets;
}

export interface RuntimeErrorState {
  code: string;
  message: string;
}

export interface GatewayRuntimeState {
  httpListening: boolean;
  configValid: boolean;
  feishuReady: boolean;
  feishuIngressReady: boolean;
  configFingerprint: string;
  ready: boolean;
  lastError: RuntimeErrorState | null;
}

export interface ExecutorRuntimeState {
  configValid: boolean;
  postgresReady: boolean;
  redisReady: boolean;
  codexReady: boolean;
  consumerActive: boolean;
  configFingerprint: string;
  lastError: RuntimeErrorState | null;
}

export interface ExecutorStartupReport {
  role: "executor";
  status: RuntimeStatus;
  configFingerprint: string;
  postgresReady: boolean;
  redisReady: boolean;
  codexReady: boolean;
  consumerActive: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface RuntimeDependencyTargets {
  postgresTarget: string;
  redisTarget: string;
}

export interface RuntimeFingerprintInput {
  agentId: string;
  bridge: AgentConfig["bridge"];
  defaultWorkspace: string;
  workspace: string;
  workspaceRegistryEntries: string[];
  workspaceChatBindings: string[];
  workspaceSandboxModeEntries: string[];
  managedWorkspaceRoot: string;
  templatePath: string;
  feishuAllowFrom: string[];
  feishuRequireMention: boolean;
  feishuAppId: string;
  postgresTarget: string;
  redisTarget: string;
  triggerDefinitionEntries: string[];
}

export type RuntimeStatus = "starting" | "ready" | "degraded" | "failed";

export type ManagedInstallStatus = "missing" | "installed" | "partial" | "drifted";
export type ManagedObservedState = "missing" | "stopped" | "starting" | "ready" | "degraded" | "failed";
export type ManagedDesiredState = "running" | "stopped";
export type ServiceManagerKind = "launchd_user" | "systemd_user";
export type DaemonServiceObservedState = "not_installed" | "stopped" | "starting" | "ready" | "degraded" | "failed";
export type LayeredStatus = "missing" | "stopped" | "starting" | "installed" | "ready" | "degraded" | "failed";
export type ExternalDependencyId = "codex_cli" | "feishu_credentials";
export type LocalUninstallScope = "remove_runtime_only" | "remove_runtime_keep_data" | "purge_all";

export interface ManagedBundleComponent {
  program: string;
  args: string[];
}

export interface ManagedBundle {
  version: string;
  bundlePath: string;
  platform: string;
  checksum: string;
  components: Record<string, ManagedBundleComponent>;
  installedAt?: string;
}

export interface ManagedInstallManifest {
  installRoot: string;
  activeVersion: string | null;
  activeBundlePath: string | null;
  platform: string;
  serviceManager: ServiceManagerKind | null;
  serviceDefinitionPath: string | null;
  installedAt: string | null;
  lastRepairAt: string | null;
  status: ManagedInstallStatus;
  bundle?: ManagedBundle;
}

export interface ManagedInfraComponentState {
  componentId: "postgres" | "redis";
  version?: string | null;
  binaryPath?: string | null;
  dataDir?: string | null;
  pid?: number | null;
  port?: number | null;
  desiredState: ManagedDesiredState;
  observedState: ManagedObservedState;
  health?: "unknown" | "healthy" | "unhealthy";
  lastStartedAt?: string | null;
  lastHealthcheckAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  summary?: string;
}

export interface ExternalDependencyStatus {
  dependencyId: ExternalDependencyId;
  status: "ready" | "failed" | "missing";
  checkedAt?: string | null;
  detail?: string | null;
  lastErrorCode?: string | null;
  summary?: string;
}

export interface DaemonServiceState {
  serviceState: DaemonServiceObservedState;
  pid?: number | null;
  socketPath: string;
  socketReachable?: boolean;
  version?: string | null;
  lastStartedAt?: string | null;
  lastReconcileAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  logPath?: string | null;
  summary?: string;
}

export interface RuntimeComponentState {
  componentId: "gateway" | "executor";
  pid?: number | null;
  status: RuntimeStatus | "stopped";
  ready?: boolean;
  healthSnapshot?: GatewayRuntimeState | null;
  startupReport?: ExecutorStartupReport | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  configFingerprint?: string | null;
  summary?: string;
}

export interface LayeredStatusLayer<TComponent = Record<string, unknown>> {
  status: LayeredStatus;
  summary: string;
  components?: TComponent;
  recommendedAction?: string | null;
}

export interface LayeredStatusSnapshot {
  install: LayeredStatusLayer<ManagedInstallManifest>;
  infra: LayeredStatusLayer<Record<string, ManagedInfraComponentState>>;
  externalDependencies: LayeredStatusLayer<Record<string, ExternalDependencyStatus>>;
  daemon: LayeredStatusLayer<DaemonServiceState>;
  runtime: LayeredStatusLayer<Record<string, RuntimeComponentState>>;
  overallStatus: RuntimeStatus | "stopped";
  recommendedActions: string[];
}

export interface LayeredDoctorCheck {
  checkId: string;
  layer: "install" | "infra" | "external_dependency" | "daemon" | "runtime";
  status: "passed" | "failed" | "skipped";
  message: string;
  detail?: string;
  recommendedAction?: string;
}

export interface LayeredDoctorReport {
  checks: LayeredDoctorCheck[];
  failedChecks: LayeredDoctorCheck[];
  installLayer: LayeredStatusLayer<ManagedInstallManifest>;
  infraLayer: LayeredStatusLayer<Record<string, ManagedInfraComponentState>>;
  externalDependencyLayer: LayeredStatusLayer<Record<string, ExternalDependencyStatus>>;
  daemonLayer: LayeredStatusLayer<DaemonServiceState>;
  runtimeLayer: LayeredStatusLayer<Record<string, RuntimeComponentState>>;
  status: "passed" | "failed";
  summary: string;
}

export interface DaemonControlRequest {
  requestId: string;
  action:
    | "daemon_status"
    | "daemon_restart"
    | "daemon_stop"
    | "infra_rebuild"
    | "infra_restart"
    | "infra_start"
    | "infra_status"
    | "infra_stop"
    | "runtime_reconcile";
  scope?: "daemon" | "infra" | "runtime";
  requestedAt: string;
  arguments?: Record<string, unknown>;
}
