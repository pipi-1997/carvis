CREATE TABLE IF NOT EXISTS run_media_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  session_id TEXT REFERENCES sessions(id),
  chat_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  resolved_file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  status TEXT NOT NULL,
  failure_stage TEXT,
  failure_reason TEXT,
  outbound_delivery_id TEXT REFERENCES outbound_deliveries(id),
  target_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
