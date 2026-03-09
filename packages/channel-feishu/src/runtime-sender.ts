import type { OutboundMessage } from "@carvis/core";

const FEISHU_API_BASE_URL = "https://open.feishu.cn/open-apis";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface FeishuCardCreateInput {
  chatId: string;
  runId: string;
  title: string;
  body: string;
}

export interface FeishuCardCreateResult {
  messageId: string;
  cardId: string;
  elementId: string;
}

export interface FeishuCardUpdateInput {
  cardId: string;
  elementId: string;
  runId: string;
  text: string;
}

export interface FeishuCardCompleteInput {
  cardId: string;
  elementId: string;
  runId: string;
  status: "completed" | "failed" | "cancelled";
  title: string;
  body: string;
}

export interface FeishuFallbackTerminalInput {
  chatId: string;
  runId: string;
  title: string;
  content: string;
}

export interface FeishuRuntimeSender {
  addReaction(messageId: string, emojiType: string): Promise<void>;
  completeCard(input: FeishuCardCompleteInput): Promise<void>;
  createCard(input: FeishuCardCreateInput): Promise<FeishuCardCreateResult>;
  removeReaction(messageId: string, emojiType: string): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<{ messageId: string }>;
  sendFallbackTerminal(input: FeishuFallbackTerminalInput): Promise<{ messageId: string }>;
  updateCard(input: FeishuCardUpdateInput): Promise<void>;
}

type CreateFeishuRuntimeSenderOptions = {
  appId: string;
  appSecret: string;
  failCardCreate?: boolean;
  failCardUpdate?: boolean;
  fetch?: FetchLike;
};

export function createFeishuRuntimeSender(
  options: CreateFeishuRuntimeSenderOptions,
): FeishuRuntimeSender {
  const fetchImpl = options.fetch ?? fetch;
  let tenantAccessToken: string | null = null;

  async function getTenantAccessToken() {
    if (!tenantAccessToken) {
      tenantAccessToken = await issueTenantAccessToken({
        appId: options.appId,
        appSecret: options.appSecret,
        fetch: fetchImpl,
      });
    }

    return tenantAccessToken;
  }

  async function withTenantAccessToken<T>(operation: (token: string) => Promise<T>): Promise<T> {
    let refreshed = false;

    while (true) {
      const token = await getTenantAccessToken();
      try {
        return await operation(token);
      } catch (error) {
        if (refreshed || !isInvalidAccessTokenError(error)) {
          throw error;
        }

        tenantAccessToken = null;
        refreshed = true;
      }
    }
  }

  return {
    async addReaction(messageId, emojiType) {
      await withTenantAccessToken(async (token) => {
        const response = await fetchImpl(`${FEISHU_API_BASE_URL}/im/v1/messages/${messageId}/reactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            reaction_type: {
              emoji_type: emojiType,
            },
          }),
        });
        const parsed = (await response.json()) as {
          code?: number;
          msg?: string;
        };

        if (!response.ok || parsed.code !== 0) {
          throw new Error(parsed.msg ?? "feishu add reaction failed");
        }
      });
    },
    async completeCard(input) {
      if (options.failCardUpdate) {
        throw new Error("feishu complete card failed");
      }

      await withTenantAccessToken(async (token) => {
        const response = await fetchImpl(`${FEISHU_API_BASE_URL}/im/v1/messages/${input.cardId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            content: JSON.stringify(
              buildInteractiveCard({
                body: input.body,
                status: input.status,
                title: input.title,
              }),
            ),
          }),
        });
        const parsed = (await response.json()) as {
          code?: number;
          msg?: string;
        };

        if (!response.ok || (parsed.code !== undefined && parsed.code !== 0)) {
          throw new Error(parsed.msg ?? "feishu complete card failed");
        }
      });
    },
    async createCard(input) {
      if (options.failCardCreate) {
        throw new Error("feishu create card failed");
      }

      const card = buildInteractiveCard({
        body: input.body,
        title: input.title,
      });
      const messageId = await withTenantAccessToken((token) =>
        sendFeishuMessage(fetchImpl, token, {
          chatId: input.chatId,
          msgType: "interactive",
          payload: {
            card,
          },
        }),
      );

      return {
        messageId,
        cardId: messageId,
        elementId: "carvis-output",
      };
    },
    async removeReaction(messageId, emojiType) {
      await withTenantAccessToken(async (token) => {
        const listUrl = new URL(`${FEISHU_API_BASE_URL}/im/v1/messages/${messageId}/reactions`);
        listUrl.searchParams.set("reaction_type", emojiType);
        const listResponse = await fetchImpl(listUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const listed = (await listResponse.json()) as {
          code?: number;
          data?: {
            items?: Array<{
              operator?: {
                operator_type: "app" | "user";
              };
              reaction_id?: string;
              reaction_type?: {
                emoji_type: string;
              };
            }>;
          };
          msg?: string;
        };

        if (!listResponse.ok || listed.code !== 0) {
          throw new Error(listed.msg ?? "feishu list reaction failed");
        }

        const reactionId = listed.data?.items?.find((item) => {
          return item.operator?.operator_type === "app" && item.reaction_type?.emoji_type === emojiType;
        })?.reaction_id;

        if (!reactionId) {
          return;
        }

        const deleteResponse = await fetchImpl(
          `${FEISHU_API_BASE_URL}/im/v1/messages/${messageId}/reactions/${reactionId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const deleted = (await deleteResponse.json()) as {
          code?: number;
          msg?: string;
        };

        if (!deleteResponse.ok || deleted.code !== 0) {
          throw new Error(deleted.msg ?? "feishu delete reaction failed");
        }
      });
    },
    async sendMessage(message) {
      const messageId = await withTenantAccessToken((token) =>
        sendFeishuMessage(fetchImpl, token, {
          chatId: message.chatId,
          msgType: "text",
          payload: {
            content: {
              text: message.content,
            },
          },
        }),
      );

      return { messageId };
    },
    async sendFallbackTerminal(input) {
      const messageId = await withTenantAccessToken((token) =>
        sendFeishuMessage(fetchImpl, token, {
          chatId: input.chatId,
          msgType: "post",
          payload: {
            content: {
              post: {
                zh_cn: {
                  title: input.title,
                  content: [
                    [
                      {
                        tag: "text",
                        text: input.content,
                      },
                    ],
                  ],
                },
              },
            },
          },
        }),
      );

      return { messageId };
    },
    async updateCard(input) {
      if (options.failCardUpdate) {
        throw new Error("feishu update card failed");
      }

      await withTenantAccessToken(async (token) => {
        const response = await fetchImpl(`${FEISHU_API_BASE_URL}/im/v1/messages/${input.cardId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            content: JSON.stringify(
              buildInteractiveCard({
                body: input.text,
                elementId: input.elementId,
                title: "运行中",
              }),
            ),
          }),
        });
        const parsed = (await response.json()) as {
          code?: number;
          msg?: string;
        };

        if (!response.ok || (parsed.code !== undefined && parsed.code !== 0)) {
          throw new Error(parsed.msg ?? "feishu update card failed");
        }
      });
    },
  };
}

