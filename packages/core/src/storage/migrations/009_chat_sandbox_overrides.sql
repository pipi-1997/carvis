CREATE TABLE IF NOT EXISTS chat_sandbox_overrides (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  sandbox_mode TEXT NOT NULL CHECK (sandbox_mode IN ('workspace-write', 'danger-full-access')),
  expires_at TIMESTAMPTZ NOT NULL,
  set_by_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE conversation_session_bindings
ADD COLUMN IF NOT EXISTS sandbox_mode TEXT NULL CHECK (sandbox_mode IN ('workspace-write', 'danger-full-access'));

ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS requested_sandbox_mode TEXT NULL CHECK (requested_sandbox_mode IN ('workspace-write', 'danger-full-access')),
ADD COLUMN IF NOT EXISTS resolved_sandbox_mode TEXT NOT NULL DEFAULT 'workspace-write' CHECK (resolved_sandbox_mode IN ('workspace-write', 'danger-full-access')),
ADD COLUMN IF NOT EXISTS sandbox_mode_source TEXT NOT NULL DEFAULT 'workspace_default' CHECK (sandbox_mode_source IN ('workspace_default', 'chat_override'));
