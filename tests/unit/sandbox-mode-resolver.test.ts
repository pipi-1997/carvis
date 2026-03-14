import { describe, expect, test } from "bun:test";

import { createSandboxModeResolver } from "../../apps/gateway/src/services/sandbox-mode-resolver.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("sandbox mode resolver", () => {
  test("托管 workspace 未出现在 registry 时继承 defaultWorkspace 的 sandbox mode", () => {
    const repositories = createInMemoryRepositories();
    const resolver = createSandboxModeResolver({
      defaultWorkspaceKey: TEST_AGENT_CONFIG.defaultWorkspace,
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: "/tmp/carvis-main",
        },
        chatBindings: {},
        sandboxModes: {
          main: "danger-full-access",
        },
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
    });

    expect(
      resolver.resolveWorkspaceDefault({
        workspacePath: "/tmp/carvis-managed/feature-a",
      }),
    ).toEqual({
      requestedSandboxMode: null,
      resolvedSandboxMode: "danger-full-access",
      sandboxModeSource: "workspace_default",
      workspaceKey: "feature-a",
      workspacePath: "/tmp/carvis-managed/feature-a",
    });
  });

  test("旧 workspace 的 override 不应泄漏到当前 workspace 状态", async () => {
    const repositories = createInMemoryRepositories();
    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: {
        ...TEST_AGENT_CONFIG,
        workspace: "/tmp/carvis-main",
      },
    });
    await repositories.chatSandboxOverrides.upsertOverride({
      sessionId: session.id,
      chatId: session.chatId,
      agentId: session.agentId,
      workspace: "/tmp/carvis-managed/feature-a",
      sandboxMode: "danger-full-access",
      expiresAt: "2026-03-14T13:00:00.000Z",
      setByUserId: "user-001",
      now: new Date("2026-03-14T12:00:00.000Z"),
    });

    const resolver = createSandboxModeResolver({
      defaultWorkspaceKey: TEST_AGENT_CONFIG.defaultWorkspace,
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: "/tmp/carvis-main",
        },
        chatBindings: {},
        sandboxModes: {
          main: "workspace-write",
        },
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
    });

    const resolved = await resolver.resolveForChat({
      session,
      workspaceKey: "main",
      workspacePath: "/tmp/carvis-main",
      now: new Date("2026-03-14T12:10:00.000Z"),
    });

    expect(resolved.resolvedSandboxMode).toBe("workspace-write");
    expect(resolved.sandboxModeSource).toBe("workspace_default");
    expect(resolved.sandboxOverride).toBeNull();
    expect(resolved.sandboxOverrideExpiresAt).toBeNull();
    expect(resolved.sandboxOverrideExpired).toBe(false);
  });
});
