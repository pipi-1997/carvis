import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { AgentConfig } from "../domain/models.ts";

export const DEFAULT_AGENT_CONFIG_PATH = resolve(homedir(), ".carvis", "config.json");

export function validateAgentConfig(config: AgentConfig): AgentConfig {
  if (!config.id) {
    throw new Error("agent.id is required");
  }
  if (config.bridge !== "codex") {
    throw new Error("agent.bridge must be codex");
  }
  if (!config.defaultWorkspace) {
    throw new Error("agent.defaultWorkspace is required");
  }
  if (!config.workspace) {
    throw new Error("agent.workspace is required");
  }
  if (config.timeoutSeconds <= 0) {
    throw new Error("agent.timeoutSeconds must be > 0");
  }
  if (config.maxConcurrent <= 0) {
    throw new Error("agent.maxConcurrent must be > 0");
  }

  return config;
}

export async function loadAgentConfig(configPath = DEFAULT_AGENT_CONFIG_PATH): Promise<AgentConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`agent config not found: ${configPath}`);
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as {
    agent?: Omit<AgentConfig, "workspace"> & { workspace?: string };
    workspaceResolver?: { registry?: Record<string, string> };
  };

  if (!parsed.agent) {
    throw new Error("config.agent is required");
  }

  const resolvedWorkspace =
    parsed.agent.workspace ??
    (parsed.workspaceResolver?.registry ? parsed.workspaceResolver.registry[parsed.agent.defaultWorkspace] : undefined);

  if (!resolvedWorkspace) {
    throw new Error("agent.defaultWorkspace must exist in workspaceResolver.registry");
  }

  return validateAgentConfig({
    ...parsed.agent,
    workspace: resolvedWorkspace,
  });
}
