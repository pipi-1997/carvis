import { describe, expect, test } from "bun:test";

import { CodexBridge, createScriptedCodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import type { RunRequest } from "../../packages/core/src/domain/models.ts";

const baseRequest: RunRequest = {
  id: "run-001",
  sessionId: "session-001",
  agentId: "codex-main",
  workspace: "/tmp/carvis-workspace",
  prompt: "帮我总结仓库目标",
  triggerMessageId: "msg-001",
  triggerUserId: "user-001",
  timeoutSeconds: 60,
  createdAt: "2026-03-08T00:00:00.000Z",
};

describe("CodexBridge", () => {
  test("将脚本化 transport 输出映射为 delta、摘要和完成事件", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        { type: "delta", deltaText: "正在", sequence: 1, source: "assistant" },
        { type: "delta", deltaText: "分析", sequence: 2, source: "assistant" },
        { type: "summary", summary: "正在分析", sequence: 1 },
        { type: "result", resultSummary: "总结完成", bridgeSessionId: "thread-001", sessionOutcome: "created" },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun(baseRequest);
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    for await (const event of handle.streamEvents()) {
      events.push({
        eventType: event.eventType,
        payload: event.payload as Record<string, unknown>,
      });
    }

    expect(events.map((event) => event.eventType)).toEqual([
      "agent.output.delta",
      "agent.output.delta",
      "agent.summary",
      "run.completed",
    ]);
    expect(events[0]?.payload).toEqual({
      delta_text: "正在",
      run_id: "run-001",
      sequence: 1,
      source: "assistant",
    });
    expect(events[1]?.payload).toEqual({
      delta_text: "分析",
      run_id: "run-001",
      sequence: 2,
      source: "assistant",
    });
    expect(events[3]?.payload).toEqual({
      run_id: "run-001",
      finished_at: "2026-03-08T00:00:00.000Z",
      result_summary: "总结完成",
      bridge_session_id: "thread-001",
      session_outcome: "created",
    });
    expect(await bridge.healthcheck()).toEqual({
      ok: true,
      message: "codex bridge ready",
    });
  });

  test("续聊模式会把 bridge session 元数据带到完成事件", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        {
          type: "result",
          resultSummary: "继续上下文完成",
          bridgeSessionId: "thread-continued",
          sessionOutcome: "continued",
        },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun({
      ...baseRequest,
      bridgeSessionId: "thread-continued",
      sessionMode: "continuation",
    });
    const events = [];
    for await (const event of handle.streamEvents()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("run.completed");
    expect(events[0]?.payload).toEqual({
      run_id: "run-001",
      finished_at: "2026-03-08T00:00:00.000Z",
      result_summary: "继续上下文完成",
      bridge_session_id: "thread-continued",
      session_outcome: "continued",
    });
  });

  test("支持取消当前运行", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        { type: "wait-for-cancel" },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun(baseRequest);
    await bridge.cancelRun(baseRequest.id);

    const events = [];
    for await (const event of handle.streamEvents()) {
      events.push(event.eventType);
    }

    expect(events).toEqual(["run.cancelled"]);
  });

  test("底层续聊 session 无效时会在失败事件中标记 session_invalid", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        {
          type: "error",
          failureCode: "codex_exec_failed",
          failureMessage: "session not found",
          sessionInvalid: true,
        },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun({
      ...baseRequest,
      bridgeSessionId: "thread-missing",
      sessionMode: "continuation",
    });
    const events = [];
    for await (const event of handle.streamEvents()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("run.failed");
    expect(events[0]?.payload).toEqual({
      run_id: "run-001",
      failure_code: "codex_exec_failed",
      failure_message: "session not found",
      session_invalid: true,
    });
  });

  test("management mode 可以产出工具调用并在提交 tool result 后完成运行", async () => {
    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        {
          type: "tool_call",
          toolName: "schedule.create",
          arguments: {
            workspace: "/tmp/carvis-workspace",
            actionType: "create",
            label: "日报",
            scheduleExpr: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
          },
        },
      ]),
      now: () => new Date("2026-03-08T00:00:00.000Z"),
    });

    const handle = await bridge.startRun({
      ...baseRequest,
      managementMode: "schedule",
    });

    const iterator = handle.streamEvents()[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value?.eventType).toBe("agent.tool_call");
    expect(first.value?.payload).toEqual({
      run_id: "run-001",
      tool_name: "schedule.create",
      arguments: {
        workspace: "/tmp/carvis-workspace",
        actionType: "create",
        label: "日报",
        scheduleExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
    });

    await handle.submitToolResult({
      toolName: "schedule.create",
      result: {
        status: "executed",
        targetDefinitionId: "daily-report",
        summary: "已创建日报",
      },
    });

    const second = await iterator.next();
    expect(second.value?.eventType).toBe("run.completed");
    expect(second.value?.payload).toEqual({
      run_id: "run-001",
      finished_at: "2026-03-08T00:00:00.000Z",
      result_summary: "已创建日报",
    });
  });
});
