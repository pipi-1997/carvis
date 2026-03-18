import type { OutboundMessage } from "@carvis/core";
import { mapBlocksToFeishuCardElements } from "./feishu-card-content-mapper.ts";
import { transformFeishuRichText, type FeishuTransformMode } from "./feishu-rich-text-transformer.ts";

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

export interface FeishuMediaSendInput {
  chatId: string;
  runId: string;
  fileName: string;
  content: Uint8Array;
}

export interface FeishuMediaUploadResult {
  targetRef: string;
}

export interface FeishuMediaDeliverInput {
  chatId: string;
  runId: string;
  targetRef: string;
}

export class FeishuMediaStageError extends Error {
  readonly stage: "upload" | "delivery";
  override readonly cause?: unknown;

  constructor(stage: "upload" | "delivery", message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "FeishuMediaStageError";
    this.stage = stage;
    this.cause = options?.cause;
  }
}

export interface FeishuRuntimeSender {
  addReaction(messageId: string, emojiType: string): Promise<void>;
  completeCard(input: FeishuCardCompleteInput): Promise<void>;
  createCard(input: FeishuCardCreateInput): Promise<FeishuCardCreateResult>;
  deliverFile(input: FeishuMediaDeliverInput): Promise<{ messageId: string }>;
  deliverImage(input: FeishuMediaDeliverInput): Promise<{ messageId: string }>;
  removeReaction(messageId: string, emojiType: string): Promise<void>;
  sendFile(input: FeishuMediaSendInput): Promise<{ messageId: string; targetRef: string }>;
  sendImage(input: FeishuMediaSendInput): Promise<{ messageId: string; targetRef: string }>;
  sendMessage(message: OutboundMessage): Promise<{ messageId: string }>;
  sendFallbackTerminal(input: FeishuFallbackTerminalInput): Promise<{ messageId: string }>;
  uploadFile(input: FeishuMediaSendInput): Promise<FeishuMediaUploadResult>;
  uploadImage(input: FeishuMediaSendInput): Promise<FeishuMediaUploadResult>;
  updateCard(input: FeishuCardUpdateInput): Promise<void>;
}

