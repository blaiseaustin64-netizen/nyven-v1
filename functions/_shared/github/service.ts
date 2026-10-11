/**
 * Shared GitHub connector service — used by Settings and NYVEN Code.
 * Tokens never leave the server.
 */

import { encryptToken, decryptToken, randomUrlSafe, hmacSign, hmacVerify } from './crypto'
import { toPublicConnection, type ConnectionPublicDTO } from '../connectors'

export type GitHubEnv = {
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  CONNECTOR_TOKEN_SECRET?: string
  /** App origin for redirects, e.g. https://nyven-v1.pages.dev */
  APP_URL?: string
  NYVEN_APP_URL?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const PROVIDER = 'github'
/** Read identity + list repos (public + private the user can access). No write scopes. */
export const GITHUB_SCOPES = ['read:user', 'repo'].join(' ')

export function githubConfigured(env: GitHubEnv): boolean {
  // OAuth secrets only — Supabase DB is optional until the account system ships.
  return Boolean(
    env.GITHUB_CLIENT_ID &&
      env.GITHUB_CLIENT_SECRET &&
      env.CONNECTOR_TOKEN_SECRET
  )
}

/** Privileged DB ops require service role — never fall back to anon. */
export function githubDbConfigured(env: GitHubEnv): boolean {
  return Boolean(
    (env.SUPABASE_URL || env.VITE_SUPABASE_URL) && env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export type AppOriginResult = { ok: true; origin: string } | { ok: false; error: string }

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function requestIsHttps(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).protocol === 'https:'
  } catch {
    // Fail closed: if the request URL cannot be read, do not allow plain http.
    return true
  }
}

/**
 * Resolve the public app origin used for the GitHub callback URL and final redirects.
 *
 * Only the explicitly configured APP_URL (or NYVEN_APP_URL) is trusted. The incoming
 * request URL is never used to derive the origin; it is only consulted to refuse
 * plain-http configuration when the deployed site itself is served over https.
 *
 * - https:// origins are accepted (production).
 * - http:// is accepted only for loopback hosts (localhost / 127.0.0.1 / [::1]) and only
 *   when the incoming request is plain http, i.e. `wrangler pages dev` on your machine.
 */
export function resolveAppOrigin(env: GitHubEnv, requestUrl: string): AppOriginResult {
  const invalid = (error: string): AppOriginResult => ({ ok: false, error })
  const raw = (env.APP_URL || env.NYVEN_APP_URL || '').trim()
  if (!raw) {
    return invalid(
      'APP_URL is not set. Set APP_URL to the public origin of the app (for example https://nyven-v1.pages.dev).'
    )
  }

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return invalid('APP_URL is not a valid absolute URL.')
  }
  if (u.username || u.password) {
    return invalid('APP_URL must not contain credentials.')
  }
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    return invalid('APP_URL must be an origin only, with no path, query or fragment.')
  }
  if (u.protocol === 'https:') {
    return { ok: true, origin: u.origin }
  }
  if (u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname) && !requestIsHttps(requestUrl)) {
    return { ok: true, origin: u.origin }
  }
  return invalid(
    'APP_URL must use https:// (http:// is allowed only for localhost during local development).'
  )
}

/**
 * Single source of truth for "can GitHub OAuth be initiated here?".
 * Requires every server secret and a valid explicit application origin.
 * Messages name configuration keys only, never values.
 */
export type GitHubOAuthReadiness = { ok: true; origin: string } | { ok: false; error: string }

