import type { AgentConfig, RepositoryBundle, RuntimeConfig, Session, WorkspaceBindingSource } from "@carvis/core";

import type { createWorkspaceProvisioner } from "./workspace-provisioner.ts";

export type ResolvedWorkspace =
  | {
      kind: "resolved";
      workspaceKey: string;
      workspacePath: string;
      bindingSource: Exclude<WorkspaceBindingSource, "unbound">;
    }
  | {
      kind: "unbound";
      bindingSource: "unbound";
      message: string;
    };

const UNBOUND_GROUP_MESSAGE =
  "当前群聊未绑定 workspace，普通消息不会执行。请先使用 /bind <workspace-key>。";

export function createWorkspaceResolver(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  workspaceProvisioner: ReturnType<typeof createWorkspaceProvisioner>;
}) {
  return {
    async resolveForPrompt(args: {
      session: Session;
      chatType: "private" | "group";
      now?: Date;
    }): Promise<ResolvedWorkspace> {
      const existingBinding = await input.repositories.sessionWorkspaceBindings.getBindingBySessionId(
        args.session.id,
      );

      if (existingBinding) {
        return resolveAndPersistBinding({
          session: args.session,
          workspaceKey: existingBinding.workspaceKey,
          bindingSource: existingBinding.bindingSource,
          now: args.now,
        });
      }

      if (args.chatType === "private") {
        return resolveAndPersistBinding({
          session: args.session,
          workspaceKey: input.agentConfig.defaultWorkspace,
          bindingSource: "default",
          now: args.now,
        });
      }

      const configuredWorkspaceKey = input.workspaceResolverConfig.chatBindings[args.session.chatId];
      if (configuredWorkspaceKey) {
        return resolveAndPersistBinding({
          session: args.session,
          workspaceKey: configuredWorkspaceKey,
          bindingSource: "config",
          now: args.now,
        });
      }

      return {
        kind: "unbound",
        bindingSource: "unbound",
        message: UNBOUND_GROUP_MESSAGE,
      };
    },

    async resolveCurrentBinding(args: {
      session: Session;
      chatType: "private" | "group";
      now?: Date;
    }): Promise<ResolvedWorkspace> {
      return this.resolveForPrompt(args);
    },
  };

  async function resolveAndPersistBinding(inputBinding: {
    session: Session;
    workspaceKey: string;
    bindingSource: Exclude<WorkspaceBindingSource, "unbound">;
    now?: Date;
  }): Promise<ResolvedWorkspace> {
    const resolvedWorkspace = await input.workspaceProvisioner.resolveWorkspace(inputBinding.workspaceKey);
    if (!resolvedWorkspace) {
      throw new Error(`workspace key not found: ${inputBinding.workspaceKey}`);
    }

    await input.repositories.sessionWorkspaceBindings.saveBinding({
      session: inputBinding.session,
      workspaceKey: inputBinding.workspaceKey,
      bindingSource: inputBinding.bindingSource,
      now: inputBinding.now,
    });

    return {
      kind: "resolved",
      workspaceKey: resolvedWorkspace.workspaceKey,
      workspacePath: resolvedWorkspace.workspacePath,
      bindingSource: inputBinding.bindingSource,
    };
  }
}

export { UNBOUND_GROUP_MESSAGE };
