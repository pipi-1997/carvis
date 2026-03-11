ALTER TABLE trigger_definitions
  ADD COLUMN IF NOT EXISTS definition_origin TEXT NOT NULL DEFAULT 'config',
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS last_managed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_managed_by_session_id TEXT,
  ADD COLUMN IF NOT EXISTS last_managed_by_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS last_management_action TEXT;

UPDATE trigger_definitions
SET
  label = COALESCE(label, id),
  last_management_action = COALESCE(last_management_action, 'config_sync')
WHERE TRUE;

ALTER TABLE trigger_definitions
  ALTER COLUMN label SET NOT NULL;

CREATE TABLE IF NOT EXISTS trigger_definition_overrides (
  definition_id TEXT PRIMARY KEY REFERENCES trigger_definitions(id),
  workspace TEXT NOT NULL,
  label TEXT,
  enabled BOOLEAN,
  schedule_expr TEXT,
  timezone TEXT,
  prompt_template TEXT,
  delivery_target JSONB,
  managed_by_session_id TEXT NOT NULL,
  managed_by_chat_id TEXT NOT NULL,
  managed_by_user_id TEXT,
  applied_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_management_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  user_id TEXT,
  requested_text TEXT NOT NULL,
  action_type TEXT NOT NULL,
  resolution_status TEXT NOT NULL,
  target_definition_id TEXT REFERENCES trigger_definitions(id),
  reason TEXT,
  response_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS management_mode TEXT NOT NULL DEFAULT 'none';
