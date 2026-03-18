export type Channel = "feishu";
export type ChatType = "private" | "group";
export type SessionStatus = "active" | "disabled";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SessionMode = "fresh" | "continuation";
export type TriggerSource = "chat_message" | "scheduled_job" | "external_webhook";
export type TriggerDefinitionSourceType = Exclude<TriggerSource, "chat_message">;
export type TriggerDefinitionOrigin = "config" | "agent";
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
export type ScheduleManagementActionType = "create" | "list" | "update" | "disable" | "config_sync";
export type ScheduleManagementResolutionStatus = "executed" | "needs_clarification" | "rejected";
export type MediaSourceType = "local_path" | "remote_url";
export type MediaKind = "image" | "file" | "auto";
export type MediaToolStatus = "sent" | "rejected" | "failed";
export type RunMediaDeliveryStatus = "requested" | "source_failed" | "uploading" | "upload_failed" | "sending" | "sent" | "failed";
export type RunMediaFailureStage = "context" | "source" | "upload" | "delivery" | null;
export type WorkspaceBindingSource = "default" | "config" | "manual" | "created" | "unbound";
export type WorkspaceProvisionSource = "default" | "config" | "template_created";
export type ConversationSessionMemoryState =
  | "fresh"
  | "continued"
  | "recent_reset"
  | "recent_recovered"
  | "recent_recovery_failed";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type CodexSandboxMode = "workspace-write" | "danger-full-access";
export type SandboxModeSource = "workspace_default" | "chat_override";
export type TriggerDeliveryKind = "none" | "feishu_chat";
export type DeliveryKind =
  | "status"
  | "result"
  | "error"
  | "reaction"
  | "card_create"
  | "card_update"
  | "card_complete"
  | "fallback_terminal"
  | "media_image"
  | "media_file";
export type CommandName = "status" | "abort" | "new" | "bind" | "mode" | "help" | null;
export type RunEventType =
  | "run.queued"
  | "run.started"
  | "agent.output.delta"
  | "agent.summary"
  | "agent.tool_call"
  | "agent.tool_result"
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
  definitionOrigin?: TriggerDefinitionOrigin;
  slug: string | null;
  enabled: boolean;
  workspace: string;
  agentId: string;
  label?: string;
  promptTemplate: string;
  deliveryTarget: TriggerDeliveryTarget;
  scheduleExpr: string | null;
  timezone: string | null;
  nextDueAt: string | null;
  lastTriggeredAt: string | null;
  lastTriggerStatus: TriggerExecutionStatus | null;
  lastManagedAt?: string | null;
  lastManagedBySessionId?: string | null;
  lastManagedByChatId?: string | null;
  lastManagementAction?: ScheduleManagementActionType | null;
  secretRef: string | null;
  requiredFields: string[];
  optionalFields: string[];
  replayWindowSeconds: number | null;
  definitionHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerDefinitionOverride {
  definitionId: string;
  workspace: string;
  label: string | null;
  enabled: boolean | null;
  scheduleExpr: string | null;
  timezone: string | null;
  promptTemplate: string | null;
  deliveryTarget: TriggerDeliveryTarget | null;
  managedBySessionId: string;
  managedByChatId: string;
  managedByUserId: string | null;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EffectiveManagedSchedule {
  id: string;
  definitionId: string;
  sourceType: TriggerDefinitionSourceType;
  definitionOrigin: TriggerDefinitionOrigin;
  slug: string | null;
  workspace: string;
  agentId: string;
  label: string;
  enabled: boolean;
  promptTemplate: string;
  deliveryTarget: TriggerDeliveryTarget;
  scheduleExpr: string | null;
  timezone: string | null;
  nextDueAt: string | null;
  lastTriggeredAt: string | null;
  lastTriggerStatus: TriggerExecutionStatus | null;
  lastManagedAt: string | null;
  lastManagedBySessionId: string | null;
  lastManagedByChatId: string | null;
  lastManagementAction: ScheduleManagementActionType | null;
  secretRef: string | null;
  requiredFields: string[];
  optionalFields: string[];
  replayWindowSeconds: number | null;
  overridden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleManagementAction {
  id: string;
  sessionId: string;
  chatId: string;
  workspace: string;
  userId: string | null;
  requestedText: string;
  actionType: Exclude<ScheduleManagementActionType, "config_sync">;
  resolutionStatus: ScheduleManagementResolutionStatus;
  targetDefinitionId: string | null;
  reason: string | null;
  responseSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleToolInvocation {
  workspace?: string;
  actionType: Exclude<ScheduleManagementActionType, "config_sync">;
  targetReference?: string | null;
  definitionId?: string | null;
  label?: string | null;
  scheduleExpr?: string | null;
  timezone?: string | null;
  promptTemplate?: string | null;
  deliveryTarget?: TriggerDeliveryTarget | null;
}

export interface ScheduleToolResult {
  status: ScheduleManagementResolutionStatus;
  reason: string | null;
  question?: string | null;
  targetDefinitionId: string | null;
  summary: string;
}

export interface MediaToolInvocation {
  actionType: "send";
  sourceType: MediaSourceType;
  path?: string;
  url?: string;
  mediaKind?: MediaKind;
  title?: string | null;
  caption?: string | null;
}

export interface MediaToolResult {
  status: MediaToolStatus;
  reason: string | null;
  mediaDeliveryId: string | null;
  targetRef: string | null;
  summary: string;
}

export interface RunMediaDelivery {
  id: string;
  runId: string;
  sessionId: string | null;
  chatId: string;
  sourceType: MediaSourceType;
  sourceRef: string;
  mediaKind: Exclude<MediaKind, "auto">;
  resolvedFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: RunMediaDeliveryStatus;
  failureStage: RunMediaFailureStage;
  failureReason: string | null;
  outboundDeliveryId: string | null;
  targetRef: string | null;
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
  sandboxMode: CodexSandboxMode | null;
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

export interface ChatSandboxOverride {
  sessionId: string;
  chatId: string;
  agentId: string;
  workspace: string;
  sandboxMode: CodexSandboxMode;
  expiresAt: string;
  setByUserId: string | null;
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
  chatId?: string | null;
  agentId: string;
  workspace: string;
  prompt: string;
  managementMode?: "none" | "schedule";
  triggerSource?: TriggerSource;
  triggerExecutionId?: string | null;
  triggerMessageId: string | null;
  triggerUserId: string | null;
  timeoutSeconds: number;
  requestedSandboxMode?: CodexSandboxMode | null;
  resolvedSandboxMode?: CodexSandboxMode;
  sandboxModeSource?: SandboxModeSource;
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
  managementMode?: "none" | "schedule";
  triggerSource: TriggerSource;
  triggerExecutionId: string | null;
  triggerMessageId: string | null;
  triggerUserId: string | null;
  timeoutSeconds: number;
  requestedSandboxMode: CodexSandboxMode | null;
  resolvedSandboxMode: CodexSandboxMode;
  sandboxModeSource: SandboxModeSource;
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
  sessionId: string | null;
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
  sandboxMode?: CodexSandboxMode;
  sandboxModeSource?: SandboxModeSource;
  sandboxOverrideExpiresAt?: string | null;
  sandboxOverrideExpired?: boolean;
}

export interface QueueInfo {
  workspace: string;
  queuePosition: number;
}
