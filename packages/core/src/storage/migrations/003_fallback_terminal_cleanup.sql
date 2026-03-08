ALTER TABLE run_presentations
ADD COLUMN IF NOT EXISTS fallback_terminal_message_id TEXT;

UPDATE run_presentations
SET fallback_terminal_message_id = COALESCE(fallback_terminal_message_id, final_post_message_id)
WHERE final_post_message_id IS NOT NULL;

UPDATE outbound_deliveries
SET delivery_kind = 'fallback_terminal'
WHERE delivery_kind = 'post_result';
