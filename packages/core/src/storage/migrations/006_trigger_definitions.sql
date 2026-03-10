CREATE TABLE IF NOT EXISTS trigger_definitions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  slug TEXT,
  enabled BOOLEAN NOT NULL,
  workspace TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  delivery_target JSONB NOT NULL,
  schedule_expr TEXT,
  timezone TEXT,
  next_due_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  last_trigger_status TEXT,
  secret_ref TEXT,
  required_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  optional_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  replay_window_seconds INTEGER,
  definition_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS trigger_definitions_slug_unique
ON trigger_definitions (slug)
WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS trigger_executions (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES trigger_definitions(id),
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL,
  input_digest TEXT,
  run_id TEXT REFERENCES agent_runs(id),
  delivery_status TEXT,
  rejection_reason TEXT,
  failure_code TEXT,
  failure_message TEXT,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE agent_runs
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN trigger_message_id DROP NOT NULL,
  ALTER COLUMN trigger_user_id DROP NOT NULL;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'chat_message',
  ADD COLUMN IF NOT EXISTS trigger_execution_id TEXT REFERENCES trigger_executions(id),
  ADD COLUMN IF NOT EXISTS delivery_target JSONB;

ALTER TABLE outbound_deliveries
  ADD COLUMN IF NOT EXISTS trigger_execution_id TEXT REFERENCES trigger_executions(id);
