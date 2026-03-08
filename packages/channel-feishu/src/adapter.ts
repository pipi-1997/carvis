import type { InboundEnvelope, OutboundMessage } from "@carvis/core";

import { verifyFeishuSignature } from "./signature.ts";

interface FeishuWebhookPayload {
  event: {
    sender: {
      sender_id: {
        open_id: string;
      };
    };
    message: {
      message_id: string;
      chat_id: string;
      content: string;
    };
  };
}

interface FeishuSender {
  addReaction(messageId: string, emojiType: string): Promise<void>;
  removeReaction(messageId: string, emojiType: string): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<{ messageId: string }>;
}

export class FeishuAdapter {
  private readonly signingSecret: string;
  private readonly sender: FeishuSender;

  constructor(options: { signingSecret: string; sender: FeishuSender }) {
    this.signingSecret = options.signingSecret;
    this.sender = options.sender;
  }

  async verifyWebhook(input: {
    headers: Record<string, string | undefined>;
    rawBody: string;
  }): Promise<boolean> {
    const timestamp = input.headers["x-feishu-request-timestamp"];
    const signature = input.headers["x-feishu-signature"];

    if (!timestamp || !signature) {
      return false;
    }

    return verifyFeishuSignature({
      rawBody: input.rawBody,
      timestamp,
      signature,
      signingSecret: this.signingSecret,
    });
  }

  async parseInbound(payload: FeishuWebhookPayload): Promise<InboundEnvelope> {
    const content = JSON.parse(payload.event.message.content) as { text?: string };
    const rawText = (content.text ?? "").trim();
    const command = rawText === "/status" ? "status" : rawText === "/abort" ? "abort" : null;

    return {
      channel: "feishu",
      sessionKey: payload.event.message.chat_id,
      chatId: payload.event.message.chat_id,
      messageId: payload.event.message.message_id,
      userId: payload.event.sender.sender_id.open_id,
      triggerSource: "chat_message",
      command,
      prompt: command ? null : rawText,
      rawText,
    };
  }

  async sendMessage(message: OutboundMessage): Promise<{ messageId: string }> {
    return this.sender.sendMessage(message);
  }

  async addReaction(messageId: string, emojiType: string): Promise<void> {
    await this.sender.addReaction(messageId, emojiType);
  }

  async removeReaction(messageId: string, emojiType: string): Promise<void> {
    await this.sender.removeReaction(messageId, emojiType);
  }
}

export type { FeishuWebhookPayload };
