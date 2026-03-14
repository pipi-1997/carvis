import type {
  ChatSandboxOverride,
  CodexSandboxMode,
  RepositoryBundle,
  RuntimeConfig,
  SandboxModeSource,
  Session,
} from "@carvis/core";

import { join } from "node:path";

export const CHAT_SANDBOX_OVERRIDE_TTL_MS = 30 * 60 * 1_000;

export type ResolvedSandboxMode = {
  requestedSandboxMode: CodexSandboxMode | null;
  resolvedSandboxMode: CodexSandboxMode;
  sandboxModeSource: SandboxModeSource;
  sandboxOverride: ChatSandboxOverride | null;
  sandboxOverrideExpired: boolean;
  sandboxOverrideExpiresAt: string | null;
  workspaceKey: string;
  workspacePath: string;
};

export function createSandboxModeResolver(input: {
  defaultWorkspaceKey: string;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
}) {
  return {
    buildOverrideExpiry(now: Date) {
      return new Date(now.getTime() + CHAT_SANDBOX_OVERRIDE_TTL_MS).toISOString();
    },

    resolveWorkspaceDefault(args: {
      workspaceKey?: string;
      workspacePath?: string;
    }): Pick<ResolvedSandboxMode, "requestedSandboxMode" | "resolvedSandboxMode" | "sandboxModeSource" | "workspaceKey" | "workspacePath"> {
      const workspaceKey =
        args.workspaceKey
        ?? findWorkspaceKeyByPath(input.workspaceResolverConfig, args.workspacePath)
        ?? deriveManagedWorkspaceKey(input.workspaceResolverConfig, args.workspacePath);
      if (!workspaceKey) {
        throw new Error(`workspace key not found for sandbox mode resolution: ${args.workspacePath ?? "(missing)"}`);
      }
      const workspacePath =
        input.workspaceResolverConfig.registry[workspaceKey]
        ?? args.workspacePath
        ?? join(input.workspaceResolverConfig.managedWorkspaceRoot, workspaceKey);
      const sandboxMode =
        input.workspaceResolverConfig.sandboxModes?.[workspaceKey]
        ?? input.workspaceResolverConfig.sandboxModes?.[input.defaultWorkspaceKey];
      if (!workspacePath) {
        throw new Error(`workspace not found in registry: ${workspaceKey}`);
      }
      if (!sandboxMode) {
        throw new Error(`workspace sandbox mode not configured: ${workspaceKey}`);
      }
      return {
        requestedSandboxMode: null,
        resolvedSandboxMode: sandboxMode,
        sandboxModeSource: "workspace_default",
        workspaceKey,
        workspacePath,
      };
    },

    async resolveForChat(args: {
      session: Session;
      workspaceKey?: string;
      workspacePath?: string;
      now?: Date;
    }): Promise<ResolvedSandboxMode> {
      const base = this.resolveWorkspaceDefault({
        workspaceKey: args.workspaceKey,
        workspacePath: args.workspacePath,
      });
      const currentTime = args.now ?? new Date();
      const override = await input.repositories.chatSandboxOverrides.getOverrideBySessionId(args.session.id);

      if (!override || override.workspace !== base.workspacePath) {
        return {
          ...base,
          sandboxOverride: null,
          sandboxOverrideExpired: false,
          sandboxOverrideExpiresAt: null,
        };
      }

      if (Date.parse(override.expiresAt) <= currentTime.getTime()) {
        return {
          ...base,
          sandboxOverride: override,
          sandboxOverrideExpired: true,
          sandboxOverrideExpiresAt: override.expiresAt,
        };
      }

      return {
        ...base,
        requestedSandboxMode: override.sandboxMode,
        resolvedSandboxMode: override.sandboxMode,
        sandboxModeSource: "chat_override",
        sandboxOverride: override,
        sandboxOverrideExpired: false,
        sandboxOverrideExpiresAt: override.expiresAt,
      };
    },
  };
}

function findWorkspaceKeyByPath(
  config: RuntimeConfig["workspaceResolver"],
  workspacePath?: string,
) {
  if (!workspacePath) {
    return null;
  }
  return Object.entries(config.registry).find(([, candidatePath]) => candidatePath === workspacePath)?.[0] ?? null;
}

function deriveManagedWorkspaceKey(
  config: RuntimeConfig["workspaceResolver"],
  workspacePath?: string,
) {
  if (!workspacePath) {
    return null;
  }
  const managedRootPrefix = `${config.managedWorkspaceRoot}/`;
  if (!workspacePath.startsWith(managedRootPrefix)) {
    return null;
  }
  const relativePath = workspacePath.slice(managedRootPrefix.length);
  if (relativePath.length === 0 || relativePath.includes("/")) {
    return null;
  }
  return relativePath;
}
