import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN,
  CONNECTOR_SECRET,
  GITHUB_CLIENT_ID,
  SUPABASE_URL,
  composeRoutes,
  fetchCalls,
  installFetch,
  json,
  makeEnv,
} from './harness.ts'
import {
  buildAuthorizeUrl,
  packOAuthSession,
  type GitHubEnv,
} from '../../functions/_shared/github/service.ts'
import { onRequestGet as callbackHandler } from '../../functions/api/connectors/github/callback.ts'

const USER_ID = 'user-1'
const CALLBACK_PATH = '/api/connectors/github/callback'
const CONNECTION_ROW = {
  id: 'conn-1',
  user_id: USER_ID,
  provider: 'github',
  status: 'connected',
  account_label: 'octocat',
  scopes: ['read:user', 'repo'],
  metadata: { github_login: 'octocat' },
  connected_at: '2026-10-10T00:00:00.000Z',
  created_at: '2026-10-10T00:00:00.000Z',
  updated_at: '2026-10-10T00:00:00.000Z',
}

/** GitHub token/user endpoints and the Supabase upsert, all succeeding. */
function githubHappyRoute() {
  return composeRoutes(
    (call) =>
      call.url === 'https://github.com/login/oauth/access_token'
        ? json({ access_token: ACCESS_TOKEN, token_type: 'bearer', scope: 'read:user,repo' })
        : null,
    (call) => (call.url === 'https://api.github.com/user' ? json({ login: 'octocat', id: 1 }) : null),
    (call) =>
      call.method === 'POST' && call.url.startsWith(`${SUPABASE_URL}/rest/v1/connections`)
        ? json([CONNECTION_ROW])
        : null
  )
}

type Ctx = { request: Request; env: GitHubEnv }

function callbackRequest(url: string, cookieValue?: string): Request {
  const headers: Record<string, string> = {}
  if (cookieValue) headers.Cookie = `nyven_gh_oauth=${encodeURIComponent(cookieValue)}`
  return new Request(url, { headers })
}

/** Run the real start step, then return the state, redirect_uri and cookie it produced. */
async function startOAuth(env: GitHubEnv, requestBase: string, returnTo: string) {
  const built = await buildAuthorizeUrl(
    env,
    `${requestBase}/api/connectors/github/start`,
    USER_ID,
    returnTo
  )
  if ('error' in built) return { error: built.error, code: built.code }
  const authorize = new URL(built.url)
  return {
    state: authorize.searchParams.get('state') || '',
    redirectUri: authorize.searchParams.get('redirect_uri') || '',
    cookieValue: built.cookieValue,
    authorizeUrl: built.url,
  }
}

async function runCallback(ctx: Ctx): Promise<Response> {
  return callbackHandler({ request: ctx.request, env: ctx.env } as never) as Promise<Response>
}

describe('GitHub OAuth start: configured origin', () => {
  test('missing APP_URL returns a CONFIG error and never builds an authorize URL', async () => {
    installFetch(() => json({}))
    const r = await startOAuth(makeEnv(), 'https://attacker.example', '/settings?section=connections')
    assert.ok('error' in r)
    assert.equal(r.code, 'CONFIG')
    assert.match(String(r.error), /APP_URL is not set/)
  })

  test('an invalid origin is refused', async () => {
    const r = await startOAuth(
      makeEnv({ APP_URL: 'http://app.example.com' }),
      'https://app.example.com',
      '/settings?section=connections'
    )
    assert.ok('error' in r)
    assert.equal(r.code, 'CONFIG')
  })

  test('the redirect_uri sent to GitHub is built from the configured APP_URL, not the request host', async () => {
    const r = await startOAuth(
      makeEnv({ APP_URL: 'https://nyven.example' }),
      'https://evil.example',
      '/settings?section=connections'
    )
    assert.ok(!('error' in r))
    if (!('error' in r)) {
      assert.equal(r.redirectUri, 'https://nyven.example/api/connectors/github/callback')
    }
  })
})

describe('GitHub OAuth callback: configuration gate', () => {
  test('missing APP_URL returns 503 CONFIG before any OAuth or network work', async () => {
    const { calls } = installFetch(() => json({}))
    const res = await runCallback({
      env: makeEnv(),
      request: callbackRequest(
        'https://nyven.example/api/connectors/github/callback?code=c&state=s',
        'anything'
      ),
    })
    assert.equal(res.status, 503)
    const body = (await res.json()) as { success: boolean; code: string }
    assert.equal(body.success, false)
    assert.equal(body.code, 'CONFIG')
    assert.equal(calls.length, 0)
    assert.equal(fetchCalls().length, 0)
  })

  test('an invalid origin returns 503 CONFIG and does not redirect', async () => {
    installFetch(() => json({}))
    const res = await runCallback({
      env: makeEnv({ APP_URL: 'javascript:alert(1)' }),
      request: callbackRequest('https://nyven.example/api/connectors/github/callback?code=c&state=s'),
    })
    assert.equal(res.status, 503)
    assert.equal(res.headers.get('Location'), null)
  })
})

