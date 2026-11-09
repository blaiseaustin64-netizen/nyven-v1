/**
 * Test harness for the GitHub connector — D1-first (Cloudflare auth migration).
 */
import { afterEach } from 'node:test'
import { encryptToken } from '../../functions/_shared/github/crypto.ts'
import type { GitHubEnv } from '../../functions/_shared/github/service.ts'

export const SUPABASE_URL = 'https://sb.test'
export const CONNECTOR_SECRET = 'test-connector-token-secret'
export const GITHUB_CLIENT_ID = 'Iv1.testclient'
export const GITHUB_CLIENT_SECRET = 'gh-client-secret-value'
export const ACCESS_TOKEN = 'gho_TEST_ACCESS_TOKEN_DO_NOT_LEAK'

export type FakeRow = Record<string, unknown>

function makeD1Db(
  rows: Map<string, FakeRow>,
  sessions: Map<string, { userId: string; expires_at: string; revoked_at: string | null }> = new Map(),
  users: Map<string, FakeRow> = new Map()
) {
  const prepare = (sql: string) => {
    const binds: unknown[] = []
    const stmt = {
      bind(...args: unknown[]) { binds.push(...args); return stmt },
      async first<T = Record<string, unknown>>() {
        const s = sql.toLowerCase()
        if (s.includes('auth_sessions') && s.includes('token_hash')) {
          const tokenHash = String(binds[0] || '')
          const sess = sessions.get(tokenHash)
          if (!sess) return null
          const user = users.get(sess.userId)
          if (!user) return null
          return { session_id: 'sess-1', expires_at: sess.expires_at, revoked_at: sess.revoked_at, ...user } as T
        }
        if (s.includes('select') && s.includes('oauth_connections')) {
          for (const b of binds) {
            if (typeof b === 'string' && rows.has(b)) return rows.get(b) as T
          }
          if (binds[0] != null) return (rows.get(String(binds[0])) as T) || null
          return null
        }
        return null
      },
      async run() {
        const s = sql.toLowerCase()
        if (s.includes('insert into oauth_connections')) {
          const userId = String(binds[1])
          rows.set(userId, {
            id: String(binds[0]), user_id: userId, provider: 'github', status: 'connected',
            account_label: binds[2],
            scopes: typeof binds[3] === 'string' ? String(binds[3]).split(/\s+/).filter(Boolean) : binds[3],
            token_ciphertext: binds[4], metadata_json: binds[5],
            metadata: (() => { try { return JSON.parse(String(binds[5] || '{}')) } catch { return {} } })(),
            connected_at: binds[6], created_at: binds[7], updated_at: binds[8],
          })
          return { success: true }
        }
        if (s.includes('update oauth_connections')) {
          let uid: string | null = null
          for (const b of binds) if (typeof b === 'string' && rows.has(b)) uid = b
          if (!uid && binds.length >= 2 && typeof binds[1] === 'string') uid = String(binds[1])
          if (uid && rows.has(uid)) {
            rows.set(uid, { ...rows.get(uid)!, status: 'disconnected', token_ciphertext: null, account_label: null, scopes: null, metadata_json: '{}' })
          }
          return { success: true }
        }
        if (s.includes('delete from oauth_connections')) {
          rows.delete(String(binds[0]))
          return { success: true }
        }
        return { success: true }
      },
      async all() { return { results: [...rows.values()] } },
    }
    return stmt
  }
  return { prepare, batch: async (stmts: any[]) => { for (const s of stmts) if (s?.run) await s.run() } }
}

