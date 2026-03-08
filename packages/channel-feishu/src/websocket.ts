import type { InboundEnvelope } from "@carvis/core";
import * as Lark from "@larksuiteoapi/node-sdk";

type FeishuWebsocketEvent = {
  schema?: string;
  header?: {
    event_type?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string;
      };
    };
    message?: {
      chat_id?: string;
      message_id?: string;
      message_type?: string;
      content?: string;
      mentions?: Array<{
        name?: string;
      }>;
    };
  };
};

type NormalizeFeishuWebsocketEventOptions = {
  allowFrom: string[];
  requireMention: boolean;
};

type AcceptedFeishuWebsocketEvent = {
  accepted: true;
  envelope: InboundEnvelope;
};

type RejectedFeishuWebsocketEvent = {
  accepted: false;
  code: "FILTERED" | "INVALID_EVENT";
  reason: string;
};

export type NormalizeFeishuWebsocketEventResult =
  | AcceptedFeishuWebsocketEvent
  | RejectedFeishuWebsocketEvent;

export class FeishuWebsocketHandshakeError extends Error {
  readonly code = "FEISHU_WS_HANDSHAKE_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "FeishuWebsocketHandshakeError";
  }
}

export interface FeishuWebsocketIngress {
  emit(event: FeishuWebsocketEvent): Promise<void>;
  start(): Promise<{ ready: boolean }>;
  stop(): Promise<void>;
}

export type FeishuWebsocketConnectionState = {
  message?: string;
  status: "disconnected" | "ready";
};

type CreateFeishuWebsocketIngressOptions = NormalizeFeishuWebsocketEventOptions & {
  appId: string;
  appSecret: string;
  handshakeTimeoutMs?: number;
  onEnvelope: (envelope: InboundEnvelope) => Promise<void>;
  onConnectionStateChange?: (state: FeishuWebsocketConnectionState) => void;
  transportFactory?: FeishuWebsocketTransportFactory;
};

type FeishuWebsocketTransportFactoryOptions = NormalizeFeishuWebsocketEventOptions & {
  appId: string;
  appSecret: string;
  handshakeTimeoutMs: number;
  onEnvelope: (envelope: InboundEnvelope) => Promise<void>;
  onConnectionStateChange?: (state: FeishuWebsocketConnectionState) => void;
};

export type FeishuWebsocketTransportFactory = (
  options: FeishuWebsocketTransportFactoryOptions,
) => FeishuWebsocketIngress;

type FeishuWebsocketTestTransportOptions = {
  connectError?: Error;
};

const DEFAULT_FEISHU_WS_HANDSHAKE_TIMEOUT_MS = 15_000;

export function normalizeFeishuWebsocketEvent(
  event: FeishuWebsocketEvent,
  options: NormalizeFeishuWebsocketEventOptions,
): NormalizeFeishuWebsocketEventResult {
  if (event.header?.event_type !== "im.message.receive_v1") {
    return {
      accepted: false,
      code: "FILTERED",
      reason: "unsupported_event_type",
    };
  }

  const chatId = event.event?.message?.chat_id;
  const messageId = event.event?.message?.message_id;
  const userId = event.event?.sender?.sender_id?.open_id;
  const rawContent = event.event?.message?.content;
  const mentions = event.event?.message?.mentions ?? [];

  if (!chatId || !messageId || !userId || !rawContent) {
    return {
      accepted: false,
      code: "INVALID_EVENT",
      reason: "missing_required_fields",
    };
  }

  if (!isAllowedChat(options.allowFrom, chatId)) {
    return {
      accepted: false,
      code: "FILTERED",
      reason: "chat_not_allowed",
    };
  }

  const parsedContent = parseTextContent(rawContent);
  const rawText = normalizeMentionPrefix(parsedContent, mentions).trim();

  if (options.requireMention && (!mentions.length || rawText === parsedContent.trim())) {
    return {
      accepted: false,
      code: "FILTERED",
      reason: "mention_required",
    };
  }

  const command = rawText === "/status" ? "status" : rawText === "/abort" ? "abort" : null;

  return {
    accepted: true,
    envelope: {
      channel: "feishu",
      sessionKey: chatId,
      chatId,
      messageId,
      userId,
      triggerSource: "chat_message",
      command,
      prompt: command || rawText.length === 0 ? null : rawText,
      rawText,
    },
  };
}

export function createFeishuWebsocketIngress(
  options: CreateFeishuWebsocketIngressOptions,
): FeishuWebsocketIngress {
  const transportFactory = options.transportFactory ?? createFeishuWebsocketSdkTransport();
  const transport = transportFactory({
    appId: options.appId,
    appSecret: options.appSecret,
    allowFrom: options.allowFrom,
    handshakeTimeoutMs: options.handshakeTimeoutMs ?? DEFAULT_FEISHU_WS_HANDSHAKE_TIMEOUT_MS,
    requireMention: options.requireMention,
    onEnvelope: options.onEnvelope,
  });

  return {
    async start() {
      try {
        return await transport.start();
      } catch (error) {
        throw new FeishuWebsocketHandshakeError(error instanceof Error ? error.message : String(error));
      }
    },
    async stop() {
      await transport.stop();
    },
    async emit(event) {
      await transport.emit(event);
    },
  };
}