describe('GitHub OAuth callback: full round trip with configured origin', () => {
  test('production: redirect uses the validated https origin and the same redirect_uri as authorize', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const started = await startOAuth(env, 'https://nyven.example', '/agents/agent-42?tab=connections')
    assert.ok(!('error' in started))
    if ('error' in started) return

    const { calls } = installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://nyven.example${CALLBACK_PATH}?code=code123&state=${started.state}`,
        started.cookieValue
      ),
    })

    assert.equal(res.status, 302)
    assert.equal(
      res.headers.get('Location'),
      'https://nyven.example/agents/agent-42?tab=connections&github=connected'
    )
    // Token exchange must use exactly the redirect_uri that authorize sent.
    const exchange = calls.find((c) => c.url === 'https://github.com/login/oauth/access_token')
    assert.ok(exchange?.body)
    const sent = JSON.parse(exchange!.body!) as { redirect_uri: string; client_id: string }
    assert.equal(sent.redirect_uri, started.redirectUri)
    assert.equal(sent.redirect_uri, 'https://nyven.example/api/connectors/github/callback')
    assert.equal(sent.client_id, GITHUB_CLIENT_ID)
  })

  test('the final redirect follows the configured origin even if the callback arrives on another host', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const started = await startOAuth(env, 'https://nyven.example', '/settings?section=connections')
    assert.ok(!('error' in started))
    if ('error' in started) return

    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://evil.example${CALLBACK_PATH}?code=code123&state=${started.state}`,
        started.cookieValue
      ),
    })
    assert.equal(res.status, 302)
    assert.ok(res.headers.get('Location')?.startsWith('https://nyven.example/'))
  })

  test('local development: http://localhost with explicit APP_URL redirects to localhost', async () => {
    const env = makeEnv({ APP_URL: 'http://localhost:8788' })
    const started = await startOAuth(env, 'http://localhost:8788', '/settings?section=connections')
    assert.ok(!('error' in started))
    if ('error' in started) return

    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `http://localhost:8788${CALLBACK_PATH}?code=code123&state=${started.state}`,
        started.cookieValue
      ),
    })
    assert.equal(started.redirectUri, 'http://localhost:8788/api/connectors/github/callback')
    assert.equal(res.status, 302)
    assert.equal(
      res.headers.get('Location'),
      'http://localhost:8788/settings?section=connections&github=connected'
    )
  })

  test('state mismatch redirects to the configured origin with an error reason', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const started = await startOAuth(env, 'https://nyven.example', '/settings?section=connections')
    assert.ok(!('error' in started))
    if ('error' in started) return

    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://nyven.example${CALLBACK_PATH}?code=code123&state=forged-state`,
        started.cookieValue
      ),
    })
    assert.equal(res.status, 302)
    assert.equal(
      res.headers.get('Location'),
      'https://nyven.example/settings?section=connections&github=error&reason=state_mismatch'
    )
  })
})

describe('GitHub OAuth callback: return destinations', () => {
  async function forgedSession(returnTo: string, state = 'state-xyz') {
    return packOAuthSession(
      {
        userId: USER_ID,
        codeVerifier: `verifier-abc|${state}`,
        returnTo,
        exp: Date.now() + 60_000,
      },
      CONNECTOR_SECRET
    )
  }

  test('an external returnTo inside a valid session falls back to Settings on the configured origin', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const cookie = await forgedSession('https://evil.example/steal')
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://nyven.example${CALLBACK_PATH}?code=code123&state=state-xyz`,
        cookie
      ),
    })
    assert.equal(res.status, 302)
    assert.equal(
      res.headers.get('Location'),
      'https://nyven.example/settings?section=connections&github=connected'
    )
  })

  test('a protocol-relative returnTo falls back to Settings on the configured origin', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const cookie = await forgedSession('//evil.example')
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://nyven.example${CALLBACK_PATH}?code=code123&state=state-xyz`,
        cookie
      ),
    })
    assert.equal(
      res.headers.get('Location'),
      'https://nyven.example/settings?section=connections&github=connected'
    )
  })

  test('NYVEN Code agent return path is preserved on the configured origin', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const cookie = await forgedSession('/agents/agent-42?tab=connections')
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(
        `https://nyven.example${CALLBACK_PATH}?code=code123&state=state-xyz`,
        cookie
      ),
    })
    assert.equal(
      res.headers.get('Location'),
      'https://nyven.example/agents/agent-42?tab=connections&github=connected'
    )
  })
})

describe('GitHub OAuth callback: failures return to the originating page', () => {
  test('a state mismatch from NYVEN Code returns to /code with the error reason', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const started = await startOAuth(env, 'https://nyven.example', '/code')
    assert.ok(!('error' in started))
    if ('error' in started) return
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(`https://nyven.example${CALLBACK_PATH}?code=c&state=forged`, started.cookieValue),
    })
    assert.equal(res.headers.get('Location'), 'https://nyven.example/code?github=error&reason=state_mismatch')
  })

  test('a successful NYVEN Code connection returns to /code?github=connected', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    const started = await startOAuth(env, 'https://nyven.example', '/code')
    assert.ok(!('error' in started))
    if ('error' in started) return
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(`https://nyven.example${CALLBACK_PATH}?code=c&state=${started.state}`, started.cookieValue),
    })
    assert.equal(res.headers.get('Location'), 'https://nyven.example/code?github=connected')
  })

  test('a missing session (no cookie) still falls back to Settings', async () => {
    const env = makeEnv({ APP_URL: 'https://nyven.example' })
    installFetch(githubHappyRoute())
    const res = await runCallback({
      env,
      request: callbackRequest(`https://nyven.example${CALLBACK_PATH}?code=c&state=s`),
    })
    assert.equal(res.headers.get('Location'), 'https://nyven.example/settings?section=connections&github=error&reason=missing_session')
  })
})
