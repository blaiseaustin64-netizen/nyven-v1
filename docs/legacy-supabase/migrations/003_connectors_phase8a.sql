-- Phase 8A — Connector & Capability foundation
-- No schema change required: public.connections + connections_public from 001
-- already store provider status without exposing token_ciphertext to clients.
--
-- This file documents the expected provider IDs for the capability registry:
--   github | gmail | google_calendar | watch | sales | website
--
-- When per-user OAuth is implemented:
--   1. Server-only writes token_ciphertext (service role)
--   2. Clients read only connections_public
--   3. Never return access_token / refresh_token / client_secret to the browser
--
-- Optional future columns (do not add until OAuth is real):
--   expires_at timestamptz
--   last_health_at timestamptz
--   health_status text

-- Ensure unique (user_id, provider) exists (already in 001)
-- unique (user_id, provider)

select 1;
