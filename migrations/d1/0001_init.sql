-- NYVEN D1 application schema
-- Identity remains Supabase Auth (user_id = auth.users.id UUID string).
-- Guests are tracked by guest_key (server-derived, not client-trusted for elevation).

-- Daily usage counters (chat messages + voice seconds)
CREATE TABLE IF NOT EXISTS usage_daily (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'guest')),
  subject_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  chat_count INTEGER NOT NULL DEFAULT 0,
  voice_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_subject_day
  ON usage_daily (subject_type, subject_id, day_key);

-- Short-window burst counters (e.g. per minute)
CREATE TABLE IF NOT EXISTS rate_buckets (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  window_start_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_buckets_key ON rate_buckets (bucket_key);

-- Shared provider budgets (circuit breakers)
CREATE TABLE IF NOT EXISTS provider_budget (
  provider TEXT PRIMARY KEY,
  day_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Message feedback (thumbs up/down)
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
  conversation_id TEXT,
  message_id TEXT,
  user_id TEXT,
  guest_key TEXT,
  reason TEXT,
  details TEXT,
  client_version TEXT,
  created_at TEXT NOT NULL
);

-- Dedupe is enforced in application logic when message_id is present;
-- composite unique on (message_id, feedback_type, user_id) for signed-in users.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_user_msg
  ON feedback (message_id, feedback_type, user_id)
  WHERE message_id IS NOT NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_guest_msg
  ON feedback (message_id, feedback_type, guest_key)
  WHERE message_id IS NOT NULL AND guest_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);

-- Bug reports
CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  details TEXT,
  route TEXT,
  conversation_id TEXT,
  message_id TEXT,
  user_id TEXT,
  guest_key TEXT,
  user_agent TEXT,
  client_version TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports (created_at);

-- Email outbox / delivery log (never store secrets or raw verification codes)
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_message_id TEXT,
  error TEXT,
  related_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status, created_at);

-- Email verification challenges (hashed codes only)
-- Used for optional app-level verification / password recovery flows.
CREATE TABLE IF NOT EXISTS email_challenges (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  user_id TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'password_reset', 'resend_verify')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_challenges_email
  ON email_challenges (email_normalized, purpose, created_at);

-- App-level account flags linked to Supabase user id
CREATE TABLE IF NOT EXISTS app_accounts (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Signed-in conversation persistence (optional parallel to Supabase)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations (user_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at);
