import { createHash } from "node:crypto";

export function computeFeishuSignature(rawBody: string, timestamp: string, signingSecret: string): string {
  return createHash("sha256").update(`${timestamp}:${signingSecret}:${rawBody}`).digest("hex");
}

export function verifyFeishuSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  signingSecret: string;
}): boolean {
  return computeFeishuSignature(input.rawBody, input.timestamp, input.signingSecret) === input.signature;
}
