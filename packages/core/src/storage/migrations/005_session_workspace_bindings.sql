CREATE TABLE IF NOT EXISTS session_workspace_bindings (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id),
  chat_id TEXT NOT NULL,
  workspace_key TEXT NOT NULL,
  binding_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_catalog (
  workspace_key TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL UNIQUE,
  provision_source TEXT NOT NULL,
  template_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