export function makeEnv(overrides: Record<string, unknown> = {}): GitHubEnv & { DB?: any } {
  const rows = new Map<string, FakeRow>()
  const sessions = new Map<string, { userId: string; expires_at: string; revoked_at: string | null }>()
  const users = new Map<string, FakeRow>()
  const base: any = {
    GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CONNECTOR_TOKEN_SECRET: CONNECTOR_SECRET,
    AUTH_SESSION_SECRET: 'test-session-secret',
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    APP_URL: 'https://nyven-v1.pages.dev',
    DB: makeD1Db(rows, sessions, users),
    _rows: rows, _sessions: sessions, _users: users,
    ...overrides,
  }
  if ('DB' in overrides && overrides.DB === undefined) delete base.DB
  return base
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function makeD1Env(initial: FakeRow | null = null, overrides: Record<string, unknown> = {}) {
  const env = makeEnv(overrides) as any
  if (initial) env._rows.set(String(initial.user_id), { ...initial })
  return { env, rows: env._rows as Map<string, FakeRow> }
}

export function envWithRow(row: FakeRow | null = null, overrides: Record<string, unknown> = {}) {
  return makeD1Env(row, overrides).env
}

export async function signedInEnv(
  userId: string, bearerToken: string, githubRow: FakeRow | null = null, overrides: Record<string, unknown> = {}
) {
  const env = makeEnv(overrides) as any
  const expires = new Date(Date.now() + 86400_000).toISOString()
  env._users.set(userId, {
    id: userId, email: 'user@example.test', email_normalized: 'user@example.test',
    password_hash: 'x', display_name: 'Test', email_verified: 1, created_at: expires, updated_at: expires,
  })
  const tokenHash = await sha256Hex(`test-session-secret:${bearerToken}`)
  env._sessions.set(tokenHash, { userId, expires_at: expires, revoked_at: null })
  if (githubRow) env._rows.set(String(githubRow.user_id || userId), { ...githubRow, user_id: userId })
  return env
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export type FetchCall = { url: string; method: string; body: string | null; auth: string | null }
type Route = (call: FetchCall) => Response | null | Promise<Response | null>
const originalFetch = globalThis.fetch
let calls: FetchCall[] = []

export function installFetch(route: Route): { calls: FetchCall[] } {
  calls = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : null
    const auth = new Headers(init?.headers as HeadersInit | undefined).get('Authorization')
    const call = { url, method, body, auth }
    calls.push(call)
    return (await route(call)) ?? json({ message: `unhandled ${method} ${url}` }, 599)
  }) as typeof fetch
  return { calls }
}
export function fetchCalls(): FetchCall[] { return calls }
afterEach(() => { globalThis.fetch = originalFetch; calls = [] })

export async function connectedRow(userId: string, token = ACCESS_TOKEN): Promise<FakeRow> {
  const ciphertext = await encryptToken(
    JSON.stringify({ access_token: token, token_type: 'bearer', scope: 'read:user repo' }),
    CONNECTOR_SECRET
  )
  return {
    id: 'conn-1', user_id: userId, provider: 'github', status: 'connected',
    account_label: 'octocat', scopes: ['read:user', 'repo'],
    metadata: { github_login: 'octocat' }, metadata_json: JSON.stringify({ github_login: 'octocat' }),
    token_ciphertext: ciphertext,
    connected_at: '2026-10-01T00:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  }
}

export type SupabaseFakeOptions = {
  row: FakeRow | null
  patch?: 'ok' | 'fail' | 'noop' | 'throw'
  del?: 'ok' | 'fail' | 'throw'
  read?: 'ok' | 'http500' | 'throw' | 'bad-json'
  readFailsAfterWrite?: boolean
}

export function fakeSupabase(opts: SupabaseFakeOptions) {
  const state = { row: opts.row, wrote: false }
  const readMode = opts.read ?? 'ok'
  const route: Route = async (call) => {
    if (!call.url.startsWith(`${SUPABASE_URL}/rest/v1/connections`)) return null
    if (call.method === 'GET') {
      const mode = opts.readFailsAfterWrite && !state.wrote ? 'ok' : readMode
      if (mode === 'throw') throw new TypeError('fetch failed')
      if (mode === 'http500') return json({ message: 'boom' }, 500)
      if (mode === 'bad-json') return new Response('<html>oops</html>', { status: 200 })
      return json(state.row ? [state.row] : [])
    }
    return json(state.row ? [state.row] : [])
  }
  let env: any
  if (readMode === 'http500' || readMode === 'throw' || readMode === 'bad-json') {
    env = makeEnv({ DB: undefined })
  } else {
    env = makeD1Env(opts.row).env
  }
  return { state, route, env }
}

export function useSupabase(opts: SupabaseFakeOptions) {
  const sb = fakeSupabase(opts)
  installFetch(sb.route)
  return sb
}

export function composeRoutes(...routes: Route[]): Route {
  return async (call) => {
    for (const r of routes) {
      const out = await r(call)
      if (out) return out
    }
    return json({ message: `unhandled ${call.method} ${call.url}` }, 599)
  }
}

export function githubRevokeRoute(mode: 'ok' | 'fail' | 'throw' = 'ok'): (call: FetchCall) => Response | null {
  return (call) => {
    if (!call.url.startsWith(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/token`)) return null
    if (mode === 'throw') throw new TypeError('network down')
    if (mode === 'fail') return json({ message: 'nope' }, 500)
    return new Response(null, { status: 204 })
  }
}
