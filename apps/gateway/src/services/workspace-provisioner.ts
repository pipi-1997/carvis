import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { RepositoryBundle, RuntimeConfig, WorkspaceCatalogEntry } from "@carvis/core";

export type ResolvedWorkspaceTarget = {
  workspaceKey: string;
  workspacePath: string;
};

export function validateWorkspaceKey(workspaceKey: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workspaceKey)) {
    return "workspace key 只能包含字母、数字、点、下划线和短横线，且不能包含路径分隔符";
  }

  return null;
}

export function createWorkspaceProvisioner(input: {
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
}) {
  return {
    async createWorkspace(workspaceKey: string): Promise<WorkspaceCatalogEntry> {
      const validationError = validateWorkspaceKey(workspaceKey);
      if (validationError) {
        throw new Error(validationError);
      }

      const existing = await this.resolveWorkspace(workspaceKey);
      if (existing) {
        throw new Error(`workspace already exists: ${workspaceKey}`);
      }

      const workspacePath = join(input.workspaceResolverConfig.managedWorkspaceRoot, workspaceKey);
      try {
        await mkdir(input.workspaceResolverConfig.managedWorkspaceRoot, { recursive: true });
        await cp(input.workspaceResolverConfig.templatePath, workspacePath, {
          errorOnExist: true,
          recursive: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(input.workspaceResolverConfig.templatePath)) {
          throw new Error(`workspace template unavailable: ${message}`);
        }
        throw new Error(`workspace create failed: ${message}`);
      }

      return input.repositories.workspaceCatalog.createEntry({
        workspaceKey,
        workspacePath,
        provisionSource: "template_created",
        templateRef: input.workspaceResolverConfig.templatePath,
      });
    },

    async resolveWorkspace(workspaceKey: string): Promise<ResolvedWorkspaceTarget | null> {
      const configuredPath = input.workspaceResolverConfig.registry[workspaceKey];
      if (configuredPath) {
        return {
          workspaceKey,
          workspacePath: configuredPath,
        };
      }

      const catalogEntry = await input.repositories.workspaceCatalog.getEntryByWorkspaceKey(workspaceKey);
      if (!catalogEntry) {
        return null;
      }

      return {
        workspaceKey: catalogEntry.workspaceKey,
        workspacePath: catalogEntry.workspacePath,
      };
    },
  };
}
