CREATE TABLE IF NOT EXISTS run_presentations (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  chat_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  terminal_status TEXT,
  streaming_message_id TEXT,
  streaming_card_id TEXT,
  streaming_element_id TEXT,
  final_post_message_id TEXT,
  degraded_reason TEXT,
  last_output_sequence INTEGER,
  last_output_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE outbound_deliveries
ADD COLUMN IF NOT EXISTS target_ref TEXT;
