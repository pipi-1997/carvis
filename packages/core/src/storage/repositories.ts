import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  DeliveryKind,
  DeliveryStatus,
  OutboundDelivery,
  PresentationPhase,
  Run,
  RunEvent,
  RunPresentation,
  RunStatus,
  Session,
} from "../domain/models.ts";

function nowIso(now = new Date()) {
  return now.toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
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

export interface RunRepository {
  createQueuedRun(input: {
    sessionId: string;
    agentId: string;
    workspace: string;
    prompt: string;
    triggerMessageId: string;
    triggerUserId: string;
    timeoutSeconds: number;
    now?: Date;
  }): Promise<Run>;
  updateQueuePosition(runId: string, queuePosition: number): Promise<Run>;
  getRunById(runId: string): Promise<Run | null>;
  listRuns(): Promise<Run[]>;
  findActiveRunByWorkspace(workspace: string): Promise<Run | null>;
  getLatestRunBySession(sessionId: string): Promise<Run | null>;
  getLatestRunByChat(channel: Session["channel"], chatId: string): Promise<Run | null>;
  markRunStarted(runId: string, startedAt: string): Promise<Run>;
  markRunCompleted(runId: string, finishedAt: string, resultSummary: string): Promise<Run>;
  markRunFailed(runId: string, finishedAt: string, failureCode: string, failureMessage: string): Promise<Run>;
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
    sessionId: string;
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

export interface RepositoryBundle {
  sessions: SessionRepository;
  runs: RunRepository;
  events: RunEventRepository;
  deliveries: DeliveryRepository;
  presentations: PresentationRepository;
}

export interface PostgresClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function createInMemoryRepositories(): RepositoryBundle {
  const sessions = new Map<string, Session>();
  const sessionsByChat = new Map<string, string>();
  const runs = new Map<string, Run>();
  const runIdsBySession = new Map<string, string[]>();
  const events = new Map<string, Array<RunEvent<Record<string, unknown>>>>();
  const deliveries = new Map<string, OutboundDelivery>();
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

  const runRepository: RunRepository = {
    async createQueuedRun(input) {
      const run: Run = {
        id: randomUUID(),
        sessionId: input.sessionId,
        agentId: input.agentId,
        workspace: input.workspace,
        status: "queued",
        prompt: input.prompt,
        triggerMessageId: input.triggerMessageId,
        triggerUserId: input.triggerUserId,
        timeoutSeconds: input.timeoutSeconds,
        queuePosition: 0,
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        cancelRequestedAt: null,
        createdAt: nowIso(input.now),
      };
      runs.set(run.id, run);
      runIdsBySession.set(run.sessionId, [...(runIdsBySession.get(run.sessionId) ?? []), run.id]);
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
    async findActiveRunByWorkspace(workspace) {
      const run = Array.from(runs.values()).find(
        (candidate) => candidate.workspace === workspace && candidate.status === "running",
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
    async markRunCompleted(runId, finishedAt) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "completed",
        finishedAt,
        queuePosition: null,
      }));
    },
    async markRunFailed(runId, finishedAt, failureCode, failureMessage) {
      return updateTerminalAwareRun(runId, (run) => ({
        ...run,
        status: "failed",
        finishedAt,
        failureCode,
        failureMessage,
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
    async createDelivery({ runId, chatId, deliveryKind, content, targetRef, now }) {
      const delivery: OutboundDelivery = {
        id: randomUUID(),
        runId,
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
    runs: runRepository,
    events: eventRepository,
    deliveries: deliveryRepository,
    presentations: presentationRepository,
  };
}

export function createPostgresRepositories(client: PostgresClient): RepositoryBundle {
  const selectRunPresentationSql =
    'SELECT run_id AS "runId", session_id AS "sessionId", chat_id AS "chatId", phase, terminal_status AS "terminalStatus", streaming_message_id AS "streamingMessageId", streaming_card_id AS "streamingCardId", streaming_element_id AS "streamingElementId", COALESCE(fallback_terminal_message_id, final_post_message_id) AS "fallbackTerminalMessageId", degraded_reason AS "degradedReason", last_output_sequence AS "lastOutputSequence", last_output_excerpt AS "lastOutputExcerpt", created_at AS "createdAt", updated_at AS "updatedAt" FROM run_presentations';
  const selectOutboundDeliverySql =
    'SELECT id, run_id AS "runId", chat_id AS "chatId", delivery_kind AS "deliveryKind", content, target_ref AS "targetRef", status, attempt_count AS "attemptCount", last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt" FROM outbound_deliveries';

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

  const runs: RunRepository = {
    async createQueuedRun(input) {
      const run: Run = {
        id: randomUUID(),
        sessionId: input.sessionId,
        agentId: input.agentId,
        workspace: input.workspace,
        status: "queued",
        prompt: input.prompt,
        triggerMessageId: input.triggerMessageId,
        triggerUserId: input.triggerUserId,
        timeoutSeconds: input.timeoutSeconds,
        queuePosition: 0,
        startedAt: null,
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        cancelRequestedAt: null,
        createdAt: nowIso(input.now),
      };
      await client.query(
        "INSERT INTO agent_runs (id, session_id, agent_id, workspace, status, prompt, trigger_message_id, trigger_user_id, timeout_seconds, queue_position, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          run.id,
          run.sessionId,
          run.agentId,
          run.workspace,
          run.status,
          run.prompt,
          run.triggerMessageId,
          run.triggerUserId,
          run.timeoutSeconds,
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
        "SELECT id, session_id AS \"sessionId\", agent_id AS \"agentId\", workspace, status, prompt, trigger_message_id AS \"triggerMessageId\", trigger_user_id AS \"triggerUserId\", timeout_seconds AS \"timeoutSeconds\", queue_position AS \"queuePosition\", started_at AS \"startedAt\", finished_at AS \"finishedAt\", failure_code AS \"failureCode\", failure_message AS \"failureMessage\", cancel_requested_at AS \"cancelRequestedAt\", created_at AS \"createdAt\" FROM agent_runs WHERE id = $1 LIMIT 1",
        [runId],
      );
      return result.rows[0] ?? null;
    },
    async listRuns() {
      const result = await client.query<Run>(
        "SELECT id, session_id AS \"sessionId\", agent_id AS \"agentId\", workspace, status, prompt, trigger_message_id AS \"triggerMessageId\", trigger_user_id AS \"triggerUserId\", timeout_seconds AS \"timeoutSeconds\", queue_position AS \"queuePosition\", started_at AS \"startedAt\", finished_at AS \"finishedAt\", failure_code AS \"failureCode\", failure_message AS \"failureMessage\", cancel_requested_at AS \"cancelRequestedAt\", created_at AS \"createdAt\" FROM agent_runs ORDER BY created_at ASC",
      );
      return result.rows;
    },
    async findActiveRunByWorkspace(workspace) {
      const result = await client.query<Run>(
        "SELECT id, session_id AS \"sessionId\", agent_id AS \"agentId\", workspace, status, prompt, trigger_message_id AS \"triggerMessageId\", trigger_user_id AS \"triggerUserId\", timeout_seconds AS \"timeoutSeconds\", queue_position AS \"queuePosition\", started_at AS \"startedAt\", finished_at AS \"finishedAt\", failure_code AS \"failureCode\", failure_message AS \"failureMessage\", cancel_requested_at AS \"cancelRequestedAt\", created_at AS \"createdAt\" FROM agent_runs WHERE workspace = $1 AND status = 'running' ORDER BY created_at DESC LIMIT 1",
        [workspace],
      );
      return result.rows[0] ?? null;
    },
    async getLatestRunBySession(sessionId) {
      const result = await client.query<Run>(
        "SELECT id, session_id AS \"sessionId\", agent_id AS \"agentId\", workspace, status, prompt, trigger_message_id AS \"triggerMessageId\", trigger_user_id AS \"triggerUserId\", timeout_seconds AS \"timeoutSeconds\", queue_position AS \"queuePosition\", started_at AS \"startedAt\", finished_at AS \"finishedAt\", failure_code AS \"failureCode\", failure_message AS \"failureMessage\", cancel_requested_at AS \"cancelRequestedAt\", created_at AS \"createdAt\" FROM agent_runs WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1",
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
    async markRunCompleted(runId, finishedAt) {
      await client.query("UPDATE agent_runs SET status = 'completed', finished_at = $1, queue_position = NULL WHERE id = $2", [
        finishedAt,
        runId,
      ]);
      const run = await this.getRunById(runId);
      if (!run) {
        throw new Error(`run not found: ${runId}`);
      }
      return run;
    },
    async markRunFailed(runId, finishedAt, failureCode, failureMessage) {
      await client.query(
        "UPDATE agent_runs SET status = 'failed', finished_at = $1, failure_code = $2, failure_message = $3, queue_position = NULL WHERE id = $4",
        [finishedAt, failureCode, failureMessage, runId],
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
    async createDelivery({ runId, chatId, deliveryKind, content, targetRef, now }) {
      const delivery: OutboundDelivery = {
        id: randomUUID(),
        runId,
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
        "INSERT INTO outbound_deliveries (id, run_id, chat_id, delivery_kind, content, target_ref, status, attempt_count, last_error, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [
          delivery.id,
          delivery.runId,
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
    runs,
    events,
    deliveries,
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
