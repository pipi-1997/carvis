import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  ChatSandboxOverride,
  ConversationSessionBinding,
  ConversationSessionBindingStatus,
  ConversationSessionRecoveryResult,
  CodexSandboxMode,
  DeliveryKind,
  DeliveryStatus,
  EffectiveManagedSchedule,
  OutboundDelivery,
  PresentationPhase,
  RunMediaDelivery,
  RunMediaDeliveryStatus,
  RunMediaFailureStage,
  Run,
  RunEvent,
  RunPresentation,
  RunStatus,
  ScheduleManagementAction,
  ScheduleManagementActionType,
  ScheduleManagementResolutionStatus,
  SandboxModeSource,
  SessionMode,
  Session,
  SessionWorkspaceBinding,
  TriggerDefinition,
  TriggerDefinitionOverride,
  TriggerExecution,
  TriggerExecutionStatus,
  TriggerSource,
  TriggerDeliveryTarget,
  WorkspaceBindingSource,
  WorkspaceCatalogEntry,
  WorkspaceProvisionSource,
} from "../domain/models.ts";

function nowIso(now = new Date()) {
  return now.toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildEffectiveManagedSchedule(
  definition: TriggerDefinition,
  override: TriggerDefinitionOverride | null,
): EffectiveManagedSchedule {
  const lastManagedAt = override?.appliedAt ?? definition.lastManagedAt ?? null;
  return {
    id: definition.id,
    definitionId: definition.id,
    sourceType: definition.sourceType,
    definitionOrigin: definition.definitionOrigin ?? "config",
    slug: definition.slug,
    workspace: definition.workspace,
    agentId: definition.agentId,
    label: override?.label ?? definition.label ?? definition.id,
    enabled: override?.enabled ?? definition.enabled,
    promptTemplate: override?.promptTemplate ?? definition.promptTemplate,
    deliveryTarget: clone(override?.deliveryTarget ?? definition.deliveryTarget),
    scheduleExpr: override?.scheduleExpr ?? definition.scheduleExpr,
    timezone: override?.timezone ?? definition.timezone,
    nextDueAt: definition.nextDueAt,
    lastTriggeredAt: definition.lastTriggeredAt,
    lastTriggerStatus: definition.lastTriggerStatus,
    lastManagedAt,
    lastManagedBySessionId: override?.managedBySessionId ?? definition.lastManagedBySessionId ?? null,
    lastManagedByChatId: override?.managedByChatId ?? definition.lastManagedByChatId ?? null,
    lastManagementAction: override ? definition.lastManagementAction ?? "update" : definition.lastManagementAction ?? null,
    secretRef: definition.secretRef ?? null,
    requiredFields: [...definition.requiredFields],
    optionalFields: [...definition.optionalFields],
    replayWindowSeconds: definition.replayWindowSeconds ?? null,
    overridden: !!override,
    createdAt: definition.createdAt,
    updatedAt: override?.updatedAt ?? definition.updatedAt,
  };
}

export interface SessionRepository {
  getSessionById(sessionId: string): Promise<Session | null>;
  getOrCreateSession(input: {
    channel: Session["channel"];
    chatId: string;
    agentConfig: AgentConfig;
    now?: Date;
  }): Promise<Session>;
  getSessionByChat(channel: Session["channel"], chatId: string): Promise<Session | null>;
  listSessions(): Promise<Session[]>;
}

export interface ConversationSessionBindingRepository {
  getBindingBySessionId(sessionId: string): Promise<ConversationSessionBinding | null>;
  listBindings(): Promise<ConversationSessionBinding[]>;
  saveBindingContinuation(input: {
    session: Session;
    bridge: AgentConfig["bridge"];
    bridgeSessionId: string;
    sandboxMode?: CodexSandboxMode;
    workspace?: string;
    status: Extract<ConversationSessionBindingStatus, "bound" | "recovered">;
    recoveryResult?: ConversationSessionRecoveryResult | null;
    now?: Date;
  }): Promise<ConversationSessionBinding>;
  markBindingReset(input: {
    session: Session;
    now?: Date;
  }): Promise<ConversationSessionBinding>;
  markBindingInvalidated(input: {
    session: Session;
    reason: string;
    recoveryResult?: ConversationSessionRecoveryResult | null;
    now?: Date;
  }): Promise<ConversationSessionBinding>;
}

export interface ChatSandboxOverrideRepository {
  getOverrideBySessionId(sessionId: string): Promise<ChatSandboxOverride | null>;
  listOverrides(): Promise<ChatSandboxOverride[]>;
  upsertOverride(input: {
    sessionId: string;
    chatId: string;
    agentId: string;
    workspace: string;
    sandboxMode: CodexSandboxMode;
    expiresAt: string;
    setByUserId?: string | null;
    now?: Date;
  }): Promise<ChatSandboxOverride>;
  deleteOverrideBySessionId(sessionId: string): Promise<void>;
}

export interface SessionWorkspaceBindingRepository {
  getBindingBySessionId(sessionId: string): Promise<SessionWorkspaceBinding | null>;
  listBindings(): Promise<SessionWorkspaceBinding[]>;
  saveBinding(input: {
    session: Session;
    workspaceKey: string;
    bindingSource: Exclude<WorkspaceBindingSource, "unbound">;
    now?: Date;
  }): Promise<SessionWorkspaceBinding>;
}

export interface WorkspaceCatalogRepository {
  getEntryByWorkspaceKey(workspaceKey: string): Promise<WorkspaceCatalogEntry | null>;
  listEntries(): Promise<WorkspaceCatalogEntry[]>;
  createEntry(input: {
    workspaceKey: string;
    workspacePath: string;
    provisionSource: WorkspaceProvisionSource;
    templateRef?: string | null;
    now?: Date;
  }): Promise<WorkspaceCatalogEntry>;
}

export interface RunRepository {
  createQueuedRun(input: {
    sessionId: string | null;
    agentId: string;
    workspace: string;
    prompt: string;
    managementMode?: Run["managementMode"];
    triggerSource?: TriggerSource;
    triggerExecutionId?: string | null;
    triggerMessageId: string | null;
    triggerUserId: string | null;
    timeoutSeconds: number;
    requestedSandboxMode?: CodexSandboxMode | null;
    resolvedSandboxMode?: CodexSandboxMode;
    sandboxModeSource?: SandboxModeSource;
    requestedSessionMode?: SessionMode;
    requestedBridgeSessionId?: string | null;
    deliveryTarget?: TriggerDeliveryTarget | null;
    now?: Date;
  }): Promise<Run>;
  updateQueuePosition(runId: string, queuePosition: number): Promise<Run>;
  getRunById(runId: string): Promise<Run | null>;
  listRuns(): Promise<Run[]>;
  findActiveRunBySession(sessionId: string): Promise<Run | null>;
  findActiveRunByWorkspace(workspace: string): Promise<Run | null>;
  getLatestRunBySession(sessionId: string): Promise<Run | null>;
  getLatestRunByChat(channel: Session["channel"], chatId: string): Promise<Run | null>;
  markRunStarted(runId: string, startedAt: string): Promise<Run>;
  markRunCompleted(
    runId: string,
    finishedAt: string,
    resultSummary: string,
    metadata?: {
      resolvedBridgeSessionId?: string | null;
      sessionRecoveryAttempted?: boolean;
      sessionRecoveryResult?: ConversationSessionRecoveryResult | null;
    },
  ): Promise<Run>;
  markRunFailed(
    runId: string,
    finishedAt: string,
    failureCode: string,
    failureMessage: string,
    metadata?: {
      resolvedBridgeSessionId?: string | null;
      sessionRecoveryAttempted?: boolean;
      sessionRecoveryResult?: ConversationSessionRecoveryResult | null;
    },
  ): Promise<Run>;
  markRunCancelled(runId: string, finishedAt: string, reason: string): Promise<Run>;
  markCancelRequested(runId: string, requestedAt: string): Promise<Run>;
}

export interface RunEventRepository {
  appendEvent<TPayload = Record<string, unknown>>(input: {
    runId: string;
    eventType: RunEvent["eventType"];
    payload: TPayload;
    now?: Date;
  }): Promise<RunEvent<TPayload>>;
  listEventsByRun(runId: string): Promise<RunEvent[]>;
}

export interface DeliveryRepository {
  createDelivery(input: {
    runId: string | null;
    triggerExecutionId?: string | null;
    chatId: string;
    deliveryKind: DeliveryKind;
    content: string;
    targetRef?: string | null;
    now?: Date;
  }): Promise<OutboundDelivery>;
  markDeliverySent(deliveryId: string, now?: Date, targetRef?: string | null): Promise<OutboundDelivery>;
  markDeliveryFailed(deliveryId: string, errorMessage: string, now?: Date): Promise<OutboundDelivery>;
  listDeliveries(): Promise<OutboundDelivery[]>;
}

export interface PresentationRepository {
  createPendingPresentation(input: {
    runId: string;
    sessionId: string | null;
    chatId: string;
    now?: Date;
  }): Promise<RunPresentation>;
  getPresentationByRunId(runId: string): Promise<RunPresentation | null>;
  listPresentations(): Promise<RunPresentation[]>;
  markPresentationStreaming(input: {
    runId: string;
    streamingMessageId: string;
    streamingCardId: string;
    streamingElementId: string;
    now?: Date;
  }): Promise<RunPresentation>;
  updatePresentationOutput(input: {
    runId: string;
    lastOutputSequence: number;
    lastOutputExcerpt: string;
    now?: Date;
  }): Promise<RunPresentation>;
  markPresentationTerminal(input: {
    runId: string;
    phase: Extract<PresentationPhase, "completed" | "failed" | "cancelled">;
    terminalStatus: Extract<RunStatus, "completed" | "failed" | "cancelled">;
    lastOutputSequence?: number | null;
    lastOutputExcerpt?: string | null;
    now?: Date;
  }): Promise<RunPresentation>;
  markPresentationDegraded(input: {
    runId: string;
    degradedReason: string;
    now?: Date;
  }): Promise<RunPresentation>;
  attachFallbackTerminal(input: {
    runId: string;
    fallbackTerminalMessageId: string;
    now?: Date;
  }): Promise<RunPresentation>;
}

export interface RunMediaDeliveryRepository {
  createMediaDelivery(input: {
    runId: string;
    sessionId: string | null;
    chatId: string;
    sourceType: RunMediaDelivery["sourceType"];
    sourceRef: string;
    mediaKind: RunMediaDelivery["mediaKind"];
    resolvedFileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    now?: Date;
  }): Promise<RunMediaDelivery>;
  updateMediaDelivery(input: {
    mediaDeliveryId: string;
    status: RunMediaDeliveryStatus;
    failureStage?: RunMediaFailureStage;
    failureReason?: string | null;
    outboundDeliveryId?: string | null;
    targetRef?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    resolvedFileName?: string | null;
    now?: Date;
  }): Promise<RunMediaDelivery>;
  listMediaDeliveries(): Promise<RunMediaDelivery[]>;
}

export interface TriggerDefinitionRepository {
  getDefinitionById(definitionId: string): Promise<TriggerDefinition | null>;
  getEffectiveDefinitionById(definitionId: string): Promise<EffectiveManagedSchedule | null>;
  getDefinitionBySlug(slug: string): Promise<TriggerDefinition | null>;
  listDefinitions(): Promise<TriggerDefinition[]>;
  listEffectiveDefinitions(): Promise<EffectiveManagedSchedule[]>;
  upsertDefinition(input: Omit<TriggerDefinition, "createdAt" | "updatedAt"> & { now?: Date }): Promise<TriggerDefinition>;
  updateDefinitionRuntimeState(input: {
    definitionId: string;
    nextDueAt?: string | null;
    lastTriggeredAt?: string | null;
    lastTriggerStatus?: TriggerExecutionStatus | null;
    enabled?: boolean;
    now?: Date;
  }): Promise<TriggerDefinition>;
}

export interface TriggerDefinitionOverrideRepository {
  getOverrideByDefinitionId(definitionId: string): Promise<TriggerDefinitionOverride | null>;
  listOverrides(): Promise<TriggerDefinitionOverride[]>;
  upsertOverride(
    input: Omit<TriggerDefinitionOverride, "createdAt" | "updatedAt"> & { now?: Date },
  ): Promise<TriggerDefinitionOverride>;
}

export interface ScheduleManagementActionRepository {
  createAction(
    input: Omit<ScheduleManagementAction, "id" | "createdAt" | "updatedAt"> & { now?: Date },
  ): Promise<ScheduleManagementAction>;
  listActions(): Promise<ScheduleManagementAction[]>;
  listActionsByDefinition(definitionId: string): Promise<ScheduleManagementAction[]>;
}

export interface TriggerExecutionRepository {
  createExecution(input: {
    definitionId: string;
    sourceType: TriggerDefinition["sourceType"];
    status: TriggerExecutionStatus;
    triggeredAt?: string;
    inputDigest?: string | null;
    runId?: string | null;
    deliveryStatus?: DeliveryStatus | null;
    rejectionReason?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    finishedAt?: string | null;
    now?: Date;
  }): Promise<TriggerExecution>;
  getExecutionById(executionId: string): Promise<TriggerExecution | null>;
  getExecutionByRunId(runId: string): Promise<TriggerExecution | null>;
  listExecutions(): Promise<TriggerExecution[]>;
  listExecutionsByDefinition(definitionId: string): Promise<TriggerExecution[]>;
  updateExecution(input: {
    executionId: string;
    status?: TriggerExecutionStatus;
    runId?: string | null;
    deliveryStatus?: DeliveryStatus | null;
    rejectionReason?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    finishedAt?: string | null;
    now?: Date;
  }): Promise<TriggerExecution>;
}

export interface RepositoryBundle {
  sessions: SessionRepository;
  conversationSessionBindings: ConversationSessionBindingRepository;
  chatSandboxOverrides: ChatSandboxOverrideRepository;
  sessionWorkspaceBindings: SessionWorkspaceBindingRepository;
  workspaceCatalog: WorkspaceCatalogRepository;
  triggerDefinitions: TriggerDefinitionRepository;
  triggerDefinitionOverrides: TriggerDefinitionOverrideRepository;
  triggerExecutions: TriggerExecutionRepository;
  scheduleManagementActions: ScheduleManagementActionRepository;
  runs: RunRepository;
  events: RunEventRepository;
  deliveries: DeliveryRepository;
  runMediaDeliveries: RunMediaDeliveryRepository;
  presentations: PresentationRepository;
}

export interface PostgresClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function createInMemoryRepositories(): RepositoryBundle {
  const sessions = new Map<string, Session>();
  const sessionsByChat = new Map<string, string>();
  const conversationSessionBindings = new Map<string, ConversationSessionBinding>();
  const chatSandboxOverrides = new Map<string, ChatSandboxOverride>();
  const sessionWorkspaceBindings = new Map<string, SessionWorkspaceBinding>();
  const workspaceCatalog = new Map<string, WorkspaceCatalogEntry>();
  const triggerDefinitions = new Map<string, TriggerDefinition>();
  const triggerDefinitionIdsBySlug = new Map<string, string>();
  const triggerDefinitionOverrides = new Map<string, TriggerDefinitionOverride>();
  const triggerExecutions = new Map<string, TriggerExecution>();
  const scheduleManagementActions = new Map<string, ScheduleManagementAction>();
  const runs = new Map<string, Run>();
  const runIdsBySession = new Map<string, string[]>();
  const events = new Map<string, Array<RunEvent<Record<string, unknown>>>>();
  const deliveries = new Map<string, OutboundDelivery>();
  const runMediaDeliveries = new Map<string, RunMediaDelivery>();
  const presentations = new Map<string, RunPresentation>();

  const sessionRepository: SessionRepository = {
    async getSessionById(sessionId) {
      return clone(sessions.get(sessionId) ?? null);
    },
    async getOrCreateSession({ channel, chatId, agentConfig, now }) {
      const existingId = sessionsByChat.get(`${channel}:${chatId}`);
      const timestamp = nowIso(now);

      if (existingId) {
        const existing = sessions.get(existingId)!;
        const updated: Session = {
          ...existing,
          lastSeenAt: timestamp,
        };
        sessions.set(updated.id, updated);
        return clone(updated);
      }

      const session: Session = {
        id: randomUUID(),
        channel,
        chatId,
        agentId: agentConfig.id,
        workspace: agentConfig.workspace,
        status: "active",
        lastSeenAt: timestamp,
      };
      sessions.set(session.id, session);
      sessionsByChat.set(`${channel}:${chatId}`, session.id);
      return clone(session);
    },
    async getSessionByChat(channel, chatId) {
      const sessionId = sessionsByChat.get(`${channel}:${chatId}`);
      return sessionId ? clone(sessions.get(sessionId) ?? null) : null;
    },
    async listSessions() {
      return Array.from(sessions.values()).map(clone);
    },
  };

  const conversationSessionBindingRepository: ConversationSessionBindingRepository = {
    async getBindingBySessionId(sessionId) {
      return clone(conversationSessionBindings.get(sessionId) ?? null);
    },
    async listBindings() {
      return Array.from(conversationSessionBindings.values()).map(clone);
    },
    async saveBindingContinuation(input) {
      const { session, bridge, bridgeSessionId, workspace, status, recoveryResult, now, sandboxMode } = input;
      const timestamp = nowIso(now);
      const existing = conversationSessionBindings.get(session.id);
      const binding: ConversationSessionBinding = {
        sessionId: session.id,
        chatId: session.chatId,
        agentId: session.agentId,
        workspace: workspace ?? session.workspace,
        bridge,
        bridgeSessionId,
        sandboxMode: sandboxMode ?? existing?.sandboxMode ?? "workspace-write",
        mode: "continuation",
        status,
        lastBoundAt: timestamp,
        lastUsedAt: timestamp,
        lastResetAt: existing?.lastResetAt ?? null,
        lastInvalidatedAt: existing?.lastInvalidatedAt ?? null,
        lastInvalidationReason: existing?.lastInvalidationReason ?? null,
        lastRecoveryAt: status === "recovered" ? timestamp : existing?.lastRecoveryAt ?? null,
        lastRecoveryResult: recoveryResult ?? existing?.lastRecoveryResult ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      conversationSessionBindings.set(session.id, binding);
      return clone(binding);
    },
    async markBindingReset({ session, now }) {
      const timestamp = nowIso(now);
      const existing = conversationSessionBindings.get(session.id);
      const binding: ConversationSessionBinding = {
        sessionId: session.id,
        chatId: session.chatId,
        agentId: session.agentId,
        workspace: session.workspace,
        bridge: session.agentId ? "codex" : "codex",
        bridgeSessionId: null,
        sandboxMode: null,
        mode: "fresh",
        status: "reset",
        lastBoundAt: existing?.lastBoundAt ?? null,
        lastUsedAt: existing?.lastUsedAt ?? null,
        lastResetAt: timestamp,
        lastInvalidatedAt: existing?.lastInvalidatedAt ?? null,
        lastInvalidationReason: existing?.lastInvalidationReason ?? null,
        lastRecoveryAt: existing?.lastRecoveryAt ?? null,
        lastRecoveryResult: existing?.lastRecoveryResult ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      conversationSessionBindings.set(session.id, binding);
      return clone(binding);
    },
    async markBindingInvalidated({ session, reason, recoveryResult, now }) {
      const timestamp = nowIso(now);
      const existing = conversationSessionBindings.get(session.id);
      const binding: ConversationSessionBinding = {
        sessionId: session.id,
        chatId: session.chatId,
        agentId: session.agentId,
        workspace: session.workspace,
        bridge: existing?.bridge ?? "codex",
        bridgeSessionId: null,
        sandboxMode: null,
        mode: "fresh",
        status: "invalidated",
        lastBoundAt: existing?.lastBoundAt ?? null,
        lastUsedAt: existing?.lastUsedAt ?? null,
        lastResetAt: existing?.lastResetAt ?? null,
        lastInvalidatedAt: timestamp,
        lastInvalidationReason: reason,
        lastRecoveryAt: recoveryResult ? timestamp : existing?.lastRecoveryAt ?? null,
        lastRecoveryResult: recoveryResult ?? existing?.lastRecoveryResult ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      conversationSessionBindings.set(session.id, binding);
      return clone(binding);
    },
  };

  const chatSandboxOverrideRepository: ChatSandboxOverrideRepository = {
    async getOverrideBySessionId(sessionId) {
      return clone(chatSandboxOverrides.get(sessionId) ?? null);
    },
    async listOverrides() {
      return Array.from(chatSandboxOverrides.values()).map(clone);
    },
    async upsertOverride(input) {
      const timestamp = nowIso(input.now);
      const existing = chatSandboxOverrides.get(input.sessionId);
      const override: ChatSandboxOverride = {
        sessionId: input.sessionId,
        chatId: input.chatId,
        agentId: input.agentId,
        workspace: input.workspace,
        sandboxMode: input.sandboxMode,
        expiresAt: input.expiresAt,
        setByUserId: input.setByUserId ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      chatSandboxOverrides.set(input.sessionId, override);
      return clone(override);
    },
    async deleteOverrideBySessionId(sessionId) {
      chatSandboxOverrides.delete(sessionId);
    },
  };

  const sessionWorkspaceBindingRepository: SessionWorkspaceBindingRepository = {
    async getBindingBySessionId(sessionId) {
      return clone(sessionWorkspaceBindings.get(sessionId) ?? null);
    },
    async listBindings() {
      return Array.from(sessionWorkspaceBindings.values()).map(clone);
    },
    async saveBinding({ session, workspaceKey, bindingSource, now }) {
      const timestamp = nowIso(now);
      const existing = sessionWorkspaceBindings.get(session.id);
      const binding: SessionWorkspaceBinding = {
        sessionId: session.id,
        chatId: session.chatId,
        workspaceKey,
        bindingSource,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      sessionWorkspaceBindings.set(session.id, binding);
      return clone(binding);
    },
  };

  const workspaceCatalogRepository: WorkspaceCatalogRepository = {
    async getEntryByWorkspaceKey(workspaceKey) {
      return clone(workspaceCatalog.get(workspaceKey) ?? null);
    },
    async listEntries() {
      return Array.from(workspaceCatalog.values()).map(clone);
    },
    async createEntry({ workspaceKey, workspacePath, provisionSource, templateRef, now }) {
      const existing = workspaceCatalog.get(workspaceKey);
      if (existing) {
        return clone(existing);
      }
      const timestamp = nowIso(now);
      const entry: WorkspaceCatalogEntry = {
        workspaceKey,
        workspacePath,
        provisionSource,
        templateRef: templateRef ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      workspaceCatalog.set(workspaceKey, entry);
      return clone(entry);
    },
  };


  const triggerDefinitionRepository: TriggerDefinitionRepository = {
    async getDefinitionById(definitionId) {
      return clone(triggerDefinitions.get(definitionId) ?? null);
    },
    async getEffectiveDefinitionById(definitionId) {
      const definition = triggerDefinitions.get(definitionId) ?? null;
      if (!definition) {
        return null;
      }
      return clone(buildEffectiveManagedSchedule(definition, triggerDefinitionOverrides.get(definitionId) ?? null));
    },
    async getDefinitionBySlug(slug) {
      const definitionId = triggerDefinitionIdsBySlug.get(slug);
      return definitionId ? clone(triggerDefinitions.get(definitionId) ?? null) : null;
    },
    async listDefinitions() {
      return Array.from(triggerDefinitions.values()).sort((a, b) => a.id.localeCompare(b.id)).map(clone);
    },
    async listEffectiveDefinitions() {
      return Array.from(triggerDefinitions.values())
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((definition) => buildEffectiveManagedSchedule(definition, triggerDefinitionOverrides.get(definition.id) ?? null))
        .map(clone);
    },
    async upsertDefinition(input) {
      const timestamp = nowIso(input.now);
      const existing = triggerDefinitions.get(input.id);
      const definition: TriggerDefinition = {
        id: input.id,
        sourceType: input.sourceType,
        definitionOrigin: input.definitionOrigin ?? existing?.definitionOrigin ?? "config",
        slug: input.slug ?? null,
        enabled: input.enabled,
        workspace: input.workspace,
        agentId: input.agentId,
        label: input.label ?? existing?.label ?? input.id,
        promptTemplate: input.promptTemplate,
        deliveryTarget: clone(input.deliveryTarget),
        scheduleExpr: input.scheduleExpr ?? null,
        timezone: input.timezone ?? null,
        nextDueAt: input.nextDueAt ?? existing?.nextDueAt ?? null,
        lastTriggeredAt: input.lastTriggeredAt ?? existing?.lastTriggeredAt ?? null,
        lastTriggerStatus: input.lastTriggerStatus ?? existing?.lastTriggerStatus ?? null,
        lastManagedAt: input.lastManagedAt ?? existing?.lastManagedAt ?? null,
        lastManagedBySessionId: input.lastManagedBySessionId ?? existing?.lastManagedBySessionId ?? null,
        lastManagedByChatId: input.lastManagedByChatId ?? existing?.lastManagedByChatId ?? null,
        lastManagementAction: input.lastManagementAction ?? existing?.lastManagementAction ?? null,
        secretRef: input.secretRef ?? null,
        requiredFields: [...input.requiredFields],
        optionalFields: [...input.optionalFields],
        replayWindowSeconds: input.replayWindowSeconds ?? null,
        definitionHash: input.definitionHash ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      triggerDefinitions.set(definition.id, definition);
      if (definition.slug) {
        triggerDefinitionIdsBySlug.set(definition.slug, definition.id);
      }
      return clone(definition);
    },
    async updateDefinitionRuntimeState({ definitionId, nextDueAt, lastTriggeredAt, lastTriggerStatus, enabled, now }) {
      const definition = triggerDefinitions.get(definitionId);
      if (!definition) {
        throw new Error(`trigger definition not found: ${definitionId}`);
      }
      const updated: TriggerDefinition = {
        ...definition,
        nextDueAt: nextDueAt === undefined ? definition.nextDueAt : nextDueAt,
        lastTriggeredAt: lastTriggeredAt === undefined ? definition.lastTriggeredAt : lastTriggeredAt,
        lastTriggerStatus: lastTriggerStatus === undefined ? definition.lastTriggerStatus : lastTriggerStatus,
        enabled: enabled ?? definition.enabled,
        updatedAt: nowIso(now),
      };
      triggerDefinitions.set(definitionId, updated);
      return clone(updated);
    },
  };

  const triggerDefinitionOverrideRepository: TriggerDefinitionOverrideRepository = {
    async getOverrideByDefinitionId(definitionId) {
      return clone(triggerDefinitionOverrides.get(definitionId) ?? null);
    },
    async listOverrides() {
      return Array.from(triggerDefinitionOverrides.values())
        .sort((a, b) => a.definitionId.localeCompare(b.definitionId))
        .map(clone);
    },
    async upsertOverride(input) {
      const timestamp = nowIso(input.now);
      const existing = triggerDefinitionOverrides.get(input.definitionId);
      const override: TriggerDefinitionOverride = {
        definitionId: input.definitionId,
        workspace: input.workspace,
        label: input.label ?? null,
        enabled: input.enabled ?? null,
        scheduleExpr: input.scheduleExpr ?? null,
        timezone: input.timezone ?? null,
        promptTemplate: input.promptTemplate ?? null,
        deliveryTarget: input.deliveryTarget ? clone(input.deliveryTarget) : null,
        managedBySessionId: input.managedBySessionId,
        managedByChatId: input.managedByChatId,
        managedByUserId: input.managedByUserId ?? null,
        appliedAt: input.appliedAt,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      triggerDefinitionOverrides.set(input.definitionId, override);
      return clone(override);
    },
  };

  const triggerExecutionRepository: TriggerExecutionRepository = {
    async createExecution(input) {
      const timestamp = nowIso(input.now);
      const execution: TriggerExecution = {
        id: randomUUID(),
        definitionId: input.definitionId,
        sourceType: input.sourceType,
        status: input.status,
        triggeredAt: input.triggeredAt ?? timestamp,
        inputDigest: input.inputDigest ?? null,
        runId: input.runId ?? null,
        deliveryStatus: input.deliveryStatus ?? null,
        rejectionReason: input.rejectionReason ?? null,
        failureCode: input.failureCode ?? null,
        failureMessage: input.failureMessage ?? null,
        finishedAt: input.finishedAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      triggerExecutions.set(execution.id, execution);
      return clone(execution);
    },
    async getExecutionById(executionId) {
      return clone(triggerExecutions.get(executionId) ?? null);
    },
    async getExecutionByRunId(runId) {
      const execution = Array.from(triggerExecutions.values()).find((candidate) => candidate.runId === runId);
      return execution ? clone(execution) : null;
    },
    async listExecutions() {
      return Array.from(triggerExecutions.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
    },
    async listExecutionsByDefinition(definitionId) {
      return Array.from(triggerExecutions.values())
        .filter((candidate) => candidate.definitionId === definitionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(clone);
    },
    async updateExecution({ executionId, status, runId, deliveryStatus, rejectionReason, failureCode, failureMessage, finishedAt, now }) {
      const execution = triggerExecutions.get(executionId);
      if (!execution) {
        throw new Error(`trigger execution not found: ${executionId}`);
      }
      const updated: TriggerExecution = {
        ...execution,
        status: status ?? execution.status,
        runId: runId === undefined ? execution.runId : runId,
        deliveryStatus: deliveryStatus === undefined ? execution.deliveryStatus : deliveryStatus,
        rejectionReason: rejectionReason === undefined ? execution.rejectionReason : rejectionReason,
        failureCode: failureCode === undefined ? execution.failureCode : failureCode,
        failureMessage: failureMessage === undefined ? execution.failureMessage : failureMessage,
        finishedAt: finishedAt === undefined ? execution.finishedAt : finishedAt,
        updatedAt: nowIso(now),
      };
      triggerExecutions.set(executionId, updated);
      return clone(updated);
    },
  };

  const scheduleManagementActionRepository: ScheduleManagementActionRepository = {
    async createAction(input) {
      const timestamp = nowIso(input.now);
      const action: ScheduleManagementAction = {
        id: randomUUID(),
        sessionId: input.sessionId,
        chatId: input.chatId,
        workspace: input.workspace,
        userId: input.userId ?? null,
        requestedText: input.requestedText,
        actionType: input.actionType,
        resolutionStatus: input.resolutionStatus,
        targetDefinitionId: input.targetDefinitionId ?? null,
        reason: input.reason ?? null,
        responseSummary: input.responseSummary ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      scheduleManagementActions.set(action.id, action);
      return clone(action);
    },
    async listActions() {
      return Array.from(scheduleManagementActions.values())
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(clone);
    },
    async listActionsByDefinition(definitionId) {
      return Array.from(scheduleManagementActions.values())
        .filter((action) => action.targetDefinitionId === definitionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(clone);
    },
  };

  const runRepository: RunRepository = {
    async createQueuedRun(input) {
      const run: Run = {
        id: randomUUID(),
        sessionId: input.sessionId,
        agentId: input.agentId,
        workspace: input.workspace,
        status: "queued",
        prompt: input.prompt,
        managementMode: input.managementMode ?? "none",
        triggerSource: input.triggerSource ?? "chat_message",
        triggerExecutionId: input.triggerExecutionId ?? null,
        triggerMessageId: input.triggerMessageId,
        triggerUserId: input.triggerUserId,
        timeoutSeconds: input.timeoutSeconds,
        requestedSandboxMode: input.requestedSandboxMode ?? null,
        resolvedSandboxMode: input.resolvedSandboxMode ?? input.requestedSandboxMode ?? "workspace-write",
        sandboxModeSource: input.sandboxModeSource ?? "workspace_default",
        requestedSessionMode: input.requestedSessionMode ?? "fresh",
        requestedBridgeSessionId: input.requestedBridgeSessionId ?? null,
        resolvedBridgeSessionId: null,
        sessionRecoveryAttempted: false,
        sessionRecoveryResult: null,
        deliveryTarget: input.deliveryTarget ? clone(input.deliveryTarget) : null,
        queuePosition: 0,
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        cancelRequestedAt: null,
        createdAt: nowIso(input.now),
      };
      runs.set(run.id, run);
      if (run.sessionId) {
        runIdsBySession.set(run.sessionId, [...(runIdsBySession.get(run.sessionId) ?? []), run.id]);
      }
      return clone(run);
    },
    async updateQueuePosition(runId, queuePosition) {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      const updated: Run = { ...run, queuePosition };
      runs.set(runId, updated);
      return clone(updated);
    },
    async getRunById(runId) {
      const run = runs.get(runId);
      return run ? clone(run) : null;
    },
    async listRuns() {
      return Array.from(runs.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
    },
    async findActiveRunBySession(sessionId) {
      const run = Array.from(runs.values()).find(
        (candidate) =>
          candidate.sessionId === sessionId
          && (candidate.status === "queued" || candidate.status === "running"),
      );
      return run ? clone(run) : null;
    },
    async findActiveRunByWorkspace(workspace) {
      const run = Array.from(runs.values()).find(
        (candidate) =>
          candidate.workspace === workspace
          && (candidate.status === "queued" || candidate.status === "running"),
      );
      return run ? clone(run) : null;
    },
    async getLatestRunBySession(sessionId) {
      const runIds = runIdsBySession.get(sessionId) ?? [];
      const latestId = runIds.at(-1);
      return latestId ? clone(runs.get(latestId) ?? null) : null;
    },
    async getLatestRunByChat(channel, chatId) {
      const sessionId = sessionsByChat.get(`${channel}:${chatId}`);
      if (!sessionId) {
        return null;
      }
      return this.getLatestRunBySession(sessionId);
    },
    async markRunStarted(runId, startedAt) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "running",
        startedAt,
        queuePosition: null,
      }));
    },
    async markRunCompleted(runId, finishedAt, _resultSummary, metadata) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "completed",
        finishedAt,
        resolvedBridgeSessionId: metadata?.resolvedBridgeSessionId ?? run.resolvedBridgeSessionId,
        sessionRecoveryAttempted: metadata?.sessionRecoveryAttempted ?? run.sessionRecoveryAttempted,
        sessionRecoveryResult: metadata?.sessionRecoveryResult ?? run.sessionRecoveryResult,
        queuePosition: null,
      }));
    },
    async markRunFailed(runId, finishedAt, failureCode, failureMessage, metadata) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "failed",
        finishedAt,
        failureCode,
        failureMessage,
        resolvedBridgeSessionId: metadata?.resolvedBridgeSessionId ?? run.resolvedBridgeSessionId,
        sessionRecoveryAttempted: metadata?.sessionRecoveryAttempted ?? run.sessionRecoveryAttempted,
        sessionRecoveryResult: metadata?.sessionRecoveryResult ?? run.sessionRecoveryResult,
        queuePosition: null,
      }));
    },
    async markRunCancelled(runId, finishedAt, reason) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "cancelled",
        finishedAt,
        failureCode: "cancelled",
        failureMessage: reason,
        queuePosition: null,
      }));
    },
    async markCancelRequested(runId, requestedAt) {
      const run = runs.get(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      const updated: Run = {
        ...run,
        cancelRequestedAt: requestedAt,
      };
      runs.set(runId, updated);
      return clone(updated);
    },
  };

  const eventRepository: RunEventRepository = {
    async appendEvent<TPayload = Record<string, unknown>>({ runId, eventType, payload, now }: {
      runId: string;
      eventType: RunEvent["eventType"];
      payload: TPayload;
      now?: Date;
    }) {
      const event: RunEvent<TPayload> = {
        id: randomUUID(),
        runId,
        eventType,
        payload,
        createdAt: nowIso(now),
      };
      events.set(runId, [...(events.get(runId) ?? []), event as RunEvent<Record<string, unknown>>]);
      return clone(event);
    },
    async listEventsByRun(runId) {
      return (events.get(runId) ?? []).map(clone);
    },
  };

  const deliveryRepository: DeliveryRepository = {
    async createDelivery({ runId, triggerExecutionId, chatId, deliveryKind, content, targetRef, now }) {
      const delivery: OutboundDelivery = {
        id: randomUUID(),
        runId,
        triggerExecutionId: triggerExecutionId ?? null,
        chatId,
        deliveryKind,
        content,
        targetRef: targetRef ?? null,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      };
      deliveries.set(delivery.id, delivery);
      return clone(delivery);
    },
    async markDeliverySent(deliveryId, now, targetRef) {
      return updateDelivery(deliveryId, "sent", null, now, targetRef);
    },
    async markDeliveryFailed(deliveryId, errorMessage, now) {
      return updateDelivery(deliveryId, "failed", errorMessage, now);
    },
    async listDeliveries() {
      return Array.from(deliveries.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
    },
  };

  const presentationRepository: PresentationRepository = {
    async createPendingPresentation({ runId, sessionId, chatId, now }) {
      const existing = presentations.get(runId);
      if (existing) {
        return clone(existing);
      }

      const presentation: RunPresentation = {
        runId,
        sessionId,
        chatId,
        phase: "pending_start",
        terminalStatus: null,
        streamingMessageId: null,
        streamingCardId: null,
        streamingElementId: null,
        fallbackTerminalMessageId: null,
        degradedReason: null,
        lastOutputSequence: null,
        lastOutputExcerpt: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      };
      presentations.set(runId, presentation);
      return clone(presentation);
    },
    async getPresentationByRunId(runId) {
      return clone(presentations.get(runId) ?? null);
    },
    async listPresentations() {
      return Array.from(presentations.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
    },
    async markPresentationStreaming({ runId, streamingMessageId, streamingCardId, streamingElementId, now }) {
      return updatePresentation(runId, (presentation) => ({
        ...presentation,
        phase: "streaming",
        streamingMessageId,
        streamingCardId,
        streamingElementId,
        updatedAt: nowIso(now),
      }));
    },
    async updatePresentationOutput({ runId, lastOutputSequence, lastOutputExcerpt, now }) {
      return updatePresentation(runId, (presentation) => ({
        ...presentation,
        lastOutputSequence,
        lastOutputExcerpt,
        updatedAt: nowIso(now),
      }));
    },
    async markPresentationTerminal({ runId, phase, terminalStatus, lastOutputSequence, lastOutputExcerpt, now }) {
      return updatePresentation(runId, (presentation) => ({
        ...presentation,
        phase,
        terminalStatus,
        lastOutputSequence: lastOutputSequence ?? presentation.lastOutputSequence,
        lastOutputExcerpt: lastOutputExcerpt ?? presentation.lastOutputExcerpt,
        updatedAt: nowIso(now),
      }));
    },
    async markPresentationDegraded({ runId, degradedReason, now }) {
      return updatePresentation(runId, (presentation) => ({
        ...presentation,
        phase: "degraded",
        degradedReason,
        updatedAt: nowIso(now),
      }));
    },
    async attachFallbackTerminal({ runId, fallbackTerminalMessageId, now }) {
      return updatePresentation(runId, (presentation) => ({
        ...presentation,
        fallbackTerminalMessageId,
        updatedAt: nowIso(now),
      }));
    },
  };

  const runMediaDeliveryRepository: RunMediaDeliveryRepository = {
    async createMediaDelivery(input) {
      const delivery: RunMediaDelivery = {
        id: randomUUID(),
        runId: input.runId,
        sessionId: input.sessionId,
        chatId: input.chatId,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        mediaKind: input.mediaKind,
        resolvedFileName: input.resolvedFileName ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        status: "requested",
        failureStage: null,
        failureReason: null,
        outboundDeliveryId: null,
        targetRef: null,
        createdAt: nowIso(input.now),
        updatedAt: nowIso(input.now),
      };
      runMediaDeliveries.set(delivery.id, delivery);
      return clone(delivery);
    },
    async updateMediaDelivery(input) {
      const delivery = runMediaDeliveries.get(input.mediaDeliveryId);
      if (!delivery) {
        throw new Error(`media delivery not found: ${input.mediaDeliveryId}`);
      }
      const updated: RunMediaDelivery = {
        ...delivery,
        status: input.status,
        failureStage: input.failureStage === undefined ? delivery.failureStage : input.failureStage,
        failureReason: input.failureReason === undefined ? delivery.failureReason : input.failureReason,
        outboundDeliveryId: input.outboundDeliveryId === undefined ? delivery.outboundDeliveryId : input.outboundDeliveryId,
        targetRef: input.targetRef === undefined ? delivery.targetRef : input.targetRef,
        mimeType: input.mimeType === undefined ? delivery.mimeType : input.mimeType,
        sizeBytes: input.sizeBytes === undefined ? delivery.sizeBytes : input.sizeBytes,
        resolvedFileName: input.resolvedFileName === undefined ? delivery.resolvedFileName : input.resolvedFileName,
        updatedAt: nowIso(input.now),
      };
      runMediaDeliveries.set(updated.id, updated);
      return clone(updated);
    },
    async listMediaDeliveries() {
      return Array.from(runMediaDeliveries.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
    },
  };

  function updateDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    lastError: string | null,
    now?: Date,
    targetRef?: string | null,
  ): OutboundDelivery {
    const delivery = deliveries.get(deliveryId);
    if (!delivery) {
      throw new Error(`delivery not found: ${deliveryId}`);
    }
    const updated: OutboundDelivery = {
      ...delivery,
      status,
      lastError,
      targetRef: targetRef ?? delivery.targetRef,
      attemptCount: delivery.attemptCount + 1,
      updatedAt: nowIso(now),
    };
    deliveries.set(deliveryId, updated);
    return clone(updated);
  }

  function updatePresentation(runId: string, updater: (presentation: RunPresentation) => RunPresentation): RunPresentation {
    const presentation = presentations.get(runId);
    if (!presentation) {
      throw new Error(`presentation not found: ${runId}`);
    }
    const updated = updater(presentation);
    presentations.set(runId, updated);
    return clone(updated);
  }

  function isTerminal(status: RunStatus) {
    return status === "completed" || status === "failed" || status === "cancelled";
  }

  function updateTerminalAwareRun(runId: string, updater: (run: Run) => Run): Run {
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`run not found: ${runId}`);
    }
    if (isTerminal(run.status)) {
      return clone(run);
    }
    const updated = updater(run);
    runs.set(runId, updated);
    return clone(updated);
  }

  return {
    sessions: sessionRepository,
    conversationSessionBindings: conversationSessionBindingRepository,
    chatSandboxOverrides: chatSandboxOverrideRepository,
    sessionWorkspaceBindings: sessionWorkspaceBindingRepository,
    workspaceCatalog: workspaceCatalogRepository,
    triggerDefinitions: triggerDefinitionRepository,
    triggerDefinitionOverrides: triggerDefinitionOverrideRepository,
    triggerExecutions: triggerExecutionRepository,
    scheduleManagementActions: scheduleManagementActionRepository,
    runs: runRepository,
    events: eventRepository,
    deliveries: deliveryRepository,
    runMediaDeliveries: runMediaDeliveryRepository,
    presentations: presentationRepository,
  };
}

