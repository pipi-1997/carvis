export type Channel = "feishu";
export type SessionStatus = "active" | "disabled";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type DeliveryKind =
  | "status"
  | "result"
  | "error"
  | "reaction"
  | "card_create"
  | "card_update"
  | "card_complete"
  | "fallback_terminal";
export type CommandName = "status" | "abort" | null;
export type RunEventType =
  | "run.queued"
  | "run.started"
  | "agent.output.delta"
  | "agent.summary"
  | "run.completed"
  | "run.failed"
  | "run.cancelled";
export type PresentationPhase =
  | "pending_start"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "degraded";

export interface AgentConfig {
  id: string;
  bridge: "codex";
  workspace: string;
  timeoutSeconds: number;
  maxConcurrent: number;
}

export interface Session {
  id: string;
  channel: Channel;
  chatId: string;
  agentId: string;
  workspace: string;
  status: SessionStatus;
  lastSeenAt: string;
}

export interface RunRequest {
  id: string;
  sessionId: string;
  agentId: string;
  workspace: string;
  prompt: string;
  triggerMessageId: string;
  triggerUserId: string;
  timeoutSeconds: number;
  createdAt: string;
}

export interface Run {
  id: string;
  sessionId: string;
  agentId: string;
  workspace: string;
  status: RunStatus;
  prompt: string;
  triggerMessageId: string;
  triggerUserId: string;
  timeoutSeconds: number;
  queuePosition: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  cancelRequestedAt: string | null;
  createdAt: string;
}

export interface RunEvent<TPayload = Record<string, unknown>> {
  id: string;
  runId: string;
  eventType: RunEventType;
  payload: TPayload;
  createdAt: string;
}

export interface OutboundDelivery {
  id: string;
  runId: string | null;
  chatId: string;
  deliveryKind: DeliveryKind;
  content: string;
  targetRef: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunPresentation {
  runId: string;
  sessionId: string;
  chatId: string;
  phase: PresentationPhase;
  terminalStatus: Extract<RunStatus, "completed" | "failed" | "cancelled"> | null;
  streamingMessageId: string | null;
  streamingCardId: string | null;
  streamingElementId: string | null;
  fallbackTerminalMessageId: string | null;
  degradedReason: string | null;
  lastOutputSequence: number | null;
  lastOutputExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreamingCardView {
  runId: string;
  visibleText: string;
  excerpt: string | null;
  lastRenderedSequence: number | null;
  renderedAt: string;
  isTerminal: boolean;
}

export interface TerminalResultDocument {
  runId: string;
  headline: string;
  conclusion: string;
  changes: string[];
  verification: string[];
  nextSteps: string[];
  status: Extract<RunStatus, "completed" | "failed" | "cancelled">;
}

export interface InboundEnvelope {
  channel: Channel;
  sessionKey: string;
  chatId: string;
  messageId: string;
  userId: string;
  triggerSource: "chat_message";
  command: CommandName;
  prompt: string | null;
  rawText: string;
}

export interface OutboundMessage {
  chatId: string;
  runId: string | null;
  kind: Extract<DeliveryKind, "status" | "result" | "error">;
  content: string;
}

export interface StatusSnapshot {
  agentId: string;
  workspace: string;
  activeRun: Run | null;
  latestRun: Run | null;
  isLatestRunQueued: boolean;
  aheadCount: number;
}

export interface QueueInfo {
  workspace: string;
  queuePosition: number;
}
