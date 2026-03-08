import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("terminal card integration", () => {
  test("成功、失败、取消都切换为对应终态摘要卡且不补发第二条成功消息", async () => {
    const completed = createHarness({
      transportScript: [
        { type: "delta", deltaText: "正在分析", sequence: 1, source: "assistant" },
        { type: "result", resultSummary: "已完成" },
      ],
    });
    await completed.postFeishuText("成功路径");
    await completed.executor.processNext();
    expect(completed.presentationOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "complete-card", status: "completed", title: "已完成" }),
      ]),
    );
    expect(completed.presentationOperations.some((operation) => operation.action === "send-fallback-terminal")).toBe(false);

    const failed = createHarness({
      transportScript: [{ type: "error", failureCode: "bridge_error", failureMessage: "命令执行失败" }],
    });
    await failed.postFeishuText("失败路径");
    await failed.executor.processNext();
    expect(failed.presentationOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "complete-card", status: "failed", title: "运行失败" }),
      ]),
    );

    const cancelled = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });
    await cancelled.postFeishuText("取消路径");
    const process = cancelled.executor.processNext();
    await cancelled.waitForRunStatus("running");
    const run = (await cancelled.repositories.runs.listRuns())[0]!;
    await cancelled.cancelSignals.requestCancellation(run.id);
    await process;
    expect(cancelled.presentationOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "complete-card", status: "cancelled", title: "运行已取消" }),
      ]),
    );
  });
});
