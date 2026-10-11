/**
 * Pure NYVEN Code workspace logic: connection state derivation, repository filtering,
 * path breadcrumbs, and user-facing error copy. No React, no network — unit tested.
 */

export type ConnectionStatusResponse = {
  success?: boolean
  configured?: boolean
  connected?: boolean
  connection?: {
    account_label?: string | null
    connected_at?: string | null
    scopes?: string[] | null
  } | null
  code?: string
  error?: string
}

export type ConnectionView =
  | { kind: 'loading' }
  | { kind: 'auth_unavailable' }
  | { kind: 'signed_out' }
  | { kind: 'unconfigured'; message: string }
  | { kind: 'disconnected' }
  | { kind: 'connected'; account: string; connectedAt: string | null; scopes: string[] }
  | { kind: 'unavailable'; message: string }

export const GENERIC_STATUS_ERROR = 'GitHub connection status is unavailable right now. Try again shortly.'

export function deriveConnectionView(input: {
  authLoading: boolean
  supabaseConfigured: boolean
  signedIn: boolean
  status: ConnectionStatusResponse | null
  statusError?: string | null
  /** When true, GitHub may connect without a full NYVEN account (pre-account phase). */
  allowPreAccountConnectors?: boolean
}): ConnectionView {
  if (input.authLoading) return { kind: 'loading' }
  // Pre-account phase: do not block GitHub on missing NYVEN login
  const pre = input.allowPreAccountConnectors !== false
  if (!pre) {
    if (!input.supabaseConfigured) return { kind: 'auth_unavailable' }
    if (!input.signedIn) return { kind: 'signed_out' }
  }
  if (input.statusError) return { kind: 'unavailable', message: input.statusError }
  if (!input.status) return { kind: 'loading' }
  if (input.status.success === false) {
    if (input.status.code === 'CONFIG' || input.status.configured === false) {
      return {
        kind: 'unconfigured',
        message: 'GitHub is not configured on the server yet. The site administrator must finish GitHub setup.',
      }
    }
    return { kind: 'unavailable', message: input.status.error || GENERIC_STATUS_ERROR }
  }
  if (input.status.connected) {
    const conn = input.status.connection || {}
    return {
      kind: 'connected',
      account: conn.account_label || 'GitHub account',
      connectedAt: conn.connected_at ?? null,
      scopes: conn.scopes ?? [],
    }
  }
  return { kind: 'disconnected' }
}

const CODE_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Sign in to use NYVEN Code.',
  AUTH_INVALID: 'Your session expired. Sign in again.',
  NOT_CONNECTED: 'GitHub is not connected. Connect GitHub to browse repositories.',
  GITHUB_AUTH: 'GitHub no longer accepts the stored authorization. Reconnect GitHub.',
  GITHUB_FORBIDDEN: 'Your GitHub account does not have access to this resource, or the app lacks that permission.',
  GITHUB_NOT_FOUND: 'Not found, or your GitHub account cannot access it.',
  GITHUB_RATE_LIMIT: 'GitHub rate limit reached. Try again later.',
  GITHUB_UNAVAILABLE: 'GitHub could not be reached. Try again shortly.',
  DB_READ: 'NYVEN could not read your connection state. Try again shortly.',
  CONFIG: 'GitHub is not configured on the server yet.',
  DECRYPT: 'Stored GitHub credentials are unavailable. Reconnect GitHub.',
  BAD_REQUEST: 'The request was not valid.',
  NETWORK: 'Could not reach NYVEN. Check your connection and try again.',
}

export function messageForCode(code: string | undefined, fallback?: string): string {
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  return fallback || 'Something went wrong. Try again.'
}

/** Whether a repo-level error means the user must reconnect GitHub (vs. a transient or per-resource problem). */
export function requiresReconnect(code: string | undefined): boolean {
  return code === 'NOT_CONNECTED' || code === 'GITHUB_AUTH' || code === 'DECRYPT'
}

/** Case-insensitive filter over repository name and description. Empty query returns everything. */
export function filterRepos<T extends { full_name: string; description: string | null }>(
  repos: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return repos
  return repos.filter(
    (r) => r.full_name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  )
}

export type Crumb = { name: string; path: string }

/** Breadcrumbs for a repository-relative path. The first crumb is the repository root. */
export function splitPath(path: string): Crumb[] {
  const segments = path.split('/').filter(Boolean)
  const crumbs: Crumb[] = [{ name: '/', path: '' }]
  segments.forEach((name, i) => {
    crumbs.push({ name, path: segments.slice(0, i + 1).join('/') })
  })
  return crumbs
}

export function parentPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.slice(0, -1).join('/')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Build the query string used by the repository browser. Empty values are dropped. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number] => e[1] !== undefined && e[1] !== null && e[1] !== ''
  )
  return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

const CALLBACK_REASON_MESSAGES: Record<string, string> = {
  denied: 'GitHub authorization was cancelled. Nothing was connected.',
  oauth_error: 'GitHub reported an error during authorization. Nothing was connected.',
  missing_params: 'GitHub did not return a complete authorization response. Try connecting again.',
  missing_session: 'Your GitHub authorization session expired. Start the connection again.',
  invalid_session: 'Your GitHub authorization session could not be verified. Start the connection again.',
  state_mismatch: 'The GitHub authorization could not be verified. Start the connection again.',
  token_exchange: 'GitHub did not issue a token for this authorization. Try again.',
  github_user: 'NYVEN could not read your GitHub profile. Try again.',
  save_failed: 'GitHub connected, but NYVEN could not save the connection. Try again.',
  bad_redirect: 'The return destination was not allowed. Open NYVEN Code again.',
  config: 'GitHub is not configured on the server yet.',
}

/** User-facing copy for the ?github=error&reason=… redirect from the OAuth callback. */
export function callbackReasonMessage(reason: string | null | undefined): string {
  if (!reason) return 'GitHub connection did not complete. Try again.'
  return CALLBACK_REASON_MESSAGES[reason] || 'GitHub connection did not complete. Try again.'
}
