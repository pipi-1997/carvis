ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS requested_session_mode TEXT NOT NULL DEFAULT 'fresh',
  ADD COLUMN IF NOT EXISTS requested_bridge_session_id TEXT,
  ADD COLUMN IF NOT EXISTS resolved_bridge_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_recovery_attempted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_recovery_result TEXT;

CREATE TABLE IF NOT EXISTS conversation_session_bindings (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  chat_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  bridge TEXT NOT NULL,
  bridge_session_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  last_bound_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ,
  last_invalidated_at TIMESTAMPTZ,
  last_invalidation_reason TEXT,
  last_recovery_at TIMESTAMPTZ,
  last_recovery_result TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