async function issueTenantAccessToken(input: {
  appId: string;
  appSecret: string;
  fetch: FetchLike;
}): Promise<string> {
  const response = await input.fetch(
    `${FEISHU_API_BASE_URL}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: input.appId,
        app_secret: input.appSecret,
      }),
    },
  );

  const parsed = (await response.json()) as {
    tenant_access_token?: string;
    msg?: string;
  };

  if (!response.ok || !parsed.tenant_access_token) {
    throw new Error(parsed.msg ?? "feishu tenant access token request failed");
  }

  return parsed.tenant_access_token;
}

async function sendFeishuMessage(
  fetchImpl: FetchLike,
  token: string,
  input: {
    chatId: string;
    msgType: "text" | "interactive" | "post";
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const response = await fetchImpl(`${FEISHU_API_BASE_URL}/message/v4/send/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      chat_id: input.chatId,
      msg_type: input.msgType,
      ...input.payload,
    }),
  });

  const parsed = (await response.json()) as {
    data?: { message_id?: string };
    msg?: string;
  };

  const messageId = parsed.data?.message_id;
  if (!response.ok || !messageId) {
    throw new Error(parsed.msg ?? "feishu send message failed");
  }

  return messageId;
}

function buildInteractiveCard(input: {
  title: string;
  body: string;
  elementId?: string;
  status?: "completed" | "failed" | "cancelled";
}) {
  const template = input.status ? STATUS_TEMPLATES[input.status] : "blue";
  const elementId = input.elementId ?? "carvis-output";

  return {
    config: {
      update_multi: true,
      wide_screen_mode: true,
    },
    header: {
      template,
      title: {
        tag: "plain_text",
        content: input.title,
      },
    },
    elements: buildCardElements(input.body, elementId),
  };
}

function buildCardElements(body: string, baseElementId: string) {
  const sections = splitMarkdownSections(body);
  const hasStructuredHeadings = sections.some((section) => section.heading !== null);

  if (!hasStructuredHeadings) {
    return [buildMarkdownDiv(baseElementId, normalizeLarkMd(body))];
  }

  return sections.flatMap((section, index) => {
    const normalized = normalizeSectionContent(section);
    if (!normalized) {
      return [];
    }

    const elementId = index === 0 ? baseElementId : `${baseElementId}-section-${index}`;
    return [
      ...(index > 0 ? [{ tag: "hr" as const }] : []),
      buildMarkdownDiv(elementId, normalized),
    ];
  });
}

function buildMarkdownDiv(elementId: string, content: string) {
  return {
    tag: "div" as const,
    element_id: elementId,
    text: {
      tag: "lark_md" as const,
      content,
    },
  };
}

function splitMarkdownSections(body: string): Array<{ heading: string | null; content: string }> {
  const normalized = body.replaceAll("\r\n", "\n").trim();
  if (!normalized) {
    return [{ heading: null, content: "" }];
  }

  const lines = normalized.split("\n");
  const sections: Array<{ heading: string | null; content: string }> = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const heading = matchMarkdownHeading(line);
    if (heading) {
      if (currentHeading !== null || currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n").trim(),
        });
      }
      currentHeading = heading;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  sections.push({
    heading: currentHeading,
    content: currentLines.join("\n").trim(),
  });

  return sections;
}

function normalizeSectionContent(section: { heading: string | null; content: string }) {
  const content = normalizeLarkMd(section.content);
  if (!section.heading) {
    return content;
  }

  return content ? `**${section.heading}**\n${content}` : `**${section.heading}**`;
}

function normalizeLarkMd(body: string) {
  return body
    .replaceAll("\r\n", "\n")
    .replace(/^\s*#{1,6}\s+(.+)$/gm, (_match, title: string) => `**${title.trim()}**`)
    .trim();
}

function matchMarkdownHeading(line: string) {
  const matched = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
  return matched?.[1]?.trim() || null;
}

const STATUS_TEMPLATES = {
  cancelled: "grey",
  completed: "green",
  failed: "red",
} as const;

function isInvalidAccessTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.toLowerCase().includes("invalid access token");
}
