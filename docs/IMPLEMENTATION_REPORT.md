# NYVEN Phase 4 — Backend Integration & Production Readiness

**No deploy. No remote migrations. No secrets exposed.**

## 1. Cloudflare D1 configuration (verified)

```toml
[[d1_databases]]
binding = "DB"
database_name = "nyven-db"
database_id = "d8131027-693a-4139-a424-50ce6b72ef97"
migrations_dir = "migrations/d1"
```

- Binding name is exactly **`DB`**.
- Database ID matches **nyven-db** only (not vexdyn-auth).
- Migrations (ordered, validated in-memory SQLite):
  - `0001_init.sql` — usage, feedback, bug_reports, email_outbox, app_accounts, conversations…
  - `0002_auth.sql` — auth_users, auth_sessions, auth_email_tokens, oauth_connections
  - `0003_memories.sql` — user_memories

## 2. Brevo email integration

| Item | Status |
|------|--------|
| `BREVO_API_KEY` from env only | Yes — never hardcoded |
| Default from name | `NYVEN Support` |
| Default from email | `hellovexdyn@gmail.com` (must be **verified in Brevo**) |
| Feedback inbox | `hellovexdyn@gmail.com` |
| Templates | Branded colors (#07090D / #62E6FF / #8B7CFF); `passwordResetEmail` + verification |
| Register / reset flows | Call `sendEmail`; mock when key missing |
| Real delivery | **Not verified** in this environment |

### Safe Brevo checklist (you run)

1. Create/verify sender `hellovexdyn@gmail.com` in Brevo (or use a domain sender).
2. Pages secret: `BREVO_API_KEY`
3. Optional vars: `BREVO_FROM_NAME=NYVEN Support`, `BREVO_FROM_EMAIL=<verified>`, `NYVEN_FEEDBACK_EMAIL=hellovexdyn@gmail.com`
4. Set `APP_URL` to public HTTPS origin (required for reset/verify links).
5. Test: register → check inbox; forgot-password → check inbox. Inspect D1 `email_outbox` for status.

## 3. Cloudflare-only migration progress

### Completed this phase

- Preferences → `/api/preferences` (D1 `app_accounts.preferences_json`) + localStorage fallback
- Memories → `/api/memories` + `0003_memories.sql` + localStorage for guests
- Client `githubApi` / `connectionsUi` → session cookies, no Supabase client
- GitHub `upsert` / `lookup` prefer **D1 `oauth_connections`** when `env.DB` present
- Chat / Settings / Profile / BugReport stripped of live Supabase session calls
- `usageTracking` client no longer writes to Supabase (server quotas only)
- Stub `getSupabase()` only remains as compile-safe null export

### Still incomplete / not claimed working

| Area | Reality |
|------|---------|
| Cloud chat history sync | Still **localStorage** only |
| GitHub OAuth E2E | Code path D1-ready; **not live-tested** (needs GITHUB_* secrets + migrate 0002) |
| Gmail / Calendar / CRM | Catalog only; not implemented |
| Profile avatar / display_name cloud fields | Partial via auth_users |
| Vite production build | Not run this session if npm registry fails |

### Remaining Supabase references

- `src/lib/supabase/client.ts` — obsolete **null stub**
- `src/lib/supabase/types.ts` — legacy types
- `supabase/migrations/*` — historical, unused by runtime
- `functions/_shared/github/service.ts` — **fallback** to Supabase service role if `DB` missing (should not be needed with D1 bound)

## 4. Security & quotas

- Quotas still fail-closed without D1 (unit-tested).
- Session cookies HttpOnly; password PBKDF2; reset/verify tokens hashed at rest.
- Shared Gmail inbox still default-off (`ENABLE_SHARED_GMAIL_INBOX`).
- Auth rate limits via `checkBurst` on login/register/reset.
- No secrets printed in this work.

## 5. Tests actually run

```text
node --import ./tests/github/register-ts.mjs --test \
  tests/auth/*.test.ts tests/usage/*.test.ts tests/email/*.test.ts tests/feedback/*.test.ts

→ 31 pass, 0 fail
```

**Not run:** Vite `npm run build`, ESLint, remote D1 apply, live Brevo, live GitHub OAuth, live Gemini.

## 6. Required Cloudflare settings before deploy

1. Pages project bound to D1 **nyven-db** as **`DB`**
2. Apply migrations **0001, 0002, 0003** (local then remote **when authorized**):
   ```bash
   npx wrangler d1 migrations apply nyven-db --local
   # npx wrangler d1 migrations apply nyven-db --remote
   ```
3. Secrets: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `AUTH_SESSION_SECRET` (recommended), `CONNECTOR_TOKEN_SECRET`, optional `BREVO_API_KEY`, GitHub OAuth pair
4. Vars: `APP_URL`, `BREVO_FROM_*`, feedback inbox

## 7. Exact next step before deployment

1. `npm install && npm run build` on a healthy network.
2. Apply **local** migrations and smoke auth + quotas with `wrangler pages dev`.
3. Authorize **remote** `0001–0003` apply.
4. Configure Brevo verified sender + `APP_URL`.
5. Manual smoke: register → login cookie → chat quota → feedback → optional GitHub connect.

**Status labels:** implemented in source · unit-tested where noted · **not deployed** · **not production-verified**
