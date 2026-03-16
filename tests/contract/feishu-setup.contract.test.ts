import { describe, expect, test } from "bun:test";

import {
  getFeishuSetupSpec,
  probeFeishuCredentials,
  validateFeishuSetupInput,
} from "../../packages/channel-feishu/src/setup.ts";

describe("feishu setup contract", () => {
  test("setup spec 暴露字段、默认值、字段级提示和完整引导结构", () => {
    const spec = getFeishuSetupSpec();

    expect(spec.adapter).toBe("feishu");
    expect(spec.mode).toBe("websocket");
    expect(spec.fields.find((field) => field.key === "appId")).toMatchObject({
      envName: "FEISHU_APP_ID",
      required: true,
    });
    expect(spec.fields.find((field) => field.key === "appSecret")).toMatchObject({
      envName: "FEISHU_APP_SECRET",
      required: true,
    });
    expect(spec.fields.find((field) => field.key === "allowFrom")).toMatchObject({
      defaultValue: ["*"],
      required: true,
    });
    expect(spec.fields.find((field) => field.key === "requireMention")).toMatchObject({
      defaultValue: false,
      required: true,
    });
    expect(spec.guide.title).toContain("飞书");
    expect(spec.guide.sections.map((section) => section.id)).toEqual([
      "create-app",
      "credentials",
      "bot-permissions",
      "event-delivery",
      "allowlist",
    ]);
    expect(spec.fields.every((field) => field.howToGet.length > 0)).toBe(true);
    expect(spec.fields.every((field) => (field.promptHint?.length ?? 0) > 0)).toBe(true);
    expect(spec.fields.every((field) => (field.promptHelpTitle?.length ?? 0) > 0)).toBe(true);
    expect(spec.guide.sections.every((section) => section.steps.length > 0)).toBe(true);
    expect(spec.guide.links.some((link) => link.url.includes("open.feishu.cn"))).toBe(true);
    expect(spec.guide.sections.find((section) => section.id === "allowlist")?.checklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("*"),
        expect.stringContaining("chat_id"),
      ]),
    );
  });

  test("validate 稳定区分 ok 和 errors", () => {
    expect(
      validateFeishuSetupInput({
        allowFrom: ["chat-001"],
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        requireMention: false,
      }),
    ).toEqual({
      ok: true,
      value: {
        allowFrom: ["chat-001"],
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        requireMention: false,
      },
    });

    expect(
      validateFeishuSetupInput({
        allowFrom: [],
        appId: "",
        appSecret: "",
        requireMention: "no",
      }),
    ).toEqual({
      errors: [
        "appId 不能为空",
        "appSecret 不能为空",
        "allowFrom 至少需要一个 chat_id 或 *",
        "requireMention 必须是布尔值",
      ],
      ok: false,
    });
  });

  test("probe 能区分凭据错误与服务不可达", async () => {
    await expect(
      probeFeishuCredentials(
        {
          appId: "cli-app-id",
          appSecret: "cli-app-secret",
        },
        {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                code: 0,
                msg: "ok",
                tenant_access_token: "token-001",
              }),
              {
                headers: {
                  "content-type": "application/json",
                },
                status: 200,
              },
            ),
        },
      ),
    ).resolves.toEqual({
      message: "feishu credentials ready",
      ok: true,
    });

    await expect(
      probeFeishuCredentials(
        {
          appId: "bad-app-id",
          appSecret: "bad-app-secret",
        },
        {
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                code: 99991663,
                msg: "invalid app credential",
              }),
              {
                headers: {
                  "content-type": "application/json",
                },
                status: 401,
              },
            ),
        },
      ),
    ).resolves.toEqual({
      code: "INVALID_CREDENTIALS",
      message: "invalid app credential",
      ok: false,
    });

    await expect(
      probeFeishuCredentials(
        {
          appId: "cli-app-id",
          appSecret: "cli-app-secret",
        },
        {
          fetchImpl: async () => {
            throw new Error("connect ECONNREFUSED");
          },
        },
      ),
    ).resolves.toEqual({
      code: "FEISHU_UNAVAILABLE",
      message: "connect ECONNREFUSED",
      ok: false,
    });
  });
});
