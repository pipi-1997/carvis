import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("Feishu media send integration", () => {
  test("活动 run 内可把本地文件发送到当前 session，并记录 tool event 与 media delivery", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-media-send/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-media-send",
      },
      transportScript: [
        {
          type: "tool_call",
          toolName: "media.send",
          arguments: {
            actionType: "send",
            sourceType: "local_path",
            path: join(workspace, "README.md"),
            mediaKind: "file",
            title: "README",
          },
        },
      ],
    });
    writeFileSync(join(workspace, "README.md"), "# media test\n");

    const response = await harness.postFeishuText("请把 README 直接发给我");
    expect(response.status).toBe(202);

    await harness.executor.processNext();

    const runs = await harness.repositories.runs.listRuns();
    const run = runs[0]!;
    const events = await harness.repositories.events.listEventsByRun(run.id);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "agent.tool_call",
      "agent.tool_result",
      "run.completed",
    ]));

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.filter((delivery) => delivery.deliveryKind === "media_file")).toEqual([
      expect.objectContaining({
        runId: run.id,
        deliveryKind: "media_file",
        status: "sent",
        chatId: "chat-001",
      }),
    ]);

    expect(harness.mediaOperations).toEqual([
      expect.objectContaining({
        action: "send-file",
        chatId: "chat-001",
        fileName: "README.md",
        runId: run.id,
      }),
    ]);

    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
      expect.objectContaining({
        runId: run.id,
        chatId: "chat-001",
        sourceType: "local_path",
        status: "sent",
        mediaKind: "file",
      }),
    ]);
  });
});
