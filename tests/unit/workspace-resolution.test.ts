import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createWorkspaceProvisioner } from "../../apps/gateway/src/services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "../../apps/gateway/src/services/workspace-resolver.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("workspace resolution", () => {
  test("private prompt 会解析到 default workspace 并持久化 default binding", async () => {
    const repositories = createInMemoryRepositories();
    const tempRoot = mkdtempSync(join(tmpdir(), "carvis-workspace-resolution-"));
    const templatePath = join(tempRoot, "template");
    const managedWorkspaceRoot = join(tempRoot, "managed");
    const workspaceProvisioner = createWorkspaceProvisioner({
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: TEST_AGENT_CONFIG.workspace,
        },
        chatBindings: {},
        managedWorkspaceRoot,
        templatePath,
      },
    });
    const resolver = createWorkspaceResolver({
      agentConfig: TEST_AGENT_CONFIG,
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: TEST_AGENT_CONFIG.workspace,
        },
        chatBindings: {},
        managedWorkspaceRoot,
        templatePath,
      },
      workspaceProvisioner,
    });
    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "p2p-001",
      agentConfig: TEST_AGENT_CONFIG,
    });

    const resolved = await resolver.resolveForPrompt({
      session,
      chatType: "private",
    });

    expect(resolved).toMatchObject({
      kind: "resolved",
      workspaceKey: "main",
      bindingSource: "default",
      workspacePath: TEST_AGENT_CONFIG.workspace,
    });
    const binding = await repositories.sessionWorkspaceBindings.getBindingBySessionId(session.id);
    expect(binding).toMatchObject({
      workspaceKey: "main",
      bindingSource: "default",
    });
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("group prompt 未命中 binding 时返回 unbound", async () => {
    const repositories = createInMemoryRepositories();
    const tempRoot = mkdtempSync(join(tmpdir(), "carvis-workspace-resolution-"));
    const resolverConfig = {
      registry: {
        main: TEST_AGENT_CONFIG.workspace,
      },
      chatBindings: {},
      managedWorkspaceRoot: join(tempRoot, "managed"),
      templatePath: join(tempRoot, "template"),
    };
    const workspaceProvisioner = createWorkspaceProvisioner({
      repositories,
      workspaceResolverConfig: resolverConfig,
    });
    const resolver = createWorkspaceResolver({
      agentConfig: TEST_AGENT_CONFIG,
      repositories,
      workspaceResolverConfig: resolverConfig,
      workspaceProvisioner,
    });
    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-unbound",
      agentConfig: TEST_AGENT_CONFIG,
    });

    const resolved = await resolver.resolveForPrompt({
      session,
      chatType: "group",
    });

    expect(resolved).toMatchObject({
      kind: "unbound",
      bindingSource: "unbound",
    });
    expect((resolved.kind === "unbound" ? resolved.message : "")).toContain("/bind <workspace-key>");
    expect(await repositories.sessionWorkspaceBindings.getBindingBySessionId(session.id)).toBeNull();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("createWorkspace 会复制 template 并注册 catalog", async () => {
    const repositories = createInMemoryRepositories();
    const tempRoot = mkdtempSync(join(tmpdir(), "carvis-workspace-resolution-"));
    const templatePath = join(tempRoot, "template");
    const managedWorkspaceRoot = join(tempRoot, "managed");
    mkdirSync(templatePath, { recursive: true });
    const provisioner = createWorkspaceProvisioner({
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: TEST_AGENT_CONFIG.workspace,
        },
        chatBindings: {},
        managedWorkspaceRoot,
        templatePath,
      },
    });

    await Bun.write(join(templatePath, "README.md"), "# template\n");
    const created = await provisioner.createWorkspace("feature-a");

    expect(created.workspaceKey).toBe("feature-a");
    expect(created.templateRef).toBe(templatePath);
    const catalogEntry = await repositories.workspaceCatalog.getEntryByWorkspaceKey("feature-a");
    expect(catalogEntry?.workspacePath).toBe(join(managedWorkspaceRoot, "feature-a"));
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("createWorkspace 在 template 缺失时抛出清晰错误", async () => {
    const repositories = createInMemoryRepositories();
    const tempRoot = mkdtempSync(join(tmpdir(), "carvis-workspace-resolution-"));
    const templatePath = join(tempRoot, "missing-template");
    const managedWorkspaceRoot = join(tempRoot, "managed");
    const provisioner = createWorkspaceProvisioner({
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: TEST_AGENT_CONFIG.workspace,
        },
        chatBindings: {},
        managedWorkspaceRoot,
        templatePath,
      },
    });

    await expect(provisioner.createWorkspace("feature-b")).rejects.toThrow("workspace template unavailable");
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("createWorkspace 在托管根目录不可写时抛出清晰错误", async () => {
    const repositories = createInMemoryRepositories();
    const tempRoot = mkdtempSync(join(tmpdir(), "carvis-workspace-resolution-"));
    const templatePath = join(tempRoot, "template");
    const managedWorkspaceRoot = join(tempRoot, "managed-root-file");
    mkdirSync(templatePath, { recursive: true });
    await Bun.write(join(templatePath, "README.md"), "# template\n");
    await Bun.write(managedWorkspaceRoot, "not-a-directory");
    const provisioner = createWorkspaceProvisioner({
      repositories,
      workspaceResolverConfig: {
        registry: {
          main: TEST_AGENT_CONFIG.workspace,
        },
        chatBindings: {},
        managedWorkspaceRoot,
        templatePath,
      },
    });

    await expect(provisioner.createWorkspace("feature-c")).rejects.toThrow("workspace create failed");
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
