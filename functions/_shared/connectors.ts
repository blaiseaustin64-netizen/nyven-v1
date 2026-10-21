/**
 * Phase 8A — server-side connector constants.
 * Mirrors client registry IDs. Tokens never returned to clients.
 */

export type ServerConnectorId =
  | 'github'
  | 'gmail'
  | 'google_calendar'
  | 'watch'
  | 'sales'
  | 'website'

/** Providers that may eventually store token_ciphertext in public.connections */
export const OAUTH_PROVIDERS: ServerConnectorId[] = [
  'github',
  'gmail',
  'google_calendar',
  'sales',
]

/**
 * Safe public fields only. Never include token_ciphertext or secrets.
 */
export type ConnectionPublicDTO = {
  id: string
  user_id: string
  provider: string
  status: string
  account_label: string | null
  scopes: string[] | null
  metadata: Record<string, unknown>
  connected_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Strip any accidental token material before responding to clients.
 */
export function toPublicConnection(row: Record<string, unknown>): ConnectionPublicDTO {
  let scopes: string[] | null = null
  const rawScopes = row.scopes
  if (Array.isArray(rawScopes)) scopes = rawScopes.map(String)
  else if (typeof rawScopes === 'string' && rawScopes.trim()) {
    scopes = rawScopes.split(/[\s,]+/).filter(Boolean)
  }

  let metadata: Record<string, unknown> = {}
  if (row.metadata && typeof row.metadata === 'object') {
    metadata = row.metadata as Record<string, unknown>
  } else if (typeof row.metadata_json === 'string' && row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>
    } catch {
      metadata = {}
    }
  }

  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    provider: String(row.provider ?? ''),
    status: String(row.status || 'disconnected'),
    account_label: (row.account_label as string) ?? null,
    scopes,
    metadata,
    connected_at: (row.connected_at as string) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}
