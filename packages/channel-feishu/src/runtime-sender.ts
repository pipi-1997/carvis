import type { OutboundMessage } from "@carvis/core";

const FEISHU_API_BASE_URL = "https://open.feishu.cn/open-apis";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface FeishuRuntimeSender {
  addReaction(messageId: string, emojiType: string): Promise<void>;
  removeReaction(messageId: string, emojiType: string): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<{ messageId: string }>;
}

type CreateFeishuRuntimeSenderOptions = {
  appId: string;
  appSecret: string;
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

  return {
    async addReaction(messageId, emojiType) {
      const token = await getTenantAccessToken();
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
    },
    async removeReaction(messageId, emojiType) {
      const token = await getTenantAccessToken();
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
    },
    async sendMessage(message) {
      const token = await getTenantAccessToken();

      const response = await fetchImpl(`${FEISHU_API_BASE_URL}/message/v4/send/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          chat_id: message.chatId,
          msg_type: "text",
          content: {
            text: message.content,
          },
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

      return { messageId };
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
