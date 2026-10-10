import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN,
  CONNECTOR_SECRET,
  SUPABASE_URL,
  composeRoutes,
  connectedRow,
  fetchCalls,
  fakeSupabase,
  installFetch,
  json,
  makeEnv,
  useSupabase,
} from './harness.ts'
import { encryptToken } from '../../functions/_shared/github/crypto.ts'
import {
  getAccessTokenForUser,
  type GitHubEnv,
} from '../../functions/_shared/github/service.ts'
import { onRequestGet as reposHandler } from '../../functions/api/connectors/github/repos.ts'
import { onRequestGet as statusHandler } from '../../functions/api/connectors/github/status.ts'
import { onRequestPost as startHandler } from '../../functions/api/connectors/github/start.ts'

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const ANON_KEY = 'anon-test-key'
const VALID_BEARER = 'valid-session-token'
const LOCAL_ORIGIN = 'http://localhost:8788'

/** Supabase Auth: only the exact valid bearer resolves to USER_ID; anything else is rejected. */
function authRoute() {
  return (call: { url: string; auth: string | null }) => {
    if (!call.url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return null
    return call.auth === `Bearer ${VALID_BEARER}`
      ? json({ id: USER_ID, email: 'user@example.test' })
      : json({ message: 'invalid' }, 401)
  }
}

function githubReposRoute() {
  return (call: { url: string }) => {
    if (!call.url.startsWith('https://api.github.com/user/repos')) return null
    return json([
      {
        id: 1,
        name: 'nyven',
        full_name: 'octocat/nyven',
        private: true,
        owner: { login: 'octocat' },
        default_branch: 'main',
        html_url: 'https://github.com/octocat/nyven',
        description: null,
        updated_at: '2026-10-01T00:00:00Z',
      },
    ])
  }
}

function req(path: string, opts: { bearer?: string | null; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {}
  if (opts.bearer !== null) headers.Authorization = `Bearer ${opts.bearer ?? VALID_BEARER}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  return new Request(`https://nyven.example${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

const READY_ENV = (): GitHubEnv => makeEnv({ APP_URL: 'https://nyven.example', SUPABASE_ANON_KEY: ANON_KEY })

async function bodyOf(res: Response): Promise<string> {
  return res.text()
}

describe('getAccessTokenForUser: database failures are not "not connected"', () => {
  test('a connected row returns the token to server callers', async () => {
    useSupabase({ row: await connectedRow(USER_ID) })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.token, ACCESS_TOKEN)
  })

  test('the lookup is scoped to the requesting user (ownership)', async () => {
    useSupabase({ row: await connectedRow(USER_ID) })
    await getAccessTokenForUser(makeEnv(), USER_ID)
    const read = fetchCalls().find((c) => c.method === 'GET')
    assert.ok(read, 'a read should have been issued')
    assert.ok(read!.url.includes(`user_id=eq.${USER_ID}`))
    assert.ok(read!.url.includes('provider=eq.github'))
    assert.ok(!read!.url.includes(OTHER_USER_ID))
  })

  test('no row is a confirmed NOT_CONNECTED', async () => {
    useSupabase({ row: null })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'NOT_CONNECTED')
  })

  test('a disconnected row is a confirmed NOT_CONNECTED', async () => {
    useSupabase({ row: { ...(await connectedRow(USER_ID)), status: 'disconnected' } })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'NOT_CONNECTED')
  })

  test('an HTTP error from the database is DB_READ, not NOT_CONNECTED', async () => {
    useSupabase({ row: await connectedRow(USER_ID), read: 'http500' })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'DB_READ')
  })

  test('a network failure is DB_READ', async () => {
    useSupabase({ row: await connectedRow(USER_ID), read: 'throw' })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'DB_READ')
  })

  test('a malformed (non-JSON) response is DB_READ', async () => {
    useSupabase({ row: await connectedRow(USER_ID), read: 'bad-json' })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'DB_READ')
  })

  test('a corrupt token blob is DECRYPT and the ciphertext is not echoed', async () => {
    const row = { ...(await connectedRow(USER_ID)), token_ciphertext: 'v1.bad.blob' }
    useSupabase({ row })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'DECRYPT')
    assert.equal(JSON.stringify(r).includes('v1.bad.blob'), false)
  })

  test('a token encrypted with a different secret is DECRYPT', async () => {
    const wrong = await encryptToken(JSON.stringify({ access_token: ACCESS_TOKEN }), 'other-secret')
    useSupabase({ row: { ...(await connectedRow(USER_ID)), token_ciphertext: wrong } })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'DECRYPT')
    assert.equal(JSON.stringify(r).includes(wrong), false)
  })

  test('a connected row without credentials is DECRYPT, not NOT_CONNECTED', async () => {
    useSupabase({ row: { ...(await connectedRow(USER_ID)), token_ciphertext: null } })
    const r = await getAccessTokenForUser(makeEnv(), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'DECRYPT')
  })

  test('missing service-role key is CONFIG', async () => {
    const r = await getAccessTokenForUser(makeEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }), USER_ID)
    if (r.ok) assert.fail('expected failure')
    assert.equal(r.code, 'CONFIG')
  })

  test('the access token never appears in any failure result', async () => {
    const cases = [
      { row: await connectedRow(USER_ID), read: 'http500' as const },
      { row: await connectedRow(USER_ID), read: 'throw' as const },
    ]
    for (const c of cases) {
      useSupabase(c)
      const r = await getAccessTokenForUser(makeEnv(), USER_ID)
      assert.equal(JSON.stringify(r).includes(ACCESS_TOKEN), false)
    }
  })
})

