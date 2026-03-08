CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  status TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  agent_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  trigger_message_id TEXT NOT NULL,
  trigger_user_id TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL,
  queue_position INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  cancel_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id),
  chat_id TEXT NOT NULL,
  delivery_kind TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
