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
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    provider: String(row.provider),
    status: String(row.status || 'disconnected'),
    account_label: (row.account_label as string) ?? null,
    scopes: (row.scopes as string[]) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    connected_at: (row.connected_at as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}