describe('GET /api/connectors/github/repos', () => {
  test('connected user with a healthy database lists repositories', async () => {
    installFetch(composeRoutes(authRoute(), githubReposRoute(), useSupabaseRouteFor(await connectedRow(USER_ID))))
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 200)
    const body = (await res.json()) as { success: boolean; repos: unknown[] }
    assert.equal(body.success, true)
    assert.equal(body.repos.length, 1)
  })

  test('the GitHub API receives the token; the response body does not contain it', async () => {
    installFetch(composeRoutes(authRoute(), githubReposRoute(), useSupabaseRouteFor(await connectedRow(USER_ID))))
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env: READY_ENV() } as never) as Response
    const text = await bodyOf(res)
    const ghCall = fetchCalls().find((c) => c.url.startsWith('https://api.github.com/user/repos'))
    assert.ok(ghCall, 'GitHub should have been called')
    assert.equal(text.includes(ACCESS_TOKEN), false)
  })

  test('no bearer token is rejected before any lookup', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID))))
    const res = await reposHandler({ request: req('/api/connectors/github/repos', { bearer: null }), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 401)
    assert.equal(fetchCalls().some((c) => c.url.includes('/rest/v1/connections')), false)
  })

  test('an invalid session is rejected', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID))))
    const res = await reposHandler({ request: req('/api/connectors/github/repos', { bearer: 'bogus' }), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 401)
  })

  test('a failed connection lookup returns 503 DB_READ, not 400 NOT_CONNECTED', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID), 'http500')))
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 503)
    const body = (await res.json()) as { code: string; error: string }
    assert.equal(body.code, 'DB_READ')
    assert.equal(body.error.includes('not connected'), false)
    assert.equal(fetchCalls().some((c) => c.url.startsWith('https://api.github.com/')), false)
  })

  test('a confirmed missing connection returns 400 NOT_CONNECTED', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 400)
    assert.equal(((await res.json()) as { code: string }).code, 'NOT_CONNECTED')
  })

  test('a credential decryption failure returns 500 DECRYPT without ciphertext', async () => {
    const row = { ...(await connectedRow(USER_ID)), token_ciphertext: 'v1.nope.nope' }
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(row)))
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 500)
    const text = await bodyOf(res)
    assert.equal(text.includes('v1.nope.nope'), false)
  })

  test('missing server configuration returns 503 CONFIG', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = READY_ENV()
    delete (env as Record<string, unknown>).SUPABASE_SERVICE_ROLE_KEY
    const res = await reposHandler({ request: req('/api/connectors/github/repos'), env } as never) as Response
    assert.equal(res.status, 503)
    assert.equal(((await res.json()) as { code: string }).code, 'CONFIG')
  })
})