export function githubOAuthReadiness(env: GitHubEnv, requestUrl: string): GitHubOAuthReadiness {
  if (!githubConfigured(env)) {
    return {
      ok: false,
      error:
        'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, CONNECTOR_TOKEN_SECRET, and APP_URL.',
    }
  }
  const app = resolveAppOrigin(env, requestUrl)
  if (!app.ok) return { ok: false, error: app.error }
  return { ok: true, origin: app.origin }
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/connectors/github/callback`
}

type OAuthSession = {
  userId: string
  codeVerifier: string
  returnTo: string
  exp: number
}

export async function packOAuthSession(
  session: OAuthSession,
  secret: string
): Promise<string> {
  const payload = btoa(JSON.stringify(session))
  const sig = await hmacSign(payload, secret)
  return `${payload}.${sig}`
}

export async function unpackOAuthSession(
  cookieVal: string,
  secret: string
): Promise<OAuthSession | null> {
  const i = cookieVal.lastIndexOf('.')
  if (i < 1) return null
  const payload = cookieVal.slice(0, i)
  const sig = cookieVal.slice(i + 1)
  if (!(await hmacVerify(payload, sig, secret))) return null
  try {
    const data = JSON.parse(atob(payload)) as OAuthSession
    if (!data.userId || !data.codeVerifier || !data.exp) return null
    if (Date.now() > data.exp) return null
    return data
  } catch {
    return null
  }
}

export async function buildAuthorizeUrl(
  env: GitHubEnv,
  requestUrl: string,
  userId: string,
  returnTo: string
): Promise<{ url: string; cookieValue: string } | { error: string; code: 'CONFIG' }> {
  const app = githubOAuthReadiness(env, requestUrl)
  if (!app.ok) {
    return { code: 'CONFIG', error: app.error }
  }
  const codeVerifier = randomUrlSafe(32)
  const challenge = await pkceChallenge(codeVerifier)
  const state = randomUrlSafe(16)
  const cookieValue = await packOAuthSession(
    {
      userId,
      codeVerifier,
      returnTo: sanitizeReturnTo(returnTo),
      exp: Date.now() + 15 * 60 * 1000,
    },
    env.CONNECTOR_TOKEN_SECRET!
  )

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID!,
    redirect_uri: callbackUrl(app.origin),
    scope: GITHUB_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  // Embed state also in cookie session via binding state in cookie name suffix — store state in session
  const sessionWithState = await packOAuthSession(
    {
      userId,
      codeVerifier: `${codeVerifier}|${state}`,
      returnTo: sanitizeReturnTo(returnTo),
      exp: Date.now() + 15 * 60 * 1000,
    },
    env.CONNECTOR_TOKEN_SECRET!
  )

  return {
    url: `https://github.com/login/oauth/authorize?${params}`,
    cookieValue: sessionWithState,
  }
}

const DEFAULT_RETURN = '/settings?section=connections'

/**
 * Allow only relative in-app paths (Settings, agents, etc.).
 * Reject protocol-relative, absolute URLs, backslashes, and control chars.
 */
export function sanitizeReturnTo(raw: string): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_RETURN
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return DEFAULT_RETURN
  if (trimmed.startsWith('//')) return DEFAULT_RETURN
  if (trimmed.includes('://')) return DEFAULT_RETURN
  if (trimmed.includes('\\') || /[\x00-\x1f]/.test(trimmed)) return DEFAULT_RETURN
  // Block path tricks that escape the app
  if (trimmed.includes('..')) return DEFAULT_RETURN
  return trimmed.slice(0, 200)
}

/**
 * Resolve return path against app origin; reject if host would leave the app.
 */
export function resolveSafeReturnUrl(origin: string, returnTo: string): string {
  const path = sanitizeReturnTo(returnTo)
  const base = (origin || '').replace(/\/$/, '')
  if (!base) return path
  try {
    const dest = new URL(path, base + '/')
    const originUrl = new URL(base)
    if (dest.origin !== originUrl.origin) return `${base}${DEFAULT_RETURN}`
    // Path-only redirect (relative to origin)
    return dest.pathname + dest.search + dest.hash
  } catch {
    return `${base}${DEFAULT_RETURN}`
  }
}

