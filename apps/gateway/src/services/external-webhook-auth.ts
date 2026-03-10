import { createHmac, timingSafeEqual } from "node:crypto";

type VerifyExternalWebhookRequestInput = {
  body: string;
  headers: Record<string, string | undefined>;
  now?: () => Date;
  replayWindowSeconds: number;
  secret: string;
};

type VerifyExternalWebhookRequestResult =
  | {
      ok: true;
      timestamp: string;
    }
  | {
      ok: false;
      reason: "missing_signature" | "missing_timestamp" | "invalid_timestamp" | "timestamp_expired" | "invalid_signature";
    };

const SIGNATURE_HEADER = "x-carvis-webhook-signature";
const TIMESTAMP_HEADER = "x-carvis-webhook-timestamp";

export function signExternalWebhookBody(input: {
  body: string;
  secret: string;
  timestamp: string;
}) {
  return createHmac("sha256", input.secret).update(`${input.timestamp}:${input.body}`).digest("hex");
}

export function verifyExternalWebhookRequest(
  input: VerifyExternalWebhookRequestInput,
): VerifyExternalWebhookRequestResult {
  const signature = input.headers[SIGNATURE_HEADER];
  if (!signature) {
    return {
      ok: false,
      reason: "missing_signature",
    };
  }

  const timestamp = input.headers[TIMESTAMP_HEADER];
  if (!timestamp) {
    return {
      ok: false,
      reason: "missing_timestamp",
    };
  }

  const requestTimestamp = Number(timestamp);
  if (!Number.isFinite(requestTimestamp)) {
    return {
      ok: false,
      reason: "invalid_timestamp",
    };
  }

  const now = input.now ?? (() => new Date());
  const deltaSeconds = Math.abs(Math.floor(now().getTime() / 1_000) - requestTimestamp);
  if (deltaSeconds > input.replayWindowSeconds) {
    return {
      ok: false,
      reason: "timestamp_expired",
    };
  }

  const expectedSignature = signExternalWebhookBody({
    body: input.body,
    secret: input.secret,
    timestamp,
  });

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  const valid =
    signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!valid) {
    return {
      ok: false,
      reason: "invalid_signature",
    };
  }

  return {
    ok: true,
    timestamp,
  };
}

export {
  SIGNATURE_HEADER as EXTERNAL_WEBHOOK_SIGNATURE_HEADER,
  TIMESTAMP_HEADER as EXTERNAL_WEBHOOK_TIMESTAMP_HEADER,
};
