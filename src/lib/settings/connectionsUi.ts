/**
 * Connections catalog + status for Settings UI.
 * GitHub status comes from Cloudflare connector APIs (session cookie).
 */

import { fetchGitHubStatus, type ConnectionPublic } from '../connectors/githubApi'

export type ConnectionPublicRow = ConnectionPublic & {
  id?: string
  user_id?: string
  provider: string
  status: string
  account_label?: string | null
  connected_at?: string | null
  created_at?: string
  updated_at?: string
}

export type CatalogItem = {
  id: string
  name: string
  description: string
  oauthReady: boolean
  iconKey: string
  permissionSummary: string[]
}

export const CONNECTIONS_CATALOG: CatalogItem[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories and issues for NYVEN Code. Tokens never leave the server.',
    oauthReady: true,
    iconKey: 'github',
    permissionSummary: [
      'Read repositories, files, issues, and pull requests you grant',
      'Create or update issues/PRs only with explicit approval',
      'Tokens never leave the server',
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Email for NYVEN Inbox. Shared deployment tokens disabled by default.',
    oauthReady: false,
    iconKey: 'mail',
    permissionSummary: [
      'Per-user OAuth not enabled yet',
      'Shared Gmail tokens are off unless explicitly enabled server-side',
    ],
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Not implemented yet.',
    oauthReady: false,
    iconKey: 'calendar',
    permissionSummary: ['Not connected'],
  },
  {
    id: 'watch',
    name: 'Website monitoring',
    description: 'Not implemented yet.',
    oauthReady: false,
    iconKey: 'activity',
    permissionSummary: ['Not connected'],
  },
  {
    id: 'sales',
    name: 'CRM / Sheets',
    description: 'Not implemented yet.',
    oauthReady: false,
    iconKey: 'table',
    permissionSummary: ['Not connected'],
  },
]

export async function listConnections(userId: string | null): Promise<ConnectionPublicRow[]> {
  if (!userId) return []
  try {
    const status = await fetchGitHubStatus()
    if (status.connected && status.connection) {
      return [
        {
          provider: 'github',
          status: 'connected',
          account_label: status.connection.account_label || null,
          connected_at: status.connection.connected_at || null,
          id: status.connection.id,
        },
      ]
    }
  } catch {
    /* empty */
  }
  return []
}

export function connectionsByProvider(
  rows: ConnectionPublicRow[]
): Record<string, ConnectionPublicRow | undefined> {
  const out: Record<string, ConnectionPublicRow | undefined> = {}
  for (const r of rows) {
    out[r.provider] = r
  }
  return out
}
