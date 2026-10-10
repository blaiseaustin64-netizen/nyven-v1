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

## Phase 8B — GitHub OAuth

1. Create a GitHub OAuth App (https://github.com/settings/developers):
   - Homepage URL: your APP_URL
   - Authorization callback URL: `https://<your-domain>/api/connectors/github/callback`
2. Cloudflare Pages → Settings → Environment variables (Production):
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `CONNECTOR_TOKEN_SECRET` (long random string)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used to store encrypted tokens)
   - `APP_URL` (required, e.g. https://nyven-v1.pages.dev; origin only, https in production; the server returns 503 CONFIG if missing or invalid)
3. Ensure Supabase `connections` table exists (migration 001).
4. Never set `GITHUB_CLIENT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` as `VITE_*`.