async function pkceChallenge(verifier: string): Promise<string> {
  const dig = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  const bytes = new Uint8Array(dig)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function parseVerifierAndState(stored: string): {
  codeVerifier: string
  state: string
} | null {
  const i = stored.lastIndexOf('|')
  if (i < 1) return null
  return { codeVerifier: stored.slice(0, i), state: stored.slice(i + 1) }
}

type SbConfig = { url: string; key: string; service: boolean }

function supabaseAdmin(env: GitHubEnv): SbConfig | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const service = env.SUPABASE_SERVICE_ROLE_KEY || ''
  // Anon / VITE keys must never substitute for service role on token paths
  if (!url || !service) return null
  return { url, key: service, service: true }
}

async function sbFetch(
  cfg: SbConfig,
  path: string,
  init: RequestInit & { userJwt?: string } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: cfg.key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(init.headers as Record<string, string>),
  }
  if (cfg.service) {
    headers.Authorization = `Bearer ${cfg.key}`
  } else if (init.userJwt) {
    headers.Authorization = `Bearer ${init.userJwt}`
  }
  return fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers })
}

export type GitHubTokenPayload = {
  access_token: string
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  env: GitHubEnv,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<GitHubTokenPayload | { error: string }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })
  const data = (await res.json()) as GitHubTokenPayload & { error?: string; error_description?: string }
  if (!res.ok || data.error || !data.access_token) {
    return {
      error: data.error_description || data.error || 'Token exchange failed',
    }
  }
  return data
}

export async function fetchGitHubUser(
  accessToken: string
): Promise<{ login: string; id: number; name?: string } | null> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NYVEN',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) return null
  return (await res.json()) as { login: string; id: number; name?: string }
}

export async function upsertGitHubConnection(
  env: GitHubEnv,
  userId: string,
  token: GitHubTokenPayload,
  ghUser: { login: string; id: number; name?: string },
  userJwt?: string
): Promise<{ ok: true; row: ConnectionPublicDTO } | { ok: false; error: string }> {
  const cfg = supabaseAdmin(env)
  if (!cfg) {
    return {
      ok: false,
      error:
        'Server configuration error: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL are required to store GitHub connections.',
    }
  }
  if (!env.CONNECTOR_TOKEN_SECRET) {
    return { ok: false, error: 'CONNECTOR_TOKEN_SECRET is not set.' }
  }

  const ciphertext = await encryptToken(
    JSON.stringify({
      access_token: token.access_token,
      token_type: token.token_type || 'bearer',
      scope: token.scope || GITHUB_SCOPES,
    }),
    env.CONNECTOR_TOKEN_SECRET
  )

  const now = new Date().toISOString()
  const body = {
    user_id: userId,
    provider: PROVIDER,
    status: 'connected',
    account_label: ghUser.login,
    scopes: (token.scope || GITHUB_SCOPES).split(/[\s,]+/).filter(Boolean),
    token_ciphertext: ciphertext,
    metadata: {
      github_user_id: ghUser.id,
      github_login: ghUser.login,
      github_name: ghUser.name || null,
    },
    connected_at: now,
    updated_at: now,
  }

  // Upsert on (user_id, provider)
  const res = await sbFetch(
    cfg,
    `connections?on_conflict=user_id,provider`,
    {
      method: 'POST',
      userJwt,
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('github upsert failed', res.status, errText.slice(0, 200))
    return { ok: false, error: 'Could not save GitHub connection.' }
  }

  const rows = (await res.json()) as Record<string, unknown>[]
  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row) return { ok: false, error: 'Could not save GitHub connection.' }
  return { ok: true, row: toPublicConnection(row as Record<string, unknown>) }
}

/**
 * Outcome of reading the GitHub connection row.
 * `ok: true, row: null` means the query succeeded and no row exists.
 * `ok: false` means the database read itself failed; the state is unknown.
 */
export type GitHubConnectionLookup =
  | { ok: true; row: Record<string, unknown> | null }
  | { ok: false; error: string }

