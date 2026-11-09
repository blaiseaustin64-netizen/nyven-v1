ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN project_id TEXT;
ALTER TABLE conversations ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated_alive
  ON conversations (user_id, updated_at) WHERE deleted_at IS NULL;