export function createFeishuWebsocketSdkTransport(): FeishuWebsocketTransportFactory {
  return function createTransport(input) {
    let latestWsError = "feishu websocket handshake timed out";
    let readyResolver: (() => void) | null = null;
    let readyRejector: ((error: Error) => void) | null = null;
    let readyPromise = createReadyPromise();

    function createReadyPromise() {
      return new Promise<void>((resolve, reject) => {
        readyResolver = resolve;
        readyRejector = reject;
      });
    }

    const logger = createSdkLogger({
      onError(message) {
        if (message.includes("[ws]")) {
          latestWsError = message;
          input.onConnectionStateChange?.({
            status: "disconnected",
            message,
          });
        }
      },
      onInfo(message) {
        if (message.includes("ws client ready")) {
          input.onConnectionStateChange?.({
            status: "ready",
          });
          readyResolver?.();
        }
      },
    });
    const wsClient = new Lark.WSClient({
      appId: input.appId,
      appSecret: input.appSecret,
      logger,
      loggerLevel: Lark.LoggerLevel.info,
    });

    return {
      async start() {
        readyPromise = createReadyPromise();
        await wsClient.start({
          eventDispatcher: new Lark.EventDispatcher({}).register({
            "im.message.receive_v1": async (data: unknown) => {
              const result = normalizeFeishuWebsocketEvent(
                {
                  schema: "2.0",
                  header: {
                    event_type: "im.message.receive_v1",
                  },
                  event: data as FeishuWebsocketEvent["event"],
                },
                {
                  allowFrom: input.allowFrom,
                  requireMention: input.requireMention,
                },
              );

              if (!result.accepted) {
                return;
              }

              await input.onEnvelope(result.envelope);
            },
          }),
        });

        await waitForHandshakeReady({
          timeoutMs: input.handshakeTimeoutMs,
          latestError: () => latestWsError,
          promise: readyPromise,
        });

        return { ready: true };
      },
      async stop() {
        readyRejector?.(new Error("feishu websocket client stopped"));
        wsClient.close({
          force: true,
        });
      },
      async emit() {
        throw new Error("emit is only available on test websocket transport");
      },
    };
  };
}

function createSdkLogger(input: {
  onError(message: string): void;
  onInfo(message: string): void;
}) {
  return {
    debug(...args: unknown[]) {
      console.debug("[debug]:", ...normalizeSdkLoggerArgs(args));
    },
    error(...args: unknown[]) {
      const normalized = normalizeSdkLoggerArgs(args);
      const message = normalized.join(" ");
      input.onError(message);
      console.error("[error]:", ...normalized);
    },
    info(...args: unknown[]) {
      const normalized = normalizeSdkLoggerArgs(args);
      const message = normalized.join(" ");
      input.onInfo(message);
      console.info("[info]:", ...normalized);
    },
    trace(...args: unknown[]) {
      console.trace("[trace]:", ...normalizeSdkLoggerArgs(args));
    },
    warn(...args: unknown[]) {
      console.warn("[warn]:", ...normalizeSdkLoggerArgs(args));
    },
  };
}

function normalizeSdkLoggerArgs(args: unknown[]): string[] {
  return args.flatMap((arg) => flattenSdkLoggerArg(arg)).map((arg) => stringifyLoggerArg(arg));
}

function flattenSdkLoggerArg(arg: unknown): unknown[] {
  if (!Array.isArray(arg)) {
    return [arg];
  }

  return arg.flatMap((item) => flattenSdkLoggerArg(item));
}

function stringifyLoggerArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }

  if (arg instanceof Error) {
    return arg.message;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

async function waitForHandshakeReady(input: {
  latestError: () => string;
  promise: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeoutId: Timer | undefined;

  try {
    await Promise.race([
      input.promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(input.latestError()));
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createFeishuWebsocketTestTransport(
  options: FeishuWebsocketTestTransportOptions = {},
): FeishuWebsocketTransportFactory {
  return function createTransport(input) {
    let started = false;

    return {
      async start() {
        if (options.connectError) {
          throw options.connectError;
        }
        started = true;
        return { ready: true };
      },
      async stop() {
        started = false;
      },
      async emit(event) {
        if (!started) {
          throw new Error("feishu websocket ingress is not started");
        }

        const result = normalizeFeishuWebsocketEvent(event, {
          allowFrom: input.allowFrom,
          requireMention: input.requireMention,
        });
        if (!result.accepted) {
          return;
        }

        await input.onEnvelope(result.envelope);
      },
    };
  };
}

function parseTextContent(rawContent: string): string {
  try {
    const parsed = JSON.parse(rawContent) as { text?: string };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

function normalizeMentionPrefix(text: string, mentions: Array<{ name?: string }>): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("@")) {
    return trimmed;
  }

  for (const mention of mentions) {
    if (!mention.name) {
      continue;
    }
    const prefix = `@${mention.name}`;
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  return trimmed.replace(/^@\S+\s*/, "").trim();
}

function isAllowedChat(allowFrom: string[], chatId: string): boolean {
  return allowFrom.includes("*") || allowFrom.includes(chatId);
}
