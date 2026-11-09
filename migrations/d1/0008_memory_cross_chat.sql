-- Cross-chat memory: project scope, sources, conversation summaries
ALTER TABLE user_memories ADD COLUMN project_id TEXT;
ALTER TABLE user_memories ADD COLUMN source_conversation_id TEXT;
ALTER TABLE user_memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_memories_user_project
  ON user_memories (user_id, project_id, updated_at);

ALTER TABLE conversations ADD COLUMN summary TEXT;
ALTER TABLE conversations ADD COLUMN topic_keywords TEXT;
