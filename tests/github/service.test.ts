import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN,
  composeRoutes,
  connectedRow,
  fakeSupabase,
  useSupabase,
  fetchCalls,
  githubRevokeRoute,
  installFetch,
  json,
  makeEnv,
} from './harness.ts'
import {
  disconnectGitHub,
  getGitHubConnectionRow,
  lookupGitHubConnectionRow,
  resolveAppOrigin,
  resolveSafeReturnUrl,
  sanitizeReturnTo,
  verifyGitHubDisconnected,
} from '../../functions/_shared/github/service.ts'

const LOCAL_REQUEST = 'http://localhost:8788/api/connectors/github/start'
const HTTPS_REQUEST = 'https://nyven-v1.pages.dev/api/connectors/github/start'
const DEFAULT_RETURN = '/settings?section=connections'

// Silence and capture server logs so tests can assert no token leaks into them.
const logged: string[] = []
const originalError = console.error
afterEach(() => {
  console.error = originalError
  logged.length = 0
})
function captureLogs() {
  console.error = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
}

describe('resolveAppOrigin: explicit configuration only', () => {
  test('fails when APP_URL and NYVEN_APP_URL are both missing, even with an https request URL', () => {
    const r = resolveAppOrigin(makeEnv(), HTTPS_REQUEST)
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /APP_URL is not set/)
  })

  test('never derives the origin from the request URL', () => {
    const r = resolveAppOrigin(makeEnv(), 'https://attacker.example/api/connectors/github/start')
    assert.equal(r.ok, false)
  })

  test('accepts NYVEN_APP_URL as the supported alias', () => {
    const r = resolveAppOrigin(makeEnv({ NYVEN_APP_URL: 'https://app.example.com' }), HTTPS_REQUEST)
    assert.deepEqual(r, { ok: true, origin: 'https://app.example.com' })
  })

  test('normalizes a trailing slash and keeps an explicit port', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'https://app.example.com:8443/' }), HTTPS_REQUEST)
    assert.deepEqual(r, { ok: true, origin: 'https://app.example.com:8443' })
  })

  test('prefers APP_URL over NYVEN_APP_URL', () => {
    const r = resolveAppOrigin(
      makeEnv({ APP_URL: 'https://primary.example', NYVEN_APP_URL: 'https://secondary.example' }),
      HTTPS_REQUEST
    )
    assert.deepEqual(r, { ok: true, origin: 'https://primary.example' })
  })

  test('rejects values that are not absolute URLs', () => {
    for (const bad of ['nyven.example', 'not a url', '//app.example']) {
      const r = resolveAppOrigin(makeEnv({ APP_URL: bad }), HTTPS_REQUEST)
      assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(bad)}`)
    }
  })

  test('rejects non-http(s) schemes', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://app.example', 'file:///etc/passwd']) {
      const r = resolveAppOrigin(makeEnv({ APP_URL: bad }), HTTPS_REQUEST)
      assert.equal(r.ok, false, `expected rejection for ${bad}`)
    }
  })

  test('rejects a path, query, or fragment (origin only)', () => {
    for (const bad of ['https://app.example/nyven', 'https://app.example/?x=1', 'https://app.example/#frag']) {
      const r = resolveAppOrigin(makeEnv({ APP_URL: bad }), HTTPS_REQUEST)
      assert.equal(r.ok, false, `expected rejection for ${bad}`)
    }
  })

  test('rejects embedded credentials', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'https://user:pass@app.example' }), HTTPS_REQUEST)
    assert.equal(r.ok, false)
  })

  test('production requires https: plain http to a public host is rejected', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://app.example.com' }), HTTPS_REQUEST)
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /must use https/)
  })

  test('plain http to a public host is rejected even when the request is also http', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://app.example.com' }), 'http://app.example.com/x')
    assert.equal(r.ok, false)
  })

  test('local development: http://localhost is accepted for an explicit config over an http request', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://localhost:8788' }), LOCAL_REQUEST)
    assert.deepEqual(r, { ok: true, origin: 'http://localhost:8788' })
  })

  test('local development: 127.0.0.1 is accepted over http', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://127.0.0.1:8788' }), 'http://127.0.0.1:8788/x')
    assert.deepEqual(r, { ok: true, origin: 'http://127.0.0.1:8788' })
  })

  test('http loopback config is refused when the deployed request is https', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://localhost:8788' }), HTTPS_REQUEST)
    assert.equal(r.ok, false)
  })

  test('an unreadable request URL fails closed for http configuration', () => {
    const r = resolveAppOrigin(makeEnv({ APP_URL: 'http://localhost:8788' }), 'not a url')
    assert.equal(r.ok, false)
  })
})

describe('sanitizeReturnTo / resolveSafeReturnUrl: return destinations', () => {
  test('preserves the Settings return destination', () => {
    assert.equal(sanitizeReturnTo('/settings?section=connections'), '/settings?section=connections')
  })

  test('preserves the NYVEN Code agent return destination', () => {
    assert.equal(sanitizeReturnTo('/agents/agent-42?tab=connections'), '/agents/agent-42?tab=connections')
  })

  test('rejects absolute, protocol-relative, and scheme-bearing targets', () => {
    for (const bad of ['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', '/\\evil.example']) {
      assert.equal(sanitizeReturnTo(bad), DEFAULT_RETURN, `expected default for ${bad}`)
    }
  })

  test('rejects traversal and control characters', () => {
    assert.equal(sanitizeReturnTo('/../../admin'), DEFAULT_RETURN)
    assert.equal(sanitizeReturnTo('/settings\nSet-Cookie: x'), DEFAULT_RETURN)
    assert.equal(sanitizeReturnTo(''), DEFAULT_RETURN)
  })

  test('resolveSafeReturnUrl keeps a valid in-app path, returned relative to the origin', () => {
    assert.equal(
      resolveSafeReturnUrl('https://app.example', '/agents/agent-42?tab=connections'),
      '/agents/agent-42?tab=connections'
    )
  })

  test('resolveSafeReturnUrl falls back to Settings for a protocol-relative target', () => {
    assert.equal(resolveSafeReturnUrl('https://app.example', '//evil.example'), DEFAULT_RETURN)
  })
})

describe('lookupGitHubConnectionRow: query success vs. database failure', () => {
  const userId = 'user-1'

  test('a successful query with no row is ok with row null', async () => {
    useSupabase({ row: null })
    const r = await lookupGitHubConnectionRow(makeEnv(), userId)
    assert.deepEqual(r, { ok: true, row: null })
  })

  test('a successful query returns the row', async () => {
    const row = await connectedRow(userId)
    useSupabase({ row })
    const r = await lookupGitHubConnectionRow(makeEnv(), userId)
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.row?.status, 'connected')
  })

  test('an HTTP error from the database is ok:false, not "no row"', async () => {
    const sb = fakeSupabase({ row: null, read: 'http500' })
    installFetch(sb.route)
    const r = await lookupGitHubConnectionRow(makeEnv(), userId)
    assert.equal(r.ok, false)
  })

  test('a network failure is ok:false', async () => {
    const sb = fakeSupabase({ row: null, read: 'throw' })
    installFetch(sb.route)
    const r = await lookupGitHubConnectionRow(makeEnv(), userId)
    assert.equal(r.ok, false)
  })

  test('a non-JSON body is ok:false', async () => {
    const sb = fakeSupabase({ row: null, read: 'bad-json' })
    installFetch(sb.route)
    const r = await lookupGitHubConnectionRow(makeEnv(), userId)
    assert.equal(r.ok, false)
  })

  test('missing service-role configuration is ok:false', async () => {
    const r = await lookupGitHubConnectionRow(makeEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }), userId)
    assert.equal(r.ok, false)
  })

  test('the legacy getGitHubConnectionRow wrapper still returns null on failure (read-path behaviour unchanged)', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), read: 'http500' })
    installFetch(sb.route)
    assert.equal(await getGitHubConnectionRow(makeEnv(), userId), null)
  })
})

describe('verifyGitHubDisconnected', () => {
  test('passes when no row exists', async () => {
    useSupabase({ row: null })
    assert.deepEqual(await verifyGitHubDisconnected(makeEnv(), 'user-1'), { ok: true })
  })

  test('passes when the remaining row is not connected', async () => {
    const row = { ...(await connectedRow('user-1')), status: 'disconnected' }
    useSupabase({ row })
    assert.deepEqual(await verifyGitHubDisconnected(makeEnv(), 'user-1'), { ok: true })
  })

  test('fails when an active connected row remains', async () => {
    useSupabase({ row: await connectedRow('user-1') })
    const r = await verifyGitHubDisconnected(makeEnv(), 'user-1')
    assert.equal(r.ok, false)
  })

  test('fails when the read itself fails (unknown is not disconnected)', async () => {
    installFetch(fakeSupabase({ row: null, read: 'http500' }).route)
    const r = await verifyGitHubDisconnected(makeEnv(), 'user-1')
    assert.equal(r.ok, false)
  })
})

describe('disconnectGitHub: verification after write', () => {
  const userId = 'user-1'

  test('PATCH succeeds and verification confirms no active row: success, token revoked', async () => {
    captureLogs()
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.deepEqual(result, { ok: true, revoked: true })
    assert.equal(sb.state.row?.status, 'disconnected')
  })

  test('PATCH fails, DELETE succeeds, verification confirms: success', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'fail', del: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, true)
    assert.equal(sb.state.row, null)
  })

  test('PATCH returns 200 but the row is still connected: DB_DISCONNECT', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'noop' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'DB_DISCONNECT')
  })

  test('PATCH and DELETE both fail and the row stays connected: DB_DISCONNECT', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'fail', del: 'fail' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'DB_DISCONNECT')
  })

  test('PATCH succeeds but the verification read fails: DB_DISCONNECT, not success', async () => {
    const sb = fakeSupabase({
      row: await connectedRow(userId),
      patch: 'ok',
      read: 'http500',
      readFailsAfterWrite: true,
    })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'DB_DISCONNECT')
  })

  test('verification network failure after a write: DB_DISCONNECT', async () => {
    const sb = fakeSupabase({
      row: await connectedRow(userId),
      patch: 'ok',
      read: 'throw',
      readFailsAfterWrite: true,
    })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'DB_DISCONNECT')
  })

  test('every read and write fails: DB_DISCONNECT (the old code reported success here)', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'fail', del: 'fail', read: 'http500' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'DB_DISCONNECT')
  })

  test('a confirmed missing row counts as already disconnected, even when writes fail', async () => {
    const sb = fakeSupabase({ row: null, patch: 'fail', del: 'fail' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.deepEqual(result, { ok: true, revoked: false })
  })

  test('a PATCH that matches no row (200, empty) counts as already disconnected', async () => {
    const sb = fakeSupabase({ row: null, patch: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('ok'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(result.ok, true)
  })

  test('GitHub revocation throwing is best-effort: disconnect still succeeds with revoked:false', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('throw'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.deepEqual(result, { ok: true, revoked: false })
  })

  test('GitHub revocation returning 500 is best-effort too', async () => {
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('fail'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.deepEqual(result, { ok: true, revoked: false })
  })

  test('missing service-role key returns CONFIG without touching the network', async () => {
    const { calls } = installFetch(() => json({}))
    const result = await disconnectGitHub(makeEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }), userId)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.code, 'CONFIG')
    assert.equal(calls.length, 0)
  })

  test('no access token appears in the result or in server logs', async () => {
    captureLogs()
    const sb = fakeSupabase({ row: await connectedRow(userId), patch: 'fail', del: 'fail', read: 'ok' })
    installFetch(composeRoutes(githubRevokeRoute('fail'), sb.route))
    const result = await disconnectGitHub(makeEnv(), userId)
    assert.equal(JSON.stringify(result).includes(ACCESS_TOKEN), false)
    assert.equal(logged.join('\n').includes(ACCESS_TOKEN), false)
    // The revoke call does send the token to GitHub by design; make sure we only targeted GitHub's revoke endpoint.
    const revoke = fetchCalls().find((c) => c.url.includes('/applications/'))
    assert.ok(revoke, 'revoke endpoint should have been called')
  })
})
