import { describe, expect, test } from "bun:test";

import { createCliDrivenCodexTransport, createHarness } from "../support/harness.ts";

describe("Feishu schedule create integration", () => {
  test("已绑定 workspace 的聊天可通过 carvis-schedule CLI 创建 schedule definition", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-create/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-create",
      },
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "create",
            ...contextArgs,
            "--label",
            "构建失败巡检",
            "--schedule-expr",
            "0 9 * * *",
            "--timezone",
            "Asia/Shanghai",
            "--prompt-template",
            "检查构建失败并总结",
          ];
        },
      }),
    });

    const response = await harness.postFeishuText("每天早上 9 点帮我检查构建失败并总结");
    expect(response.status).toBe(202);

    await harness.executor.processNext();

    const definitions = await harness.repositories.triggerDefinitions.listDefinitions();
    const created = definitions.find((definition) => definition.definitionOrigin === "agent");
    expect(created).toEqual(
      expect.objectContaining({
        sourceType: "scheduled_job",
        definitionOrigin: "agent",
        workspace: harness.agentConfig.workspace,
        label: "构建失败巡检",
        scheduleExpr: "0 9 * * *",
      }),
    );

    const managedResponse = await harness.getInternalManagedSchedules(undefined, {
      workspace: harness.agentConfig.workspace,
    });
    expect(managedResponse.status).toBe(200);
    const body = await managedResponse.json();
    expect(body.definitions).toEqual([
      expect.objectContaining({
        definitionOrigin: "agent",
        label: "构建失败巡检",
        lastManagedResult: "executed",
      }),
    ]);

    const runs = await harness.repositories.runs.listRuns();
    const events = await harness.repositories.events.listEventsByRun(runs[0]!.id);
    expect(events.filter((event) => event.eventType === "agent.tool_call")).toHaveLength(0);
    expect(events.filter((event) => event.eventType === "agent.tool_result")).toHaveLength(0);
  });

  test("CLI 未提供 promptTemplate 时保留原始用户请求，而不是内部包装 prompt", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-create-original/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-create-original",
      },
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "create",
            ...contextArgs,
            "--label",
            "构建失败巡检",
            "--schedule-expr",
            "0 9 * * *",
            "--timezone",
            "Asia/Shanghai",
          ];
        },
      }),
    });

    await harness.postFeishuText("每天早上 9 点帮我检查构建失败并总结");
    await harness.executor.processNext();

    const definitions = await harness.repositories.triggerDefinitions.listDefinitions();
    const created = definitions.find((definition) => definition.definitionOrigin === "agent");
    expect(created?.promptTemplate).toBe("每天早上 9 点帮我检查构建失败并总结");

    const managedResponse = await harness.getInternalManagedSchedules(undefined, {
      workspace: harness.agentConfig.workspace,
    });
    const body = await managedResponse.json();
    expect(body.actions[0]?.requestedText).toBe("每天早上 9 点帮我检查构建失败并总结");
  });
});
