export type Channel = "feishu";
export type ChatType = "private" | "group";
export type SessionStatus = "active" | "disabled";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SessionMode = "fresh" | "continuation";
export type TriggerSource = "chat_message" | "scheduled_job" | "external_webhook";
export type TriggerDefinitionSourceType = Exclude<TriggerSource, "chat_message">;
export type TriggerExecutionStatus =
  | "accepted"
  | "rejected"
  | "missed"
  | "skipped"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type ConversationSessionBindingStatus = "unbound" | "bound" | "reset" | "invalidated" | "recovered";
export type ConversationSessionRecoveryResult = "recovered" | "failed";
export type BridgeSessionOutcome = "created" | "continued" | "unchanged";
export type WorkspaceBindingSource = "default" | "config" | "manual" | "created" | "unbound";
export type WorkspaceProvisionSource = "default" | "config" | "template_created";
export type ConversationSessionMemoryState =
  | "fresh"
  | "continued"
  | "recent_reset"
  | "recent_recovered"
  | "recent_recovery_failed";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type TriggerDeliveryKind = "none" | "feishu_chat";
export type DeliveryKind =
  | "status"
  | "result"
  | "error"
  | "reaction"
  | "card_create"
  | "card_update"
  | "card_complete"
  | "fallback_terminal";
export type CommandName = "status" | "abort" | "new" | "bind" | "help" | null;
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

export interface TriggerDeliveryTarget {
  kind: TriggerDeliveryKind;
  chatId?: string | null;
  label?: string | null;
}

export interface TriggerDefinition {
  id: string;
  sourceType: TriggerDefinitionSourceType;
  slug: string | null;
  enabled: boolean;
  workspace: string;
  agentId: string;
  promptTemplate: string;
  deliveryTarget: TriggerDeliveryTarget;
  scheduleExpr: string | null;
  timezone: string | null;
  nextDueAt: string | null;
  lastTriggeredAt: string | null;
  lastTriggerStatus: TriggerExecutionStatus | null;
  secretRef: string | null;
  requiredFields: string[];
  optionalFields: string[];
  replayWindowSeconds: number | null;
  definitionHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerExecution {
  id: string;
  definitionId: string;
  sourceType: TriggerDefinitionSourceType;
  status: TriggerExecutionStatus;
  triggeredAt: string;
  inputDigest: string | null;
  runId: string | null;
  deliveryStatus: DeliveryStatus | null;
  rejectionReason: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  id: string;
  bridge: "codex";
  defaultWorkspace: string;
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

export interface ConversationSessionBinding {
  sessionId: string;
  chatId: string;
  agentId: string;
  workspace: string;
  bridge: AgentConfig["bridge"];
  bridgeSessionId: string | null;
  mode: SessionMode;
  status: ConversationSessionBindingStatus;
  lastBoundAt: string | null;
  lastUsedAt: string | null;
  lastResetAt: string | null;
  lastInvalidatedAt: string | null;
  lastInvalidationReason: string | null;
  lastRecoveryAt: string | null;
  lastRecoveryResult: ConversationSessionRecoveryResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWorkspaceBinding {
  sessionId: string;
  chatId: string;
  workspaceKey: string;
  bindingSource: Exclude<WorkspaceBindingSource, "unbound">;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCatalogEntry {
  workspaceKey: string;
  workspacePath: string;
  provisionSource: WorkspaceProvisionSource;
  templateRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunRequest {
  id: string;
  sessionId: string | null;
  agentId: string;
  workspace: string;
  prompt: string;
  triggerSource?: TriggerSource;
  triggerExecutionId?: string | null;
  triggerMessageId: string | null;
  triggerUserId: string | null;
  timeoutSeconds: number;
  bridgeSessionId?: string | null;
  sessionMode?: SessionMode;
  deliveryTarget?: TriggerDeliveryTarget | null;
  createdAt: string;
}

export interface Run {
  id: string;
  sessionId: string | null;
  agentId: string;
  workspace: string;
  status: RunStatus;
  prompt: string;
  triggerSource: TriggerSource;
  triggerExecutionId: string | null;
  triggerMessageId: string | null;
  triggerUserId: string | null;
  timeoutSeconds: number;
  requestedSessionMode: SessionMode;
  requestedBridgeSessionId: string | null;
  resolvedBridgeSessionId: string | null;
  sessionRecoveryAttempted: boolean;
  sessionRecoveryResult: ConversationSessionRecoveryResult | null;
  deliveryTarget: TriggerDeliveryTarget | null;
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
  triggerExecutionId: string | null;
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
  chatType: ChatType;
  messageId: string;
  userId: string;
  triggerSource: "chat_message";
  command: CommandName;
  commandArgs: string[];
  unknownCommand: string | null;
  prompt: string | null;
  rawText: string;
  conversationHint: string | null;
  threadHint: string | null;
}

export interface OutboundMessage {
  chatId: string;
  runId: string | null;
  kind: Extract<DeliveryKind, "status" | "result" | "error">;
  content: string;
}

export interface StatusSnapshot {
  agentId: string;
  workspace: string | null;
  workspaceKey: string | null;
  workspaceBindingSource: WorkspaceBindingSource;
  activeRun: Run | null;
  latestRun: Run | null;
  isLatestRunQueued: boolean;
  aheadCount: number;
  continuationState: ConversationSessionMemoryState;
}

export interface QueueInfo {
  workspace: string;
  queuePosition: number;
}
