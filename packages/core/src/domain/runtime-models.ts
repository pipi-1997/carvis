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
