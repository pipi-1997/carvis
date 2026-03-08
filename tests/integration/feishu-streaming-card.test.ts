import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("Feishu streaming card", () => {
  test("run.started 后创建过程卡片并消费 delta 更新", async () => {
    const harness = createHarness({
      transportScript: [
        { type: "delta", deltaText: "正在分析仓库", sequence: 1, source: "assistant" },
        { type: "delta", deltaText: "正在修改文件", sequence: 2, source: "assistant" },
        { type: "result", resultSummary: "已完成" },
      ],
    });

    const response = await harness.postFeishuText("请检查仓库并修复问题");
    expect(response.status).toBe(202);

    await harness.executor.processNext();

    const presentation = await harness.repositories.presentations.getPresentationByRunId(
      (await harness.repositories.runs.listRuns())[0]!.id,
    );

    expect(presentation?.phase).toBe("completed");
    expect(presentation?.streamingCardId).toBeDefined();
    expect(presentation?.lastOutputSequence).toBe(2);
    expect(presentation?.lastOutputExcerpt).toBe("正在修改文件");
    expect(harness.presentationOperations).toEqual([
      expect.objectContaining({ action: "create-card", runId: presentation?.runId }),
      expect.objectContaining({ action: "update-card", runId: presentation?.runId, text: "正在分析仓库" }),
      expect.objectContaining({ action: "update-card", runId: presentation?.runId, text: "正在分析仓库正在修改文件" }),
      expect.objectContaining({ action: "complete-card", runId: presentation?.runId, status: "completed" }),
    ]);
  });
});