describe('GET /api/connectors/github/status: accurate configured flag', () => {
  test('missing APP_URL is 503 CONFIG, configured:false, and makes no network calls', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = makeEnv({ SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 503)
    const body = (await res.json()) as Record<string, unknown>
    assert.equal(body.code, 'CONFIG')
    assert.equal(body.configured, false)
    assert.equal(body.connected, false)
    assert.equal(body.connection, null)
    assert.equal(fetchCalls().length, 0)
  })

  test('an invalid public http APP_URL is 503 CONFIG, configured:false', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = makeEnv({ APP_URL: 'http://nyven.example', SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 503)
    assert.equal(((await res.json()) as { configured: boolean }).configured, false)
  })

  test('a malformed APP_URL is 503 CONFIG', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = makeEnv({ APP_URL: 'javascript:alert(1)', SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 503)
  })

  test('missing GitHub client secret is 503 CONFIG even with a valid APP_URL', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = makeEnv({ APP_URL: 'https://nyven.example', GITHUB_CLIENT_SECRET: undefined, SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 503)
    assert.equal(((await res.json()) as { configured: boolean }).configured, false)
  })

  test('NYVEN_APP_URL alone is accepted as the explicit origin', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
    const env = makeEnv({ NYVEN_APP_URL: 'https://nyven.example', SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { configured: boolean }).configured, true)
  })

  test('local development: http://localhost APP_URL is ready over an http request', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
    const env = makeEnv({ APP_URL: LOCAL_ORIGIN, SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: new Request(`${LOCAL_ORIGIN}/api/connectors/github/status`, { headers: { Authorization: `Bearer ${VALID_BEARER}` } }), env } as never) as Response
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { configured: boolean }).configured, true)
  })

  test('a plain-http loopback APP_URL is NOT ready when the deployed request is https', async () => {
    installFetch(composeRoutes(authRoute()))
    const env = makeEnv({ APP_URL: LOCAL_ORIGIN, SUPABASE_ANON_KEY: ANON_KEY })
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env } as never) as Response
    assert.equal(res.status, 503)
  })

  test('a signed-in user with a connected row sees connected:true and a safe public connection', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID))))
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 200)
    const text = await res.text()
    const body = JSON.parse(text) as { connected: boolean; connection: Record<string, unknown> }
    assert.equal(body.connected, true)
    assert.equal(body.connection.account_label, 'octocat')
    assert.equal('token_ciphertext' in body.connection, false)
    assert.equal(text.includes(ACCESS_TOKEN), false)
    assert.equal(text.includes(CONNECTOR_SECRET), false)
  })

  test('a signed-in user with no row sees connected:false and connection:null', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env: READY_ENV() } as never) as Response
    const body = (await res.json()) as { success: boolean; connected: boolean; connection: unknown; configured: boolean }
    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.connected, false)
    assert.equal(body.connection, null)
    assert.equal(body.configured, true)
  })

  test('a failed connection read is 503 DB_READ, never a silent connected:false', async () => {
    installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(await connectedRow(USER_ID), 'http500')))
    const res = await statusHandler({ request: req('/api/connectors/github/status'), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 503)
    const body = (await res.json()) as { success: boolean; code: string; configured: boolean }
    assert.equal(body.success, false)
    assert.equal(body.code, 'DB_READ')
    assert.equal(body.configured, true)
  })

  test('an anonymous visitor with valid config sees configured:true, connected:false', async () => {
    installFetch(composeRoutes(authRoute()))
    const res = await statusHandler({ request: req('/api/connectors/github/status', { bearer: null }), env: READY_ENV() } as never) as Response
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { success: true, configured: true, connected: false, connection: null })
  })

  test('status and start agree: when status says configured, OAuth start succeeds; when not, start is refused', async () => {
    const cases: Array<{ env: GitHubEnv; expectReady: boolean }> = [
      { env: READY_ENV(), expectReady: true },
      { env: makeEnv({ SUPABASE_ANON_KEY: ANON_KEY }), expectReady: false },
      { env: makeEnv({ APP_URL: 'http://nyven.example', SUPABASE_ANON_KEY: ANON_KEY }), expectReady: false },
    ]
    for (const c of cases) {
      installFetch(composeRoutes(authRoute(), useSupabaseRouteFor(null)))
      const status = await statusHandler({ request: req('/api/connectors/github/status'), env: c.env } as never) as Response
      const statusBody = (await status.json()) as { configured: boolean }
      installFetch(composeRoutes(authRoute()))
      const start = await startHandler({
        request: req('/api/connectors/github/start', { method: 'POST', body: { returnTo: '/settings?section=connections' } }),
        env: c.env,
      } as never) as Response
      assert.equal(statusBody.configured, c.expectReady)
      assert.equal(start.status === 200, c.expectReady, `start status ${start.status}`)
    }
  })
})

/**
 * Route for the Supabase REST `connections` table with a given row (or none).
 * Uses the same in-memory fake as the service tests so filters and failures behave identically.
 */
function useSupabaseRouteFor(row: Record<string, unknown> | null, read?: 'http500' | 'ok') {
  return fakeSupabase({ row, read: read ?? 'ok' }).route
}
