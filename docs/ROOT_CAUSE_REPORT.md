# NYVEN Root-Cause Report — Usage warning & auth failures

## Exact warning source

User-facing string:

> NYVEN usage controls are temporarily unavailable. Please try again shortly.

**File:** `functions/_shared/db/usage.ts` → `requireDb()` and catch paths in
`consumeChatMessage` / `consumeVoiceSeconds` / `checkBurst` / `consumeProviderRequest`.

Triggered when:

1. **`env.DB` is `undefined`** inside the Pages Function → code `QUOTA_STORE_UNAVAILABLE` (503), or
2. **D1 is bound but a query throws** → code `QUOTA_STORE_ERROR` (503).

Chat (`/api/chat`), voice, build, agent, feedback, and auth all share this pattern:
they call helpers that **require** `env.DB`. Auth (`loginUser` / `registerUser`) returns
unavailable when `!env.DB`. That is why chat **and** sign-in fail together.

## Why tables existing in D1 Console is not enough

Creating tables in the **D1 SQL Console** only proves the **database** has a schema.
It does **not** prove the **Pages Function** receives that database as `env.DB`.

Runtime binding path:

```
Cloudflare Pages project
  → Settings → Functions → D1 database bindings
  → Variable name must be exactly: DB
  → Database: nyven-db (id d8131027-693a-4139-a424-50ce6b72ef97)
  → Environment: Production (and Preview if used)
  → Redeploy after binding changes
```

If the binding is missing, misnamed, or only on Preview while you use Production, `env.DB` is undefined and every metered/auth route returns 503 — even though the D1 console shows tables.

## Incomplete repository (second confirmed defect)

The uploaded project ZIP was **missing the entire `functions/_shared/` tree** and several API routes (`feedback`, `build`, `preferences`, `memories`, `public-config`, `connectors`, …). Without `_shared`, Functions that import those modules cannot run. This package restores them.

## Diagnostics added

- **GET `/api/health`** — `d1Bound`, `d1Ok`, `tableProbe`, auth boolean, key presence booleans. No secrets.
- Clearer 503 messages for missing binding vs query error.
- `/api/usage` returns 503 when `env.DB` is missing.

## Dashboard checklist (no terminal required)

1. Workers & Pages → NYVEN project → Settings → Functions → D1 bindings.
2. Variable **`DB`** → **`nyven-db`** on **Production**.
3. Retry deployment.
4. Open `https://YOUR_DOMAIN/api/health`.
5. Expect `"d1Bound": true, "d1Ok": true, "tableProbe": "usage_daily"`.

## Tests

31 unit tests passed. Vite build not completed in this sandbox (npm interrupted).

## Files changed

- Restored `functions/_shared/**` and missing API routes
- `functions/_shared/db/usage.ts`, `functions/api/usage/index.ts`, `functions/api/health.ts`
- `functions/_shared/auth/service.ts`, `src/pages/Settings.tsx`