export function createPostgresRepositories(client: PostgresClient): RepositoryBundle {
  const selectConversationSessionBindingSql =
    'SELECT session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, bridge, bridge_session_id AS "bridgeSessionId", sandbox_mode AS "sandboxMode", mode, status, last_bound_at AS "lastBoundAt", last_used_at AS "lastUsedAt", last_reset_at AS "lastResetAt", last_invalidated_at AS "lastInvalidatedAt", last_invalidation_reason AS "lastInvalidationReason", last_recovery_at AS "lastRecoveryAt", last_recovery_result AS "lastRecoveryResult", created_at AS "createdAt", updated_at AS "updatedAt" FROM conversation_session_bindings';
  const selectChatSandboxOverrideSql =
    'SELECT session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, sandbox_mode AS "sandboxMode", expires_at AS "expiresAt", set_by_user_id AS "setByUserId", created_at AS "createdAt", updated_at AS "updatedAt" FROM chat_sandbox_overrides';
  const selectSessionWorkspaceBindingSql =
    'SELECT session_id AS "sessionId", chat_id AS "chatId", workspace_key AS "workspaceKey", binding_source AS "bindingSource", created_at AS "createdAt", updated_at AS "updatedAt" FROM session_workspace_bindings';
  const selectWorkspaceCatalogSql =
    'SELECT workspace_key AS "workspaceKey", workspace_path AS "workspacePath", provision_source AS "provisionSource", template_ref AS "templateRef", created_at AS "createdAt", updated_at AS "updatedAt" FROM workspace_catalog';
  const selectTriggerDefinitionSql =
    'SELECT id, source_type AS "sourceType", definition_origin AS "definitionOrigin", slug, enabled, workspace, agent_id AS "agentId", label, prompt_template AS "promptTemplate", delivery_target AS "deliveryTarget", schedule_expr AS "scheduleExpr", timezone, next_due_at AS "nextDueAt", last_triggered_at AS "lastTriggeredAt", last_trigger_status AS "lastTriggerStatus", last_managed_at AS "lastManagedAt", last_managed_by_session_id AS "lastManagedBySessionId", last_managed_by_chat_id AS "lastManagedByChatId", last_management_action AS "lastManagementAction", secret_ref AS "secretRef", required_fields AS "requiredFields", optional_fields AS "optionalFields", replay_window_seconds AS "replayWindowSeconds", definition_hash AS "definitionHash", created_at AS "createdAt", updated_at AS "updatedAt" FROM trigger_definitions';
  const selectEffectiveManagedScheduleSql =
    'SELECT d.id, d.id AS "definitionId", d.source_type AS "sourceType", d.definition_origin AS "definitionOrigin", d.slug, d.workspace, d.agent_id AS "agentId", COALESCE(o.label, d.label) AS label, COALESCE(o.enabled, d.enabled) AS enabled, COALESCE(o.prompt_template, d.prompt_template) AS "promptTemplate", COALESCE(o.delivery_target, d.delivery_target) AS "deliveryTarget", COALESCE(o.schedule_expr, d.schedule_expr) AS "scheduleExpr", COALESCE(o.timezone, d.timezone) AS timezone, d.next_due_at AS "nextDueAt", d.last_triggered_at AS "lastTriggeredAt", d.last_trigger_status AS "lastTriggerStatus", COALESCE(o.applied_at, d.last_managed_at) AS "lastManagedAt", COALESCE(o.managed_by_session_id, d.last_managed_by_session_id) AS "lastManagedBySessionId", COALESCE(o.managed_by_chat_id, d.last_managed_by_chat_id) AS "lastManagedByChatId", d.last_management_action AS "lastManagementAction", d.secret_ref AS "secretRef", d.required_fields AS "requiredFields", d.optional_fields AS "optionalFields", d.replay_window_seconds AS "replayWindowSeconds", (o.definition_id IS NOT NULL) AS overridden, d.created_at AS "createdAt", COALESCE(o.updated_at, d.updated_at) AS "updatedAt" FROM trigger_definitions d LEFT JOIN trigger_definition_overrides o ON o.definition_id = d.id';
  const selectTriggerDefinitionOverrideSql =
    'SELECT definition_id AS "definitionId", workspace, label, enabled, schedule_expr AS "scheduleExpr", timezone, prompt_template AS "promptTemplate", delivery_target AS "deliveryTarget", managed_by_session_id AS "managedBySessionId", managed_by_chat_id AS "managedByChatId", managed_by_user_id AS "managedByUserId", applied_at AS "appliedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM trigger_definition_overrides';
  const selectScheduleManagementActionSql =
    'SELECT id, session_id AS "sessionId", chat_id AS "chatId", workspace, user_id AS "userId", requested_text AS "requestedText", action_type AS "actionType", resolution_status AS "resolutionStatus", target_definition_id AS "targetDefinitionId", reason, response_summary AS "responseSummary", created_at AS "createdAt", updated_at AS "updatedAt" FROM schedule_management_actions';
  const selectTriggerExecutionSql =
    'SELECT id, definition_id AS "definitionId", source_type AS "sourceType", status, triggered_at AS "triggeredAt", input_digest AS "inputDigest", run_id AS "runId", delivery_status AS "deliveryStatus", rejection_reason AS "rejectionReason", failure_code AS "failureCode", failure_message AS "failureMessage", finished_at AS "finishedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM trigger_executions';
  const selectRunSql =
    'SELECT id, session_id AS "sessionId", agent_id AS "agentId", workspace, status, prompt, management_mode AS "managementMode", trigger_source AS "triggerSource", trigger_execution_id AS "triggerExecutionId", trigger_message_id AS "triggerMessageId", trigger_user_id AS "triggerUserId", timeout_seconds AS "timeoutSeconds", requested_sandbox_mode AS "requestedSandboxMode", resolved_sandbox_mode AS "resolvedSandboxMode", sandbox_mode_source AS "sandboxModeSource", requested_session_mode AS "requestedSessionMode", requested_bridge_session_id AS "requestedBridgeSessionId", resolved_bridge_session_id AS "resolvedBridgeSessionId", session_recovery_attempted AS "sessionRecoveryAttempted", session_recovery_result AS "sessionRecoveryResult", delivery_target AS "deliveryTarget", queue_position AS "queuePosition", started_at AS "startedAt", finished_at AS "finishedAt", failure_code AS "failureCode", failure_message AS "failureMessage", cancel_requested_at AS "cancelRequestedAt", created_at AS "createdAt" FROM agent_runs';
  const selectRunPresentationSql =
    'SELECT run_id AS "runId", session_id AS "sessionId", chat_id AS "chatId", phase, terminal_status AS "terminalStatus", streaming_message_id AS "streamingMessageId", streaming_card_id AS "streamingCardId", streaming_element_id AS "streamingElementId", COALESCE(fallback_terminal_message_id, final_post_message_id) AS "fallbackTerminalMessageId", degraded_reason AS "degradedReason", last_output_sequence AS "lastOutputSequence", last_output_excerpt AS "lastOutputExcerpt", created_at AS "createdAt", updated_at AS "updatedAt" FROM run_presentations';
  const selectOutboundDeliverySql =
    'SELECT id, run_id AS "runId", trigger_execution_id AS "triggerExecutionId", chat_id AS "chatId", delivery_kind AS "deliveryKind", content, target_ref AS "targetRef", status, attempt_count AS "attemptCount", last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt" FROM outbound_deliveries';
  const selectRunMediaDeliverySql =
    'SELECT id, run_id AS "runId", session_id AS "sessionId", chat_id AS "chatId", source_type AS "sourceType", source_ref AS "sourceRef", media_kind AS "mediaKind", resolved_file_name AS "resolvedFileName", mime_type AS "mimeType", size_bytes AS "sizeBytes", status, failure_stage AS "failureStage", failure_reason AS "failureReason", outbound_delivery_id AS "outboundDeliveryId", target_ref AS "targetRef", created_at AS "createdAt", updated_at AS "updatedAt" FROM run_media_deliveries';

  const sessions: SessionRepository = {
    async getSessionById(sessionId) {
      const result = await client.query<Session>(
        "SELECT id, channel, chat_id AS \"chatId\", agent_id AS \"agentId\", workspace, status, last_seen_at AS \"lastSeenAt\" FROM sessions WHERE id = $1 LIMIT 1",
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async getOrCreateSession({ channel, chatId, agentConfig, now }) {
      const existing = await this.getSessionByChat(channel, chatId);
      if (existing) {
        await client.query(
          "UPDATE sessions SET last_seen_at = $1 WHERE id = $2",
          [nowIso(now), existing.id],
        );
        return {
          ...existing,
          lastSeenAt: nowIso(now),
        };
      }

      const session: Session = {
        id: randomUUID(),
        channel,
        chatId,
        agentId: agentConfig.id,
        workspace: agentConfig.workspace,
        status: "active",
        lastSeenAt: nowIso(now),
      };
      await client.query(
        "INSERT INTO sessions (id, channel, chat_id, agent_id, workspace, status, last_seen_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [session.id, session.channel, session.chatId, session.agentId, session.workspace, session.status, session.lastSeenAt],
      );
      return session;
    },
    async getSessionByChat(channel, chatId) {
      const result = await client.query<Session>(
        "SELECT id, channel, chat_id AS \"chatId\", agent_id AS \"agentId\", workspace, status, last_seen_at AS \"lastSeenAt\" FROM sessions WHERE channel = $1 AND chat_id = $2 LIMIT 1",
        [channel, chatId],
      );
      return result.rows[0] ?? null;
    },
    async listSessions() {
      const result = await client.query<Session>(
        "SELECT id, channel, chat_id AS \"chatId\", agent_id AS \"agentId\", workspace, status, last_seen_at AS \"lastSeenAt\" FROM sessions ORDER BY last_seen_at ASC",
      );
      return result.rows;
    },
  };

  const conversationSessionBindings: ConversationSessionBindingRepository = {
    async getBindingBySessionId(sessionId) {
      const result = await client.query<ConversationSessionBinding>(
        `${selectConversationSessionBindingSql} WHERE session_id = $1 LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async listBindings() {
      const result = await client.query<ConversationSessionBinding>(`${selectConversationSessionBindingSql} ORDER BY created_at ASC`);
      return result.rows;
    },
    async saveBindingContinuation(input) {
      const { session, bridge, bridgeSessionId, workspace, status, recoveryResult, now, sandboxMode: inputSandboxMode } =
        input;
      const timestamp = nowIso(now);
      const bindingWorkspace = workspace ?? session.workspace;
      const sandboxMode = inputSandboxMode ?? "workspace-write";
      const result = await client.query<ConversationSessionBinding>(
        `INSERT INTO conversation_session_bindings (
          session_id, chat_id, agent_id, workspace, bridge, bridge_session_id, sandbox_mode, mode, status,
          last_bound_at, last_used_at, last_reset_at, last_invalidated_at, last_invalidation_reason,
          last_recovery_at, last_recovery_result, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18
        )
        ON CONFLICT (session_id) DO UPDATE SET
          chat_id = EXCLUDED.chat_id,
          agent_id = EXCLUDED.agent_id,
          workspace = EXCLUDED.workspace,
          bridge = EXCLUDED.bridge,
          bridge_session_id = EXCLUDED.bridge_session_id,
          sandbox_mode = EXCLUDED.sandbox_mode,
          mode = EXCLUDED.mode,
          status = EXCLUDED.status,
          last_bound_at = EXCLUDED.last_bound_at,
          last_used_at = EXCLUDED.last_used_at,
          last_recovery_at = CASE WHEN EXCLUDED.status = 'recovered' THEN EXCLUDED.last_recovery_at ELSE conversation_session_bindings.last_recovery_at END,
          last_recovery_result = COALESCE(EXCLUDED.last_recovery_result, conversation_session_bindings.last_recovery_result),
          updated_at = EXCLUDED.updated_at
        RETURNING session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, bridge, bridge_session_id AS "bridgeSessionId", sandbox_mode AS "sandboxMode", mode, status, last_bound_at AS "lastBoundAt", last_used_at AS "lastUsedAt", last_reset_at AS "lastResetAt", last_invalidated_at AS "lastInvalidatedAt", last_invalidation_reason AS "lastInvalidationReason", last_recovery_at AS "lastRecoveryAt", last_recovery_result AS "lastRecoveryResult", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          session.id,
          session.chatId,
          session.agentId,
          bindingWorkspace,
          bridge,
          bridgeSessionId,
          sandboxMode,
          "continuation",
          status,
          timestamp,
          timestamp,
          null,
          null,
          null,
          status === "recovered" ? timestamp : null,
          recoveryResult ?? null,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0];
    },
    async markBindingReset({ session, now }) {
      const existing = await this.getBindingBySessionId(session.id);
      const timestamp = nowIso(now);
      const result = await client.query<ConversationSessionBinding>(
        `INSERT INTO conversation_session_bindings (
          session_id, chat_id, agent_id, workspace, bridge, bridge_session_id, sandbox_mode, mode, status,
          last_bound_at, last_used_at, last_reset_at, last_invalidated_at, last_invalidation_reason,
          last_recovery_at, last_recovery_result, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18
        )
        ON CONFLICT (session_id) DO UPDATE SET
          bridge_session_id = NULL,
          sandbox_mode = NULL,
          mode = 'fresh',
          status = 'reset',
          last_reset_at = EXCLUDED.last_reset_at,
          updated_at = EXCLUDED.updated_at
        RETURNING session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, bridge, bridge_session_id AS "bridgeSessionId", sandbox_mode AS "sandboxMode", mode, status, last_bound_at AS "lastBoundAt", last_used_at AS "lastUsedAt", last_reset_at AS "lastResetAt", last_invalidated_at AS "lastInvalidatedAt", last_invalidation_reason AS "lastInvalidationReason", last_recovery_at AS "lastRecoveryAt", last_recovery_result AS "lastRecoveryResult", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          session.id,
          session.chatId,
          session.agentId,
          session.workspace,
          "codex",
          null,
          null,
          "fresh",
          "reset",
          existing?.lastBoundAt ?? null,
          existing?.lastUsedAt ?? null,
          timestamp,
          existing?.lastInvalidatedAt ?? null,
          existing?.lastInvalidationReason ?? null,
          existing?.lastRecoveryAt ?? null,
          existing?.lastRecoveryResult ?? null,
          existing?.createdAt ?? timestamp,
          timestamp,
        ],
      );
      return result.rows[0];
    },
    async markBindingInvalidated({ session, reason, recoveryResult, now }) {
      const existing = await this.getBindingBySessionId(session.id);
      const timestamp = nowIso(now);
      const result = await client.query<ConversationSessionBinding>(
        `INSERT INTO conversation_session_bindings (
          session_id, chat_id, agent_id, workspace, bridge, bridge_session_id, sandbox_mode, mode, status,
          last_bound_at, last_used_at, last_reset_at, last_invalidated_at, last_invalidation_reason,
          last_recovery_at, last_recovery_result, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18
        )
        ON CONFLICT (session_id) DO UPDATE SET
          bridge_session_id = NULL,
          sandbox_mode = NULL,
          mode = 'fresh',
          status = 'invalidated',
          last_invalidated_at = EXCLUDED.last_invalidated_at,
          last_invalidation_reason = EXCLUDED.last_invalidation_reason,
          last_recovery_at = COALESCE(EXCLUDED.last_recovery_at, conversation_session_bindings.last_recovery_at),
          last_recovery_result = COALESCE(EXCLUDED.last_recovery_result, conversation_session_bindings.last_recovery_result),
          updated_at = EXCLUDED.updated_at
        RETURNING session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, bridge, bridge_session_id AS "bridgeSessionId", sandbox_mode AS "sandboxMode", mode, status, last_bound_at AS "lastBoundAt", last_used_at AS "lastUsedAt", last_reset_at AS "lastResetAt", last_invalidated_at AS "lastInvalidatedAt", last_invalidation_reason AS "lastInvalidationReason", last_recovery_at AS "lastRecoveryAt", last_recovery_result AS "lastRecoveryResult", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          session.id,
          session.chatId,
          session.agentId,
          session.workspace,
          existing?.bridge ?? "codex",
          null,
          null,
          "fresh",
          "invalidated",
          existing?.lastBoundAt ?? null,
          existing?.lastUsedAt ?? null,
          existing?.lastResetAt ?? null,
          timestamp,
          reason,
          recoveryResult ? timestamp : existing?.lastRecoveryAt ?? null,
          recoveryResult ?? existing?.lastRecoveryResult ?? null,
          existing?.createdAt ?? timestamp,
          timestamp,
        ],
      );
      return result.rows[0];
    },
  };

  const chatSandboxOverrides: ChatSandboxOverrideRepository = {
    async getOverrideBySessionId(sessionId) {
      const result = await client.query<ChatSandboxOverride>(
        `${selectChatSandboxOverrideSql} WHERE session_id = $1 LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async listOverrides() {
      const result = await client.query<ChatSandboxOverride>(
        `${selectChatSandboxOverrideSql} ORDER BY created_at ASC`,
      );
      return result.rows;
    },
    async upsertOverride(input) {
      const timestamp = nowIso(input.now);
      const result = await client.query<ChatSandboxOverride>(
        `INSERT INTO chat_sandbox_overrides (
          session_id, chat_id, agent_id, workspace, sandbox_mode, expires_at, set_by_user_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (session_id) DO UPDATE SET
          chat_id = EXCLUDED.chat_id,
          agent_id = EXCLUDED.agent_id,
          workspace = EXCLUDED.workspace,
          sandbox_mode = EXCLUDED.sandbox_mode,
          expires_at = EXCLUDED.expires_at,
          set_by_user_id = EXCLUDED.set_by_user_id,
          updated_at = EXCLUDED.updated_at
        RETURNING session_id AS "sessionId", chat_id AS "chatId", agent_id AS "agentId", workspace, sandbox_mode AS "sandboxMode", expires_at AS "expiresAt", set_by_user_id AS "setByUserId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          input.sessionId,
          input.chatId,
          input.agentId,
          input.workspace,
          input.sandboxMode,
          input.expiresAt,
          input.setByUserId ?? null,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0]!;
    },
    async deleteOverrideBySessionId(sessionId) {
      await client.query("DELETE FROM chat_sandbox_overrides WHERE session_id = $1", [sessionId]);
    },
  };

  const sessionWorkspaceBindings: SessionWorkspaceBindingRepository = {
    async getBindingBySessionId(sessionId) {
      const result = await client.query<SessionWorkspaceBinding>(
        `${selectSessionWorkspaceBindingSql} WHERE session_id = $1 LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async listBindings() {
      const result = await client.query<SessionWorkspaceBinding>(
        `${selectSessionWorkspaceBindingSql} ORDER BY created_at ASC`,
      );
      return result.rows;
    },
    async saveBinding({ session, workspaceKey, bindingSource, now }) {
      const timestamp = nowIso(now);
      const result = await client.query<SessionWorkspaceBinding>(
        `INSERT INTO session_workspace_bindings (
          session_id, chat_id, workspace_key, binding_source, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (session_id) DO UPDATE SET
          chat_id = EXCLUDED.chat_id,
          workspace_key = EXCLUDED.workspace_key,
          binding_source = EXCLUDED.binding_source,
          updated_at = EXCLUDED.updated_at
        RETURNING session_id AS "sessionId", chat_id AS "chatId", workspace_key AS "workspaceKey", binding_source AS "bindingSource", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [session.id, session.chatId, workspaceKey, bindingSource, timestamp, timestamp],
      );
      return result.rows[0];
    },
  };

  const workspaceCatalog: WorkspaceCatalogRepository = {
    async getEntryByWorkspaceKey(workspaceKey) {
      const result = await client.query<WorkspaceCatalogEntry>(
        `${selectWorkspaceCatalogSql} WHERE workspace_key = $1 LIMIT 1`,
        [workspaceKey],
      );
      return result.rows[0] ?? null;
    },
    async listEntries() {
      const result = await client.query<WorkspaceCatalogEntry>(
        `${selectWorkspaceCatalogSql} ORDER BY created_at ASC`,
      );
      return result.rows;
    },
    async createEntry({ workspaceKey, workspacePath, provisionSource, templateRef, now }) {
      const timestamp = nowIso(now);
      const result = await client.query<WorkspaceCatalogEntry>(
        `INSERT INTO workspace_catalog (
          workspace_key, workspace_path, provision_source, template_ref, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workspace_key) DO UPDATE SET
          workspace_path = EXCLUDED.workspace_path,
          provision_source = EXCLUDED.provision_source,
          template_ref = EXCLUDED.template_ref,
          updated_at = EXCLUDED.updated_at
        RETURNING workspace_key AS "workspaceKey", workspace_path AS "workspacePath", provision_source AS "provisionSource", template_ref AS "templateRef", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [workspaceKey, workspacePath, provisionSource, templateRef ?? null, timestamp, timestamp],
      );
      return result.rows[0];
    },
  };


  const triggerDefinitions: TriggerDefinitionRepository = {
    async getDefinitionById(definitionId) {
      const result = await client.query<TriggerDefinition>(
        `${selectTriggerDefinitionSql} WHERE id = $1 LIMIT 1`,
        [definitionId],
      );
      return result.rows[0] ?? null;
    },
    async getEffectiveDefinitionById(definitionId) {
      const result = await client.query<EffectiveManagedSchedule>(
        `${selectEffectiveManagedScheduleSql} WHERE d.id = $1 LIMIT 1`,
        [definitionId],
      );
      return result.rows[0] ?? null;
    },
    async getDefinitionBySlug(slug) {
      const result = await client.query<TriggerDefinition>(
        `${selectTriggerDefinitionSql} WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      return result.rows[0] ?? null;
    },
    async listDefinitions() {
      const result = await client.query<TriggerDefinition>(`${selectTriggerDefinitionSql} ORDER BY id ASC`);
      return result.rows;
    },
    async listEffectiveDefinitions() {
      const result = await client.query<EffectiveManagedSchedule>(
        `${selectEffectiveManagedScheduleSql} ORDER BY "definitionId" ASC`,
      );
      return result.rows;
    },
    async upsertDefinition(input) {
      const timestamp = nowIso(input.now);
      const result = await client.query<TriggerDefinition>(
        `INSERT INTO trigger_definitions (
          id, source_type, definition_origin, slug, enabled, workspace, agent_id, label, prompt_template, delivery_target,
          schedule_expr, timezone, next_due_at, last_triggered_at, last_trigger_status, last_managed_at, last_managed_by_session_id, last_managed_by_chat_id, last_management_action, secret_ref,
          required_fields, optional_fields, replay_window_seconds, definition_hash, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
          source_type = EXCLUDED.source_type,
          definition_origin = EXCLUDED.definition_origin,
          slug = EXCLUDED.slug,
          enabled = EXCLUDED.enabled,
          workspace = EXCLUDED.workspace,
          agent_id = EXCLUDED.agent_id,
          label = EXCLUDED.label,
          prompt_template = EXCLUDED.prompt_template,
          delivery_target = EXCLUDED.delivery_target,
          schedule_expr = EXCLUDED.schedule_expr,
          timezone = EXCLUDED.timezone,
          next_due_at = EXCLUDED.next_due_at,
          last_triggered_at = COALESCE(EXCLUDED.last_triggered_at, trigger_definitions.last_triggered_at),
          last_trigger_status = COALESCE(EXCLUDED.last_trigger_status, trigger_definitions.last_trigger_status),
          last_managed_at = COALESCE(EXCLUDED.last_managed_at, trigger_definitions.last_managed_at),
          last_managed_by_session_id = COALESCE(EXCLUDED.last_managed_by_session_id, trigger_definitions.last_managed_by_session_id),
          last_managed_by_chat_id = COALESCE(EXCLUDED.last_managed_by_chat_id, trigger_definitions.last_managed_by_chat_id),
          last_management_action = COALESCE(EXCLUDED.last_management_action, trigger_definitions.last_management_action),
          secret_ref = EXCLUDED.secret_ref,
          required_fields = EXCLUDED.required_fields,
          optional_fields = EXCLUDED.optional_fields,
          replay_window_seconds = EXCLUDED.replay_window_seconds,
          definition_hash = EXCLUDED.definition_hash,
          updated_at = EXCLUDED.updated_at
        RETURNING id, source_type AS "sourceType", definition_origin AS "definitionOrigin", slug, enabled, workspace, agent_id AS "agentId", label, prompt_template AS "promptTemplate", delivery_target AS "deliveryTarget", schedule_expr AS "scheduleExpr", timezone, next_due_at AS "nextDueAt", last_triggered_at AS "lastTriggeredAt", last_trigger_status AS "lastTriggerStatus", last_managed_at AS "lastManagedAt", last_managed_by_session_id AS "lastManagedBySessionId", last_managed_by_chat_id AS "lastManagedByChatId", last_management_action AS "lastManagementAction", secret_ref AS "secretRef", required_fields AS "requiredFields", optional_fields AS "optionalFields", replay_window_seconds AS "replayWindowSeconds", definition_hash AS "definitionHash", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          input.id,
          input.sourceType,
          input.definitionOrigin,
          input.slug,
          input.enabled,
          input.workspace,
          input.agentId,
          input.label,
          input.promptTemplate,
          JSON.stringify(input.deliveryTarget),
          input.scheduleExpr ?? null,
          input.timezone ?? null,
          input.nextDueAt ?? null,
          input.lastTriggeredAt ?? null,
          input.lastTriggerStatus ?? null,
          input.lastManagedAt ?? null,
          input.lastManagedBySessionId ?? null,
          input.lastManagedByChatId ?? null,
          input.lastManagementAction ?? null,
          input.secretRef ?? null,
          input.requiredFields,
          input.optionalFields,
          input.replayWindowSeconds ?? null,
          input.definitionHash ?? null,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0];
    },
    async updateDefinitionRuntimeState({ definitionId, nextDueAt, lastTriggeredAt, lastTriggerStatus, enabled, now }) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (nextDueAt !== undefined) {
        params.push(nextDueAt);
        updates.push(`next_due_at = $${params.length}`);
      }
      if (lastTriggeredAt !== undefined) {
        params.push(lastTriggeredAt);
        updates.push(`last_triggered_at = $${params.length}`);
      }
      if (lastTriggerStatus !== undefined) {
        params.push(lastTriggerStatus);
        updates.push(`last_trigger_status = $${params.length}`);
      }
      if (enabled !== undefined) {
        params.push(enabled);
        updates.push(`enabled = $${params.length}`);
      }
      params.push(nowIso(now));
      updates.push(`updated_at = $${params.length}`);
      params.push(definitionId);

      const result = await client.query<TriggerDefinition>(
        `UPDATE trigger_definitions SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, source_type AS "sourceType", definition_origin AS "definitionOrigin", slug, enabled, workspace, agent_id AS "agentId", label, prompt_template AS "promptTemplate", delivery_target AS "deliveryTarget", schedule_expr AS "scheduleExpr", timezone, next_due_at AS "nextDueAt", last_triggered_at AS "lastTriggeredAt", last_trigger_status AS "lastTriggerStatus", last_managed_at AS "lastManagedAt", last_managed_by_session_id AS "lastManagedBySessionId", last_managed_by_chat_id AS "lastManagedByChatId", last_management_action AS "lastManagementAction", secret_ref AS "secretRef", required_fields AS "requiredFields", optional_fields AS "optionalFields", replay_window_seconds AS "replayWindowSeconds", definition_hash AS "definitionHash", created_at AS "createdAt", updated_at AS "updatedAt"`,
        params,
      );
      const definition = result.rows[0];
      if (!definition) {
        throw new Error(`trigger definition not found: ${definitionId}`);
      }
      return definition;
    },
  };

  const triggerDefinitionOverrides: TriggerDefinitionOverrideRepository = {
    async getOverrideByDefinitionId(definitionId) {
      const result = await client.query<TriggerDefinitionOverride>(
        `${selectTriggerDefinitionOverrideSql} WHERE definition_id = $1 LIMIT 1`,
        [definitionId],
      );
      return result.rows[0] ?? null;
    },
    async listOverrides() {
      const result = await client.query<TriggerDefinitionOverride>(
        `${selectTriggerDefinitionOverrideSql} ORDER BY definition_id ASC`,
      );
      return result.rows;
    },
    async upsertOverride(input) {
      const timestamp = nowIso(input.now);
      const result = await client.query<TriggerDefinitionOverride>(
        `INSERT INTO trigger_definition_overrides (
          definition_id, workspace, label, enabled, schedule_expr, timezone, prompt_template, delivery_target,
          managed_by_session_id, managed_by_chat_id, managed_by_user_id, applied_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
          $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (definition_id) DO UPDATE SET
          workspace = EXCLUDED.workspace,
          label = EXCLUDED.label,
          enabled = EXCLUDED.enabled,
          schedule_expr = EXCLUDED.schedule_expr,
          timezone = EXCLUDED.timezone,
          prompt_template = EXCLUDED.prompt_template,
          delivery_target = EXCLUDED.delivery_target,
          managed_by_session_id = EXCLUDED.managed_by_session_id,
          managed_by_chat_id = EXCLUDED.managed_by_chat_id,
          managed_by_user_id = EXCLUDED.managed_by_user_id,
          applied_at = EXCLUDED.applied_at,
          updated_at = EXCLUDED.updated_at
        RETURNING definition_id AS "definitionId", workspace, label, enabled, schedule_expr AS "scheduleExpr", timezone, prompt_template AS "promptTemplate", delivery_target AS "deliveryTarget", managed_by_session_id AS "managedBySessionId", managed_by_chat_id AS "managedByChatId", managed_by_user_id AS "managedByUserId", applied_at AS "appliedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          input.definitionId,
          input.workspace,
          input.label ?? null,
          input.enabled ?? null,
          input.scheduleExpr ?? null,
          input.timezone ?? null,
          input.promptTemplate ?? null,
          input.deliveryTarget ? JSON.stringify(input.deliveryTarget) : null,
          input.managedBySessionId,
          input.managedByChatId,
          input.managedByUserId ?? null,
          input.appliedAt,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0]!;
    },
  };

  const scheduleManagementActions: ScheduleManagementActionRepository = {
    async createAction(input) {
      const timestamp = nowIso(input.now);
      const result = await client.query<ScheduleManagementAction>(
        `INSERT INTO schedule_management_actions (
          id, session_id, chat_id, workspace, user_id, requested_text, action_type, resolution_status, target_definition_id, reason, response_summary, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        RETURNING id, session_id AS "sessionId", chat_id AS "chatId", workspace, user_id AS "userId", requested_text AS "requestedText", action_type AS "actionType", resolution_status AS "resolutionStatus", target_definition_id AS "targetDefinitionId", reason, response_summary AS "responseSummary", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          randomUUID(),
          input.sessionId,
          input.chatId,
          input.workspace,
          input.userId ?? null,
          input.requestedText,
          input.actionType,
          input.resolutionStatus,
          input.targetDefinitionId ?? null,
          input.reason ?? null,
          input.responseSummary ?? null,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0]!;
    },
    async listActions() {
      const result = await client.query<ScheduleManagementAction>(
        `${selectScheduleManagementActionSql} ORDER BY created_at ASC`,
      );
      return result.rows;
    },
    async listActionsByDefinition(definitionId) {
      const result = await client.query<ScheduleManagementAction>(
        `${selectScheduleManagementActionSql} WHERE target_definition_id = $1 ORDER BY created_at ASC`,
        [definitionId],
      );
      return result.rows;
    },
  };

  const triggerExecutions: TriggerExecutionRepository = {
    async createExecution(input) {
      const timestamp = nowIso(input.now);
      const result = await client.query<TriggerExecution>(
        `INSERT INTO trigger_executions (
          id, definition_id, source_type, status, triggered_at, input_digest, run_id, delivery_status,
          rejection_reason, failure_code, failure_message, finished_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14
        )
        RETURNING id, definition_id AS "definitionId", source_type AS "sourceType", status, triggered_at AS "triggeredAt", input_digest AS "inputDigest", run_id AS "runId", delivery_status AS "deliveryStatus", rejection_reason AS "rejectionReason", failure_code AS "failureCode", failure_message AS "failureMessage", finished_at AS "finishedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          randomUUID(),
          input.definitionId,
          input.sourceType,
          input.status,
          input.triggeredAt ?? timestamp,
          input.inputDigest ?? null,
          input.runId ?? null,
          input.deliveryStatus ?? null,
          input.rejectionReason ?? null,
          input.failureCode ?? null,
          input.failureMessage ?? null,
          input.finishedAt ?? null,
          timestamp,
          timestamp,
        ],
      );
      return result.rows[0]!;
    },
    async getExecutionById(executionId) {
      const result = await client.query<TriggerExecution>(
        `${selectTriggerExecutionSql} WHERE id = $1 LIMIT 1`,
        [executionId],
      );
      return result.rows[0] ?? null;
    },
    async getExecutionByRunId(runId) {
      const result = await client.query<TriggerExecution>(
        `${selectTriggerExecutionSql} WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [runId],
      );
      return result.rows[0] ?? null;
    },
    async listExecutions() {
      const result = await client.query<TriggerExecution>(`${selectTriggerExecutionSql} ORDER BY created_at ASC`);
      return result.rows;
    },
    async listExecutionsByDefinition(definitionId) {
      const result = await client.query<TriggerExecution>(
        `${selectTriggerExecutionSql} WHERE definition_id = $1 ORDER BY created_at ASC`,
        [definitionId],
      );
      return result.rows;
    },
    async updateExecution({ executionId, status, runId, deliveryStatus, rejectionReason, failureCode, failureMessage, finishedAt, now }) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (status !== undefined) {
        params.push(status);
        updates.push(`status = $${params.length}`);
      }
      if (runId !== undefined) {
        params.push(runId);
        updates.push(`run_id = $${params.length}`);
      }
      if (deliveryStatus !== undefined) {
        params.push(deliveryStatus);
        updates.push(`delivery_status = $${params.length}`);
      }
      if (rejectionReason !== undefined) {
        params.push(rejectionReason);
        updates.push(`rejection_reason = $${params.length}`);
      }
      if (failureCode !== undefined) {
        params.push(failureCode);
        updates.push(`failure_code = $${params.length}`);
      }
      if (failureMessage !== undefined) {
        params.push(failureMessage);
        updates.push(`failure_message = $${params.length}`);
      }
      if (finishedAt !== undefined) {
        params.push(finishedAt);
        updates.push(`finished_at = $${params.length}`);
      }
      params.push(nowIso(now));
      updates.push(`updated_at = $${params.length}`);
      params.push(executionId);

      const result = await client.query<TriggerExecution>(
        `UPDATE trigger_executions SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, definition_id AS "definitionId", source_type AS "sourceType", status, triggered_at AS "triggeredAt", input_digest AS "inputDigest", run_id AS "runId", delivery_status AS "deliveryStatus", rejection_reason AS "rejectionReason", failure_code AS "failureCode", failure_message AS "failureMessage", finished_at AS "finishedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
        params,
      );
      const execution = result.rows[0];
      if (!execution) {
        throw new Error(`trigger execution not found: ${executionId}`);
      }
      return execution;
    },
  };

  const runs: RunRepository = {
    async createQueuedRun(input) {
      const run: Run = {
        id: randomUUID(),
        sessionId: input.sessionId,
        agentId: input.agentId,
        workspace: input.workspace,
        status: "queued",
        prompt: input.prompt,
        managementMode: input.managementMode ?? "none",
        triggerSource: input.triggerSource ?? "chat_message",
        triggerExecutionId: input.triggerExecutionId ?? null,
        triggerMessageId: input.triggerMessageId,
        triggerUserId: input.triggerUserId,
        timeoutSeconds: input.timeoutSeconds,
        requestedSandboxMode: input.requestedSandboxMode ?? null,
        resolvedSandboxMode: input.resolvedSandboxMode ?? input.requestedSandboxMode ?? "workspace-write",
        sandboxModeSource: input.sandboxModeSource ?? "workspace_default",
        requestedSessionMode: input.requestedSessionMode ?? "fresh",
        requestedBridgeSessionId: input.requestedBridgeSessionId ?? null,
        resolvedBridgeSessionId: null,
        sessionRecoveryAttempted: false,
        sessionRecoveryResult: null,
        deliveryTarget: input.deliveryTarget ?? null,
        queuePosition: 0,
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        cancelRequestedAt: null,
        createdAt: nowIso(input.now),
      };
      await client.query(
        "INSERT INTO agent_runs (id, session_id, agent_id, workspace, status, prompt, management_mode, trigger_source, trigger_execution_id, trigger_message_id, trigger_user_id, timeout_seconds, requested_sandbox_mode, resolved_sandbox_mode, sandbox_mode_source, requested_session_mode, requested_bridge_session_id, resolved_bridge_session_id, session_recovery_attempted, session_recovery_result, delivery_target, queue_position, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23)",
        [
          run.id,
          run.sessionId,
          run.agentId,
          run.workspace,
          run.status,
          run.prompt,
          run.managementMode,
          run.triggerSource,
          run.triggerExecutionId,
          run.triggerMessageId,
          run.triggerUserId,
          run.timeoutSeconds,
          run.requestedSandboxMode,
          run.resolvedSandboxMode,
          run.sandboxModeSource,
          run.requestedSessionMode,
          run.requestedBridgeSessionId,
          run.resolvedBridgeSessionId,
          run.sessionRecoveryAttempted,
          run.sessionRecoveryResult,
          run.deliveryTarget ? JSON.stringify(run.deliveryTarget) : null,
          run.queuePosition,
          run.createdAt,
        ],
      );
      return run;
    },
    async updateQueuePosition(runId, queuePosition) {
      await client.query("UPDATE agent_runs SET queue_position = $1 WHERE id = $2", [queuePosition, runId]);
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async getRunById(runId) {
      const result = await client.query<Run>(
        `${selectRunSql} WHERE id = $1 LIMIT 1`,
        [runId],
      );
      return result.rows[0] ?? null;
    },
    async listRuns() {
      const result = await client.query<Run>(
        `${selectRunSql} ORDER BY created_at ASC`,
      );
      return result.rows;
    },
    async findActiveRunBySession(sessionId) {
      const result = await client.query<Run>(
        `${selectRunSql} WHERE session_id = $1 AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async findActiveRunByWorkspace(workspace) {
      const result = await client.query<Run>(
        `${selectRunSql} WHERE workspace = $1 AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1`,
        [workspace],
      );
      return result.rows[0] ?? null;
    },
    async getLatestRunBySession(sessionId) {
      const result = await client.query<Run>(
        `${selectRunSql} WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    },
    async getLatestRunByChat(channel, chatId) {
      const session = await sessions.getSessionByChat(channel, chatId);
      return session ? this.getLatestRunBySession(session.id) : null;
    },
    async markRunStarted(runId, startedAt) {
      await client.query("UPDATE agent_runs SET status = 'running', started_at = $1, queue_position = NULL WHERE id = $2", [
        startedAt,
        runId,
      ]);
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async markRunCompleted(runId, finishedAt, _resultSummary, metadata) {
      await client.query(
        "UPDATE agent_runs SET status = 'completed', finished_at = $1, resolved_bridge_session_id = COALESCE($2, resolved_bridge_session_id), session_recovery_attempted = $3, session_recovery_result = $4, queue_position = NULL WHERE id = $5",
        [
          finishedAt,
          metadata?.resolvedBridgeSessionId ?? null,
          metadata?.sessionRecoveryAttempted ?? false,
          metadata?.sessionRecoveryResult ?? null,
          runId,
        ],
      );
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async markRunFailed(runId, finishedAt, failureCode, failureMessage, metadata) {
      await client.query(
        "UPDATE agent_runs SET status = 'failed', finished_at = $1, failure_code = $2, failure_message = $3, resolved_bridge_session_id = COALESCE($4, resolved_bridge_session_id), session_recovery_attempted = $5, session_recovery_result = $6, queue_position = NULL WHERE id = $7",
        [
          finishedAt,
          failureCode,
          failureMessage,
          metadata?.resolvedBridgeSessionId ?? null,
          metadata?.sessionRecoveryAttempted ?? false,
          metadata?.sessionRecoveryResult ?? null,
          runId,
        ],
      );
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async markRunCancelled(runId, finishedAt, reason) {
      await client.query(
        "UPDATE agent_runs SET status = 'cancelled', finished_at = $1, failure_code = 'cancelled', failure_message = $2, queue_position = NULL WHERE id = $3",
        [finishedAt, reason, runId],
      );
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async markCancelRequested(runId, requestedAt) {
      await client.query("UPDATE agent_runs SET cancel_requested_at = $1 WHERE id = $2", [requestedAt, runId]);
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
  };

  const events: RunEventRepository = {
    async appendEvent<TPayload = Record<string, unknown>>({ runId, eventType, payload, now }: {
      runId: string;
      eventType: RunEvent["eventType"];
      payload: TPayload;
      now?: Date;
    }) {
      const event: RunEvent<TPayload> = {
        id: randomUUID(),
        runId,
        eventType,
        payload,
        createdAt: nowIso(now),
      };
      await client.query(
        "INSERT INTO run_events (id, run_id, event_type, payload, created_at) VALUES ($1, $2, $3, $4::jsonb, $5)",
        [event.id, event.runId, event.eventType, JSON.stringify(event.payload), event.createdAt],
      );
      return event;
    },
    async listEventsByRun(runId) {
      const result = await client.query<RunEvent<Record<string, unknown>>>(
        "SELECT id, run_id AS \"runId\", event_type AS \"eventType\", payload, created_at AS \"createdAt\" FROM run_events WHERE run_id = $1 ORDER BY created_at ASC",
        [runId],
      );
      return result.rows;
    },
  };

  const deliveries: DeliveryRepository = {
    async createDelivery({ runId, triggerExecutionId, chatId, deliveryKind, content, targetRef, now }) {
      const delivery: OutboundDelivery = {
        id: randomUUID(),
        runId,
        triggerExecutionId: triggerExecutionId ?? null,
        chatId,
        deliveryKind,
        content,
        targetRef: targetRef ?? null,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      };
      await client.query(
        "INSERT INTO outbound_deliveries (id, run_id, trigger_execution_id, chat_id, delivery_kind, content, target_ref, status, attempt_count, last_error, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [
          delivery.id,
          delivery.runId,
          delivery.triggerExecutionId,
          delivery.chatId,
          delivery.deliveryKind,
          delivery.content,
          delivery.targetRef,
          delivery.status,
          delivery.attemptCount,
          delivery.lastError,
          delivery.createdAt,
          delivery.updatedAt,
        ],
      );
      return delivery;
    },
    async markDeliverySent(deliveryId, now, targetRef) {
      await client.query(
        "UPDATE outbound_deliveries SET status = 'sent', target_ref = COALESCE($1, target_ref), attempt_count = attempt_count + 1, updated_at = $2 WHERE id = $3",
        [targetRef ?? null, nowIso(now), deliveryId],
      );
      const result = await client.query<OutboundDelivery>(`${selectOutboundDeliverySql} WHERE id = $1 LIMIT 1`, [deliveryId]);
      return result.rows[0];
    },
    async markDeliveryFailed(deliveryId, errorMessage, now) {
      await client.query(
        "UPDATE outbound_deliveries SET status = 'failed', attempt_count = attempt_count + 1, last_error = $1, updated_at = $2 WHERE id = $3",
        [errorMessage, nowIso(now), deliveryId],
      );
      const result = await client.query<OutboundDelivery>(`${selectOutboundDeliverySql} WHERE id = $1 LIMIT 1`, [deliveryId]);
      return result.rows[0];
    },
    async listDeliveries() {
      const result = await client.query<OutboundDelivery>(`${selectOutboundDeliverySql} ORDER BY created_at ASC`);
      return result.rows;
    },
  };

  const runMediaDeliveries: RunMediaDeliveryRepository = {
    async createMediaDelivery(input) {
      const delivery: RunMediaDelivery = {
        id: randomUUID(),
        runId: input.runId,
        sessionId: input.sessionId,
        chatId: input.chatId,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        mediaKind: input.mediaKind,
        resolvedFileName: input.resolvedFileName ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        status: "requested",
        failureStage: null,
        failureReason: null,
        outboundDeliveryId: null,
        targetRef: null,
        createdAt: nowIso(input.now),
        updatedAt: nowIso(input.now),
      };
      await client.query(
        "INSERT INTO run_media_deliveries (id, run_id, session_id, chat_id, source_type, source_ref, media_kind, resolved_file_name, mime_type, size_bytes, status, failure_stage, failure_reason, outbound_delivery_id, target_ref, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
        [
          delivery.id,
          delivery.runId,
          delivery.sessionId,
          delivery.chatId,
          delivery.sourceType,
          delivery.sourceRef,
          delivery.mediaKind,
          delivery.resolvedFileName,
          delivery.mimeType,
          delivery.sizeBytes,
          delivery.status,
          delivery.failureStage,
          delivery.failureReason,
          delivery.outboundDeliveryId,
          delivery.targetRef,
          delivery.createdAt,
          delivery.updatedAt,
        ],
      );
      return delivery;
    },
    async updateMediaDelivery(input) {
      await client.query(
        "UPDATE run_media_deliveries SET status = $1, failure_stage = COALESCE($2, failure_stage), failure_reason = COALESCE($3, failure_reason), outbound_delivery_id = COALESCE($4, outbound_delivery_id), target_ref = COALESCE($5, target_ref), mime_type = COALESCE($6, mime_type), size_bytes = COALESCE($7, size_bytes), resolved_file_name = COALESCE($8, resolved_file_name), updated_at = $9 WHERE id = $10",
        [
          input.status,
          input.failureStage ?? null,
          input.failureReason ?? null,
          input.outboundDeliveryId ?? null,
          input.targetRef ?? null,
          input.mimeType ?? null,
          input.sizeBytes ?? null,
          input.resolvedFileName ?? null,
          nowIso(input.now),
          input.mediaDeliveryId,
        ],
      );
      const result = await client.query<RunMediaDelivery>(`${selectRunMediaDeliverySql} WHERE id = $1 LIMIT 1`, [input.mediaDeliveryId]);
      return result.rows[0];
    },
    async listMediaDeliveries() {
      const result = await client.query<RunMediaDelivery>(`${selectRunMediaDeliverySql} ORDER BY created_at ASC`);
      return result.rows;
    },
  };

  const presentations: PresentationRepository = {
    async createPendingPresentation({ runId, sessionId, chatId, now }) {
      const existing = await this.getPresentationByRunId(runId);
      if (existing) {
        return existing;
      }

      const presentation: RunPresentation = {
        runId,
        sessionId,
        chatId,
        phase: "pending_start",
        terminalStatus: null,
        streamingMessageId: null,
        streamingCardId: null,
        streamingElementId: null,
        fallbackTerminalMessageId: null,
        degradedReason: null,
        lastOutputSequence: null,
        lastOutputExcerpt: null,
        createdAt: nowIso(now),
        updatedAt: nowIso(now),
      };
      await client.query(
        "INSERT INTO run_presentations (run_id, session_id, chat_id, phase, terminal_status, streaming_message_id, streaming_card_id, streaming_element_id, fallback_terminal_message_id, degraded_reason, last_output_sequence, last_output_excerpt, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
        [
          presentation.runId,
          presentation.sessionId,
          presentation.chatId,
          presentation.phase,
          presentation.terminalStatus,
          presentation.streamingMessageId,
          presentation.streamingCardId,
          presentation.streamingElementId,
          presentation.fallbackTerminalMessageId,
          presentation.degradedReason,
          presentation.lastOutputSequence,
          presentation.lastOutputExcerpt,
          presentation.createdAt,
          presentation.updatedAt,
        ],
      );
      return presentation;
    },
    async getPresentationByRunId(runId) {
      const result = await client.query<RunPresentation>(`${selectRunPresentationSql} WHERE run_id = $1 LIMIT 1`, [runId]);
      return result.rows[0] ?? null;
    },
    async listPresentations() {
      const result = await client.query<RunPresentation>(`${selectRunPresentationSql} ORDER BY created_at ASC`);
      return result.rows;
    },
    async markPresentationStreaming({ runId, streamingMessageId, streamingCardId, streamingElementId, now }) {
      await client.query(
        "UPDATE run_presentations SET phase = 'streaming', streaming_message_id = $1, streaming_card_id = $2, streaming_element_id = $3, updated_at = $4 WHERE run_id = $5",
        [streamingMessageId, streamingCardId, streamingElementId, nowIso(now), runId],
      );
      return mustGetPresentation(client, selectRunPresentationSql, runId);
    },
    async updatePresentationOutput({ runId, lastOutputSequence, lastOutputExcerpt, now }) {
      await client.query(
        "UPDATE run_presentations SET last_output_sequence = $1, last_output_excerpt = $2, updated_at = $3 WHERE run_id = $4",
        [lastOutputSequence, lastOutputExcerpt, nowIso(now), runId],
      );
      return mustGetPresentation(client, selectRunPresentationSql, runId);
    },
    async markPresentationTerminal({ runId, phase, terminalStatus, lastOutputSequence, lastOutputExcerpt, now }) {
      await client.query(
        "UPDATE run_presentations SET phase = $1, terminal_status = $2, last_output_sequence = COALESCE($3, last_output_sequence), last_output_excerpt = COALESCE($4, last_output_excerpt), updated_at = $5 WHERE run_id = $6",
        [phase, terminalStatus, lastOutputSequence ?? null, lastOutputExcerpt ?? null, nowIso(now), runId],
      );
      return mustGetPresentation(client, selectRunPresentationSql, runId);
    },
    async markPresentationDegraded({ runId, degradedReason, now }) {
      await client.query(
        "UPDATE run_presentations SET phase = 'degraded', degraded_reason = $1, updated_at = $2 WHERE run_id = $3",
        [degradedReason, nowIso(now), runId],
      );
      return mustGetPresentation(client, selectRunPresentationSql, runId);
    },
    async attachFallbackTerminal({ runId, fallbackTerminalMessageId, now }) {
      await client.query(
        "UPDATE run_presentations SET fallback_terminal_message_id = $1, updated_at = $2 WHERE run_id = $3",
        [fallbackTerminalMessageId, nowIso(now), runId],
      );
      return mustGetPresentation(client, selectRunPresentationSql, runId);
    },
  };

  return {
    sessions,
    conversationSessionBindings,
    chatSandboxOverrides,
    sessionWorkspaceBindings,
    workspaceCatalog,
    triggerDefinitions,
    triggerDefinitionOverrides,
    triggerExecutions,
    scheduleManagementActions,
    runs,
    events,
    deliveries,
    runMediaDeliveries,
    presentations,
  };
}

async function mustGetPresentation(
  client: PostgresClient,
  selectRunPresentationSql: string,
  runId: string,
): Promise<RunPresentation> {
  const result = await client.query<RunPresentation>(`${selectRunPresentationSql} WHERE run_id = $1 LIMIT 1`, [runId]);
  const presentation = result.rows[0];
  if (!presentation) {
    throw new Error(`presentation not found: ${runId}`);
  }
  return presentation;
}