type CreateFeishuRuntimeSenderOptions = {
  appId: string;
  appSecret: string;
  failCardCreate?: boolean;
  failCardUpdate?: boolean;
  fetch?: FetchLike;
  presentationRole?: "gateway" | "executor";
  logger?: {
    presentationState?: (
      status: "preserved" | "normalized" | "degraded" | "fallback_terminal" | "card_create_failed" | "card_update_failed" | "card_complete_failed",
      input: {
        runId: string;
        mode?: "streaming" | "terminal";
        outcome?: "preserved" | "normalized" | "degraded" | "fallback_terminal";
        degradedFragments?: string[];
        reason?: string;
        role?: "gateway" | "executor";
      },
    ) => void;
  };
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
        logPresentationFailure("card_complete_failed", {
          mode: "terminal",
          reason: "feishu complete card failed",
          runId: input.runId,
        });
        throw new Error("feishu complete card failed");
      }

      const rendered = renderCardContent({
        elementId: input.elementId,
        mode: "terminal",
        presentationRole: options.presentationRole,
        runId: input.runId,
        text: input.body,
        logger: options.logger,
      });
      try {
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
                  elements: rendered.elements,
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
      } catch (error) {
        logPresentationFailure("card_complete_failed", {
          mode: "terminal",
          reason: error instanceof Error ? error.message : String(error),
          runId: input.runId,
        });
        throw error;
      }
    },
    async createCard(input) {
      if (options.failCardCreate) {
        logPresentationFailure("card_create_failed", {
          mode: "streaming",
          reason: "feishu create card failed",
          runId: input.runId,
        });
        throw new Error("feishu create card failed");
      }

      const rendered = renderCardContent({
        elementId: "carvis-output",
        mode: "streaming",
        presentationRole: options.presentationRole,
        runId: input.runId,
        text: input.body,
        logger: options.logger,
      });
      const card = buildInteractiveCard({
        elements: rendered.elements,
        title: input.title,
      });
      let messageId: string;
      try {
        messageId = await withTenantAccessToken((token) =>
          sendFeishuMessage(fetchImpl, token, {
            chatId: input.chatId,
            msgType: "interactive",
            payload: {
              card,
            },
          }),
        );
      } catch (error) {
        logPresentationFailure("card_create_failed", {
          mode: "streaming",
          reason: error instanceof Error ? error.message : String(error),
          runId: input.runId,
        });
        throw error;
      }

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
    async uploadFile(input) {
      return await withTenantAccessToken(async (token) => {
        try {
          return {
            targetRef: await uploadFeishuAsset(fetchImpl, token, {
              assetType: "file",
              fieldName: "file",
              fileName: input.fileName,
              content: input.content,
            }),
          };
        } catch (error) {
          throw new FeishuMediaStageError("upload", toErrorMessage(error), { cause: error });
        }
      });
    },
    async deliverFile(input) {
      return await withTenantAccessToken(async (token) => {
        try {
          const messageId = await sendFeishuMessage(fetchImpl, token, {
            chatId: input.chatId,
            msgType: "file",
            payload: {
              content: {
                file_key: input.targetRef,
              },
            },
          });
          return { messageId };
        } catch (error) {
          throw new FeishuMediaStageError("delivery", toErrorMessage(error), { cause: error });
        }
      });
    },
    async sendFile(input) {
      const uploaded = await this.uploadFile(input);
      const delivered = await this.deliverFile({
        chatId: input.chatId,
        runId: input.runId,
        targetRef: uploaded.targetRef,
      });
      return {
        messageId: delivered.messageId,
        targetRef: uploaded.targetRef,
      };
    },
    async uploadImage(input) {
      return await withTenantAccessToken(async (token) => {
        try {
          return {
            targetRef: await uploadFeishuAsset(fetchImpl, token, {
              assetType: "image",
              fieldName: "image",
              fileName: input.fileName,
              content: input.content,
            }),
          };
        } catch (error) {
          throw new FeishuMediaStageError("upload", toErrorMessage(error), { cause: error });
        }
      });
    },
    async deliverImage(input) {
      return await withTenantAccessToken(async (token) => {
        try {
          const messageId = await sendFeishuMessage(fetchImpl, token, {
            chatId: input.chatId,
            msgType: "image",
            payload: {
              content: {
                image_key: input.targetRef,
              },
            },
          });
          return { messageId };
        } catch (error) {
          throw new FeishuMediaStageError("delivery", toErrorMessage(error), { cause: error });
        }
      });
    },
    async sendImage(input) {
      const uploaded = await this.uploadImage(input);
      const delivered = await this.deliverImage({
        chatId: input.chatId,
        runId: input.runId,
        targetRef: uploaded.targetRef,
      });
      return {
        messageId: delivered.messageId,
        targetRef: uploaded.targetRef,
      };
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
      options.logger?.presentationState?.("fallback_terminal", {
        runId: input.runId,
        outcome: "fallback_terminal",
        role: options.presentationRole,
      });

      return { messageId };
    },
    async updateCard(input) {
      if (options.failCardUpdate) {
        logPresentationFailure("card_update_failed", {
          mode: "streaming",
          reason: "feishu update card failed",
          runId: input.runId,
        });
        throw new Error("feishu update card failed");
      }

      const rendered = renderCardContent({
        elementId: input.elementId,
        mode: "streaming",
        presentationRole: options.presentationRole,
        runId: input.runId,
        text: input.text,
        logger: options.logger,
      });
      try {
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
                  elements: rendered.elements,
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
      } catch (error) {
        logPresentationFailure("card_update_failed", {
          mode: "streaming",
          reason: error instanceof Error ? error.message : String(error),
          runId: input.runId,
        });
        throw error;
      }
    },
  };

  function logPresentationFailure(
    status: "card_create_failed" | "card_update_failed" | "card_complete_failed",
    input: {
      runId: string;
      mode: "streaming" | "terminal";
      reason: string;
    },
  ) {
    options.logger?.presentationState?.(status, {
      runId: input.runId,
      mode: input.mode,
      reason: input.reason,
      role: options.presentationRole,
    });
  }
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
    msgType: "text" | "interactive" | "post" | "image" | "file";
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

async function uploadFeishuAsset(
  fetchImpl: FetchLike,
  token: string,
  input: {
    assetType: "image" | "file";
    fieldName: "image" | "file";
    fileName: string;
    content: Uint8Array;
  },
) {
  const form = new FormData();
  form.append("image_type", input.assetType === "image" ? "message" : "message");
  form.append(input.fieldName, new Blob([input.content.buffer as ArrayBuffer]), input.fileName);

  const response = await fetchImpl(`${FEISHU_API_BASE_URL}/im/v1/${input.assetType === "image" ? "images" : "files"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const parsed = (await response.json()) as {
    data?: {
      image_key?: string;
      file_key?: string;
    };
    msg?: string;
  };

  const targetRef = input.assetType === "image" ? parsed.data?.image_key : parsed.data?.file_key;
  if (!response.ok || !targetRef) {
    throw new Error(parsed.msg ?? `feishu upload ${input.assetType} failed`);
  }

  return targetRef;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildInteractiveCard(input: {
  title: string;
  elements: ReturnType<typeof mapBlocksToFeishuCardElements>;
  status?: "completed" | "failed" | "cancelled";
}) {
  const template = input.status ? STATUS_TEMPLATES[input.status] : "blue";

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
    elements: input.elements,
  };
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

function renderCardContent(input: {
  runId: string;
  mode: FeishuTransformMode;
  text: string;
  elementId: string;
  logger?: CreateFeishuRuntimeSenderOptions["logger"];
  presentationRole?: "gateway" | "executor";
}) {
  const transformed = transformFeishuRichText({
    mode: input.mode,
    text: input.text,
  });
  input.logger?.presentationState?.(transformed.outcome, {
    runId: input.runId,
    mode: input.mode,
    outcome: transformed.outcome,
    role: input.presentationRole,
    ...(transformed.degradedFragments.length > 0 ? { degradedFragments: transformed.degradedFragments } : {}),
  });
  return {
    ...transformed,
    elements: mapBlocksToFeishuCardElements(transformed.blocks, input.elementId),
  };
}