export async function lookupGitHubConnectionRow(
  env: GitHubEnv,
  userId: string,
  userJwt?: string
): Promise<GitHubConnectionLookup> {
  const cfg = supabaseAdmin(env)
  if (!cfg) {
    return { ok: false, error: 'Database admin access is not configured.' }
  }
  try {
    const res = await sbFetch(
      cfg,
      `connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.github&select=*`,
      { method: 'GET', userJwt }
    )
    if (!res.ok) {
      console.error('github connection lookup failed', res.status)
      return { ok: false, error: 'Could not read GitHub connection state.' }
    }
    const rows = (await res.json()) as unknown
    if (!Array.isArray(rows)) {
      return { ok: false, error: 'Could not read GitHub connection state.' }
    }
    return { ok: true, row: (rows[0] as Record<string, unknown> | undefined) || null }
  } catch (e) {
    console.error('github connection lookup threw', e instanceof Error ? e.name : 'unknown')
    return { ok: false, error: 'Could not read GitHub connection state.' }
  }
}

/** Convenience wrapper for read paths: a failed query is reported as no row. */
export async function getGitHubConnectionRow(
  env: GitHubEnv,
  userId: string,
  userJwt?: string
): Promise<Record<string, unknown> | null> {
  const lookup = await lookupGitHubConnectionRow(env, userId, userJwt)
  return lookup.ok ? lookup.row : null
}

/**
 * Confirm no active (`status === 'connected'`) GitHub row remains for the user.
 * A confirmed missing row or a non-connected row passes; a failed read does not.
 */
export async function verifyGitHubDisconnected(
  env: GitHubEnv,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lookup = await lookupGitHubConnectionRow(env, userId)
  if (!lookup.ok) {
    return { ok: false, error: lookup.error }
  }
  if (lookup.row && lookup.row.status === 'connected') {
    return { ok: false, error: 'An active GitHub connection still exists.' }
  }
  return { ok: true }
}

/** Best-effort write: soft-disconnect via PATCH, falling back to DELETE. Never throws. */
async function writeGitHubDisconnect(cfg: SbConfig, filter: string): Promise<void> {
  try {
    const patch = await sbFetch(cfg, filter, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'disconnected',
        token_ciphertext: null,
        account_label: null,
        scopes: null,
        metadata: {},
        updated_at: new Date().toISOString(),
      }),
    })
    if (patch.ok) return

    const del = await sbFetch(cfg, filter, { method: 'DELETE' })
    if (!(del.ok || del.status === 204)) {
      console.error('github disconnect write failed', patch.status, del.status)
    }
  } catch (e) {
    console.error('github disconnect write threw', e instanceof Error ? e.name : 'unknown')
  }
}

export type GitHubAccessTokenResult =
  | { ok: true; token: string; row: Record<string, unknown> }
  | { ok: false; code: 'CONFIG' | 'NOT_CONNECTED' | 'DB_READ' | 'DECRYPT'; error: string }

/**
 * Resolve the stored GitHub access token for a user.
 * - NOT_CONNECTED: the query succeeded and there is no connected row (confirmed).
 * - DB_READ: the database lookup failed (HTTP error, network, malformed response). Retry later.
 * - DECRYPT: a connected row exists but its stored credentials cannot be read.
 * The token is returned only to server callers and never included in errors.
 */
export async function getAccessTokenForUser(
  env: GitHubEnv,
  userId: string,
  userJwt?: string
): Promise<GitHubAccessTokenResult> {
  if (!githubDbConfigured(env)) {
    return {
      ok: false,
      code: 'CONFIG',
      error:
        'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required for GitHub connections.',
    }
  }
  if (!env.CONNECTOR_TOKEN_SECRET) {
    return { ok: false, code: 'CONFIG', error: 'CONNECTOR_TOKEN_SECRET is not set.' }
  }
  const lookup = await lookupGitHubConnectionRow(env, userId, userJwt)
  if (!lookup.ok) {
    return { ok: false, code: 'DB_READ', error: 'Could not read GitHub connection state. Try again shortly.' }
  }
  const row = lookup.row
  if (!row || row.status !== 'connected') {
    return { ok: false, code: 'NOT_CONNECTED', error: 'GitHub is not connected.' }
  }
  const blob = row.token_ciphertext as string | null
  if (!blob) {
    return { ok: false, code: 'DECRYPT', error: 'Stored GitHub credentials are unavailable. Reconnect GitHub.' }
  }
  const plain = await decryptToken(blob, env.CONNECTOR_TOKEN_SECRET)
  if (!plain) {
    return { ok: false, code: 'DECRYPT', error: 'Could not read stored credentials.' }
  }
  try {
    const parsed = JSON.parse(plain) as { access_token?: string }
    if (!parsed.access_token) {
      return { ok: false, code: 'DECRYPT', error: 'Invalid stored credentials.' }
    }
    return { ok: true, token: parsed.access_token, row }
  } catch {
    return { ok: false, code: 'DECRYPT', error: 'Invalid stored credentials.' }
  }
}

