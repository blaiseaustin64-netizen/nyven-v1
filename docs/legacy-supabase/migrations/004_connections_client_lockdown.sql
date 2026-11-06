-- Phase 8B — Connections client lockdown
--
-- Problem: RLS policies on public.connections are row-level only. A signed-in user could
--   (a) SELECT token_ciphertext directly through PostgREST, and
--   (b) UPDATE their own row, e.g. set status = 'connected' without any OAuth exchange.
--
-- Fix (no policy is weakened; ownership RLS stays in place):
--   * Clients lose all direct table privileges on public.connections.
--   * Clients get SELECT on the non-secret columns only (token_ciphertext is excluded).
--   * Clients can no longer INSERT, UPDATE, or DELETE. Only the service role writes
--     (Pages Functions use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS and these grants).
--   * connections_public (security_invoker view) keeps working for clients.
--
-- Safe to re-run. Apply in the Supabase SQL editor (or `supabase db push`) before deploying Phase 8B.

begin;

-- Start from zero for client roles on this table.
revoke all on table public.connections from anon, authenticated;

-- Column-level read access: everything except token_ciphertext.
grant select (
  id,
  user_id,
  provider,
  status,
  account_label,
  scopes,
  metadata,
  connected_at,
  created_at,
  updated_at
) on table public.connections to authenticated;

-- Ensure RLS remains enabled (ownership policies still apply to the granted columns).
alter table public.connections enable row level security;

-- The safe view must remain readable by signed-in clients.
grant select on public.connections_public to authenticated;

commit;
