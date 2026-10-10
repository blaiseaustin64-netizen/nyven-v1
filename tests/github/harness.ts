/**
 * Test harness for the GitHub connector. No network: global fetch is replaced with
 * an in-memory Supabase REST fake and a GitHub API fake.
 */
import { afterEach } from 'node:test'
import { encryptToken } from '../../functions/_shared/github/crypto.ts'
import type { GitHubEnv } from '../../functions/_shared/github/service.ts'

export const SUPABASE_URL = 'https://sb.test'
export const CONNECTOR_SECRET = 'test-connector-token-secret'
export const GITHUB_CLIENT_ID = 'Iv1.testclient'
export const GITHUB_CLIENT_SECRET = 'gh-client-secret-value'
export const ACCESS_TOKEN = 'gho_TEST_ACCESS_TOKEN_DO_NOT_LEAK'

export function makeEnv(overrides: Partial<Record<keyof GitHubEnv, string | undefined>> = {}): GitHubEnv {
  return {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    CONNECTOR_TOKEN_SECRET: CONNECTOR_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    ...overrides,
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type FetchCall = { url: string; method: string; body: string | null; auth: string | null }

type Route = (call: FetchCall) => Response | Promise<Response>

const originalFetch = globalThis.fetch
let calls: FetchCall[] = []

/** Replace global fetch with a route function. Restored automatically after each test. */
export function installFetch(route: Route): { calls: FetchCall[] } {
  calls = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : null
    const auth = new Headers(init?.headers as HeadersInit | undefined).get('Authorization')
    const call = { url, method, body, auth }
    calls.push(call)
    return route(call)
  }) as typeof fetch
  return { calls }
}

export function fetchCalls(): FetchCall[] {
  return calls
}

afterEach(() => {
  globalThis.fetch = originalFetch
  calls = []
})

export type FakeRow = Record<string, unknown>

export async function connectedRow(userId: string, token = ACCESS_TOKEN): Promise<FakeRow> {
  const ciphertext = await encryptToken(
    JSON.stringify({ access_token: token, token_type: 'bearer', scope: 'read:user repo' }),
    CONNECTOR_SECRET
  )
  return {
    id: 'conn-1',
    user_id: userId,
    provider: 'github',
    status: 'connected',
    account_label: 'octocat',
    scopes: ['read:user', 'repo'],
    metadata: { github_login: 'octocat' },
    token_ciphertext: ciphertext,
    connected_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  }
}

export type SupabaseFakeOptions = {
  /** Starting row, or null when the user has no connection. */
  row: FakeRow | null
  /** PATCH behaviour: 'ok' applies it, 'fail' returns 500, 'noop' returns 200 without applying, 'throw' rejects. */
  patch?: 'ok' | 'fail' | 'noop' | 'throw'
  /** DELETE behaviour: 'ok' removes the row, 'fail' returns 500, 'throw' rejects. */
  del?: 'ok' | 'fail' | 'throw'
  /** Read behaviour: 'ok', 'http500', 'throw' (network), or 'bad-json'. */
  read?: 'ok' | 'http500' | 'throw' | 'bad-json'
  /** When true, reads behave normally until the first write, then use `read` mode. */
  readFailsAfterWrite?: boolean
}

export type SupabaseFake = {
  state: { row: FakeRow | null; wrote: boolean }
  route: Route
}

/** Minimal in-memory `connections` table behind the Supabase REST endpoint. Returns a route; install it with installFetch / composeRoutes. */
export function fakeSupabase(opts: SupabaseFakeOptions): SupabaseFake {
  const state = { row: opts.row, wrote: false }
  const readMode = opts.read ?? 'ok'
  const patchMode = opts.patch ?? 'ok'
  const delMode = opts.del ?? 'ok'

  const route: Route = async (call) => {
    if (!call.url.startsWith(`${SUPABASE_URL}/rest/v1/connections`)) {
      return json({ message: 'unexpected supabase path' }, 404)
    }
    if (call.method === 'GET') {
      const mode = opts.readFailsAfterWrite && !state.wrote ? 'ok' : readMode
      if (mode === 'throw') throw new TypeError('fetch failed')
      if (mode === 'http500') return json({ message: 'boom' }, 500)
      if (mode === 'bad-json') return new Response('<html>oops</html>', { status: 200 })
      return json(state.row ? [state.row] : [])
    }
    if (call.method === 'PATCH') {
      state.wrote = true
      if (patchMode === 'throw') throw new TypeError('fetch failed')
      if (patchMode === 'fail') return json({ message: 'patch failed' }, 500)
      if (patchMode === 'ok' && state.row) {
        state.row = { ...state.row, status: 'disconnected', token_ciphertext: null }
      }
      return json(state.row ? [state.row] : [])
    }
    if (call.method === 'DELETE') {
      state.wrote = true
      if (delMode === 'throw') throw new TypeError('fetch failed')
      if (delMode === 'fail') return json({ message: 'delete failed' }, 500)
      state.row = null
      return new Response(null, { status: 204 })
    }
    if (call.method === 'POST') {
      // Used by the OAuth callback upsert; the callback tests supply their own route.
      return json([state.row ?? {}])
    }
    return json({}, 405)
  }
  return { state, route }
}

/** Try each route in order; the first non-null response wins. */
export function composeRoutes(...routes: Array<(call: FetchCall) => Response | null | Promise<Response>>): Route {
  return async (call) => {
    for (const r of routes) {
      const out = await r(call)
      if (out) return out
    }
    return json({ message: `unhandled ${call.method} ${call.url}` }, 599)
  }
}

/** GitHub revoke endpoint: 'ok' returns 204, 'throw' rejects, 'fail' returns 500. */
export function githubRevokeRoute(mode: 'ok' | 'fail' | 'throw' = 'ok'): (call: FetchCall) => Response | null {
  return (call) => {
    if (!call.url.startsWith(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/token`)) return null
    if (mode === 'throw') throw new TypeError('network down')
    if (mode === 'fail') return json({ message: 'nope' }, 500)
    return new Response(null, { status: 204 })
  }
}

/** Convenience: create the fake Supabase and install it as the global fetch route. */
export function useSupabase(opts: SupabaseFakeOptions): SupabaseFake {
  const sb = fakeSupabase(opts)
  installFetch(sb.route)
  return sb
}