export async function disconnectGitHub(
  env: GitHubEnv,
  userId: string,
  userJwt?: string
): Promise<
  | { ok: true; revoked?: boolean }
  | { ok: false; error: string; code?: string }
> {
  if (!githubDbConfigured(env)) {
    return {
      ok: false,
      code: 'CONFIG',
      error:
        'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is required to disconnect GitHub.',
    }
  }

  // Best-effort provider revoke — failure does not equal DB failure
  let revoked = false
  const tokenResult = await getAccessTokenForUser(env, userId, userJwt)
  if (tokenResult.ok && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    try {
      const rev = await fetch(
        `https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`,
        {
          method: 'DELETE',
          headers: {
            Authorization:
              'Basic ' +
              btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`),
            Accept: 'application/vnd.github+json',
            'User-Agent': 'NYVEN',
          },
          body: JSON.stringify({ access_token: tokenResult.token }),
        }
      )
      revoked = rev.ok || rev.status === 204
    } catch {
      revoked = false
    }
  }

  const cfg = supabaseAdmin(env)
  if (!cfg) {
    return {
      ok: false,
      code: 'CONFIG',
      error: 'Server configuration error: database admin access is not configured.',
    }
  }

  const filter = `connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.github`

  // Write attempt (PATCH, then DELETE if PATCH fails). Its result is not trusted on its own:
  // the outcome is decided by the verification read below.
  await writeGitHubDisconnect(cfg, filter)

  // Success requires a successful read showing no active connected row.
  // A failed read is treated as unverified, never as disconnected.
  const verified = await verifyGitHubDisconnected(env, userId)
  if (!verified.ok) {
    return {
      ok: false,
      code: 'DB_DISCONNECT',
      error: 'Could not disconnect GitHub connection in the database.',
    }
  }

  return { ok: true, revoked }
}

export type RepoSummary = {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: string
  default_branch: string
  html_url: string
  description: string | null
  updated_at: string | null
}

export async function listUserRepos(
  accessToken: string,
  opts?: { page?: number; perPage?: number }
): Promise<{ repos: RepoSummary[] } | { error: string; status?: number }> {
  const page = opts?.page || 1
  const perPage = Math.min(opts?.perPage || 50, 100)
  const res = await fetch(
    `https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=${perPage}&page=${page}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NYVEN',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  if (res.status === 401 || res.status === 403) {
    return { error: 'GitHub access was denied or revoked.', status: res.status }
  }
  if (res.status === 429) {
    return { error: 'GitHub rate limit exceeded. Try again later.', status: 429 }
  }
  if (!res.ok) {
    return { error: `GitHub API error (${res.status}).`, status: res.status }
  }
  const data = (await res.json()) as Array<{
    id: number
    name: string
    full_name: string
    private: boolean
    owner?: { login?: string }
    default_branch?: string
    html_url?: string
    description?: string | null
    updated_at?: string | null
  }>
  return {
    repos: data.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: !!r.private,
      owner: r.owner?.login || r.full_name.split('/')[0],
      default_branch: r.default_branch || 'main',
      html_url: r.html_url || `https://github.com/${r.full_name}`,
      description: r.description ?? null,
      updated_at: r.updated_at ?? null,
    })),
  }
}
