# NYVEN — D1, usage limits, email, and backend integration

## Architecture decision

| Concern | System |
|--------|--------|
| **Identity (sign-up / sign-in / JWT)** | **Supabase Auth** (existing). Not replaced. |
| **Application data for quotas, feedback, bugs, email outbox** | **Cloudflare D1** (`DB` binding) |
| **Chat history (signed-in)** | Still Supabase tables + client persistence (unchanged path) |
| **GitHub OAuth tokens** | Still encrypted in Supabase `connections` via service role |
| **AI** | Existing Gemini / OpenRouter / Workers AI routes |

Supabase user IDs (`auth.users.id`) are the `user_id` foreign key string in D1 when the user is signed in. Guests use a server-derived `guest_key` (IP + HttpOnly `nyven_guest` cookie hash). Clearing localStorage does **not** reset guest quotas.

## Daily limits (UTC)

| Limit | Guest | Signed-in |
|-------|-------|-----------|
| Chat messages | 5 / day | 100 / day |
| Voice | 60 seconds / day | 15 minutes / day |
| Max voice session | 5 minutes | 5 minutes |

Session max is a **cap**, not extra allowance. Enforcement is in Pages Functions before Gemini / STT / TTS work.

Provider circuit breakers (configurable): default OpenRouter free-model budget **40 requests/day** (`PROVIDER_BUDGET_OPENROUTER`).

## D1 setup

```bash
# Create database (once)
npx wrangler d1 create nyven-db
# Copy the database_id into wrangler.toml [[d1_databases]] database_id

# Apply migrations
npx wrangler d1 migrations apply nyven-db --local
npx wrangler d1 migrations apply nyven-db --remote

# Local Pages + D1
npm run build
npx wrangler pages dev dist --d1=DB=nyven-db
```

In **Cloudflare Dashboard → Pages → Settings → Functions → D1 bindings**: bind name **`DB`** to `nyven-db`.

Migrations live in `migrations/d1/0001_init.sql`.

## Brevo setup (do this when you have the key)

1. Create an account at [Brevo](https://www.brevo.com/).
2. **Sender verification**: Brevo requires a verified sender email or domain.  
   - A Gmail address (`hellovexdyn@gmail.com`) can often be verified via confirmation link in Brevo → Senders.  
   - For production deliverability, verify a **custom domain** (SPF/DKIM) you control; do not assume Gmail will pass all spam filters as `From`.
3. Set sender display name to **NYVEN Support** and use the **verified** address as `BREVO_FROM_EMAIL`.
4. Create an API key (SMTP & API → API keys) with **Send emails** permission.
5. In Cloudflare Pages → Settings → Environment variables / Secrets:
   - Secret: `BREVO_API_KEY`
   - Vars: `BREVO_FROM_NAME=NYVEN Support`, `BREVO_FROM_EMAIL=<verified>`, `NYVEN_FEEDBACK_EMAIL=hellovexdyn@gmail.com`, `SUPPORT_INBOX=hellovexdyn@gmail.com`
6. Redeploy. Without the key, the app **mocks** email (logs structured `email_mock`, records outbox status `mock_no_key`) and still persists feedback/bugs to D1.
7. Send a test feedback or bug report and confirm delivery to `hellovexdyn@gmail.com`.

**Never** put `BREVO_API_KEY` in `VITE_*` or the client bundle.

## CORS

Set `APP_URL` to your public origin (e.g. `https://nyven.example`). Optional `ALLOWED_ORIGINS` comma-list. When unset, CORS allows `*` (local/dev only).

## APIs added / hardened

| Route | Change |
|-------|--------|
| `POST /api/chat` | Usage + burst + Gemini budget; CORS helper |
| `POST /api/voice/stt` | Voice seconds + STT budget |
| `POST /api/voice/tts` | Voice seconds + OpenRouter TTS budget |
| `POST /api/feedback` | D1 persist + Brevo notify; message **Thank you for your feedback!** |
| `POST /api/bug-report` | D1 persist + Brevo notify |
| `GET /api/usage` | Real daily counters + limits for Settings |

## Auth note

Email/password sign-up and confirmation remain **Supabase Auth** (see Auth page). D1 `email_challenges` is prepared for optional app-level codes / password-reset emails via Brevo; wire additional auth routes when you want codes beyond Supabase’s built-in confirmation email.

## Guest vs signed-in

- Guests: no durable chat history in D1/Supabase user tables; quotas by guest key.
- On sign-in: existing optional migrate of **local** conversations to Supabase only; guest quota key does not become the user’s history.


## Fail-closed production rule (Phase 2)

If the `DB` D1 binding is missing or D1 operations error, metered endpoints return **503** with code `QUOTA_STORE_UNAVAILABLE` or `QUOTA_STORE_ERROR`. They do **not** allow unlimited free-tier spend.

Feedback and bug-report endpoints also require D1 so submissions are not acknowledged without persistence.

Conditional SQL updates (`chat_count < limit`, `voice_seconds + n <= limit`) reduce parallel overshoot under concurrent requests.

## Charge model

Metered routes reserve quota **before** calling upstream AI providers so clients cannot bypass limits by aborting streams or forging counters. A failed provider call still consumes the reserved unit for that attempt.

## Shared Gmail inbox

`/api/agent/inbox` shared deployment tokens are **off** unless `ENABLE_SHARED_GMAIL_INBOX=true`. Prefer per-user OAuth; do not enable shared tokens on multi-tenant production.
