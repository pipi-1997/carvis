import type { AgentConfig } from "./models.ts";

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

export interface RuntimeConfig {
  agent: AgentConfig;
  gateway: GatewayConfig;
  executor: ExecutorConfig;
  feishu: FeishuConnectionConfig;
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
  workspace: string;
  feishuAllowFrom: string[];
  feishuRequireMention: boolean;
  feishuAppId: string;
  postgresTarget: string;
  redisTarget: string;
}

export type RuntimeStatus = "starting" | "ready" | "degraded" | "failed";
