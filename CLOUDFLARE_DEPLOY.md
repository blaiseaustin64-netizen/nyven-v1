# NYVEN — Cloudflare Pages deploy

## What’s in the zip

Full app through **Phase 6** (Support + Inbox agents, widget, knowledge, domains, analytics, Gmail inbox API).

## Deploy steps

1. Unzip into a folder (or push to GitHub).
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages**.
3. Connect the repo **or** upload the folder.
4. Build settings:

| Setting | Value |
|--------|--------|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (project root) |

5. **Environment variables** (Settings → Environment variables):

| Name | Required | Notes |
|------|----------|--------|
| `GEMINI_API_KEY` | Yes | Chat + agents |
| `GEMINI_CHAT_MODEL` | No | Default `gemini-3.1-flash-lite` |
| `GEMINI_AGENT_MODEL` | No | Optional agent override |
| `OPENROUTER_API_KEY` | For Builder | Existing build flow |
| `GMAIL_ACCESS_TOKEN` | Inbox only | Short-lived; or use refresh flow |
| `GMAIL_REFRESH_TOKEN` | Inbox only | With client id/secret |
| `GOOGLE_CLIENT_ID` | Inbox OAuth | |
| `GOOGLE_CLIENT_SECRET` | Inbox OAuth | **Secret** |

6. Deploy. Cloudflare will run `npm install` + `npm run build` and publish `dist` + `functions/`.

## Functions (already in repo)

```
functions/api/chat.ts
functions/api/build.ts
functions/api/agent/chat.ts
functions/api/agent/public.ts
functions/api/agent/publish.ts
functions/api/agent/inbox.ts
```

These become:

- `/api/chat`
- `/api/build`
- `/api/agent/chat`
- `/api/agent/public`
- `/api/agent/publish`
- `/api/agent/inbox`

## Widget

After deploy:

```html
<script
  src="https://YOUR_PAGES_DOMAIN/agent.js"
  data-agent="YOUR_AGENT_ID">
</script>
```

`agent.js` is in `public/` and is copied to the site root on build.

## Local test

```bash
npm install
npm run build
npx wrangler pages dev dist
```

(Requires Wrangler + secrets for live AI.)

## Notes

- Agents / knowledge / conversations currently use **browser localStorage** until Supabase is added.
- Gmail Inbox skills need real server-side OAuth tokens — no fake email data.
- Do not put API keys in frontend code or `agent.js`.

## Phase 8B — NYVEN Code and GitHub

NYVEN Code lives at `/code` (its own workspace, not the generic Create Agent form).

### 1. GitHub OAuth App (https://github.com/settings/developers)

- Homepage URL: `https://nyven-v1.pages.dev` (your APP_URL)
- **Authorization callback URL (exact):** `https://nyven-v1.pages.dev/api/connectors/github/callback`
  - Replace the origin with your production origin if it differs. It must equal `APP_URL` + `/api/connectors/github/callback`.
  - For local testing, register a second OAuth App (or use a dev app) with `http://localhost:8788/api/connectors/github/callback`.

### 2. Cloudflare Pages → Settings → Environment variables

Server-side (Functions) — **Secret** type for secrets:

| Name | Notes |
|---|---|
| `APP_URL` | Required. Origin only, e.g. `https://nyven-v1.pages.dev`. Missing or invalid returns `503 CONFIG`. `NYVEN_APP_URL` is accepted as an alias. |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | **Secret.** Never `VITE_*` |
| `CONNECTOR_TOKEN_SECRET` | **Secret.** Long random string; encrypts stored GitHub tokens |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Used to verify the caller's session |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server-only. Never `VITE_*` |

Build-time (browser bundle) — these must be set for the **build** environment, because Vite inlines them:

| Name | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Same project URL as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. Never the service role key |

Name mismatch to check: the server reads `SUPABASE_URL` / `SUPABASE_ANON_KEY`; the browser reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Both pairs are needed.

### 3. Database

Apply in order in the Supabase SQL editor: `001_nyven_core.sql` (existing), then **`004_connections_client_lockdown.sql`**. Migration 004 removes client access to `token_ciphertext`, and blocks client-side writes to `connections` (only the service role writes). It is safe to re-run.

### 4. Routes

- Connect / status / disconnect: `/api/connectors/github/{start,callback,status,disconnect}`
- Read-only NYVEN Code: `/api/connectors/github/{repos,repo,branches,contents,issues,pulls}`

### 5. Local development

```bash
npm install
npm run build
npx wrangler pages dev dist     # serves http://localhost:8788
npm test                         # server + workspace logic tests
```

Set `APP_URL=http://localhost:8788` for local OAuth. Plain http is accepted only for localhost and only when the request itself is http.

### 6. Never

- Put `GITHUB_CLIENT_SECRET`, `CONNECTOR_TOKEN_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY` in `VITE_*` or any client bundle.
- Commit real values to the repository or to `.env` files that are committed.


## Auth + GitHub (required for connect)

Client sign-in needs Supabase **public** URL and anon key available either:

1. **Build-time (preferred):** Cloudflare Pages → Settings → Environment variables  
   - `VITE_SUPABASE_URL`  
   - `VITE_SUPABASE_ANON_KEY`  
   Then **rebuild** the site (Vite embeds these at build time).

2. **Runtime fallback:** Same project Functions env:  
   - `SUPABASE_URL`  
   - `SUPABASE_ANON_KEY`  
   The app loads them via `GET /api/public-config` if VITE_* were missing at build.

GitHub OAuth still requires (Functions secrets, never VITE_):  
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CONNECTOR_TOKEN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

Callback URL on the GitHub OAuth App:  
`https://<your-domain>/api/connectors/github/callback`
