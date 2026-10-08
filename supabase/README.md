# NYVEN Supabase

## Setup

1. Create a Supabase project.
2. Run `migrations/001_nyven_core.sql` in the SQL editor.
3. Enable Email auth in Authentication → Providers.
4. Set Vite env:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Never put the service role key in `VITE_*`.

## Gmail OAuth foundation

Table `connections` stores provider status and an optional `token_ciphertext` column.
**Client policies allow select/update of own rows**, but production should:

- Write tokens only via a Cloudflare Function using the **service role**.
- Encrypt tokens (Vault / KMS) before insert.
- Prefer selecting `connections_public` view (no ciphertext) from the browser.

Do not store OAuth tokens in localStorage or conversation messages.
