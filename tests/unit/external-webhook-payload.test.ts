import { describe, expect, test } from "bun:test";

import {
  renderExternalWebhookPrompt,
  validateExternalWebhookPayload,
} from "../../apps/gateway/src/services/external-webhook-payload.ts";

describe("external webhook payload", () => {
  test("requiredFields 缺失时拒绝请求", () => {
    const result = validateExternalWebhookPayload({
      payload: {
        event_type: "build_failed",
      },
      requiredFields: ["event_type", "summary"],
      optionalFields: [],
    });

    expect(result).toEqual({
      ok: false,
      reason: "missing_required_field:summary",
    });
  });

  test("只允许 required + optional 字段进入模板变量", () => {
    const result = validateExternalWebhookPayload({
      payload: {
        event_type: "build_failed",
        summary: "main branch CI failed",
        branch: "main",
        workspace: "should-be-ignored",
      },
      requiredFields: ["event_type", "summary"],
      optionalFields: ["branch"],
    });

    expect(result).toEqual({
      ok: true,
      variables: {
        branch: "main",
        event_type: "build_failed",
        summary: "main branch CI failed",
      },
    });
  });

  test("模板变量注入不会改写 definition 绑定字段", () => {
    const rendered = renderExternalWebhookPrompt({
      promptTemplate: "分析 {{event_type}}: {{summary}} @ {{branch}}",
      variables: {
        event_type: "build_failed",
        summary: "main branch CI failed",
        branch: "main",
      },
    });

    expect(rendered).toBe("分析 build_failed: main branch CI failed @ main");
  });

  test("对象和数组字段会被拒绝，不允许作为模板变量注入", () => {
    const result = validateExternalWebhookPayload({
      payload: {
        event_type: "build_failed",
        summary: {
          text: "main branch CI failed",
        },
        branch: ["main"],
      },
      requiredFields: ["event_type", "summary"],
      optionalFields: ["branch"],
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_field_type:summary",
    });
  });
});
