# NYVEN Supabase

## Setup

1. Create a Supabase project.
2. Run `migrations/001_nyven_core.sql` in the SQL editor.
3. Enable Email auth in Authentication → Providers.
4. Set Vite env:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Never put the service role key in `VITE_*`.

## Connections (GitHub and future providers)

Table `connections` stores provider status and an encrypted `token_ciphertext` column.

- Migration `004_connections_client_lockdown.sql` (required for Phase 8B) removes client access to `token_ciphertext` and prevents client-side writes. Only server functions using the **service role** write connection rows.
- Browsers read `connections_public` (no ciphertext) or the non-secret columns of `connections`.
- Run `004` after `001`. It is idempotent.

Do not store OAuth tokens in localStorage or conversation messages.
