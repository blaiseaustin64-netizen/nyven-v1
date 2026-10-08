/**
 * Settings-facing connection helpers.
 * Backed by Phase 8A connector registry — no fake Connected states.
 */

import { getSupabase } from '../supabase/client'
import type { ConnectionPublicRow } from '../supabase/types'
import {
  listProductConnectors,
  buildConnectorStatusView,
  connectionStateLabel,
  type ConnectorDefinition,
  type ConnectorStatusView,
  type ConnectorId,
} from '../connectors'

export type IntegrationDef = {
  id: string
  name: string
  description: string
  oauthReady: boolean
  iconKey: string
  permissionSummary: string[]
}

/** Catalog from connector registry (product-visible only) */
export function getIntegrations(): IntegrationDef[] {
  return listProductConnectors().map((c: ConnectorDefinition) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    oauthReady: c.oauthReady,
    iconKey: c.iconKey,
    permissionSummary: c.permissionSummary,
  }))
}

/** Prefer getIntegrations() — kept for existing imports */
export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Code context for future NYVEN Code agents. Repositories, issues, PRs.',
    oauthReady: false,
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
    description: 'Email for NYVEN Inbox. Read, search, draft; send only with approval.',
    oauthReady: false,
    iconKey: 'mail',
    permissionSummary: [
      'Read email metadata and bodies required for your request',
      'Search your mailbox',
      'Create draft replies (not sent until you approve)',
      'Never send, delete, or modify mail without your confirmation',
    ],
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Schedule awareness for future NYVEN Scheduler agents.',
    oauthReady: false,
    iconKey: 'calendar',
    permissionSummary: [
      'Read calendars and events you grant',
      'Check availability',
      'Create/update/delete events only with approval',
    ],
  },
  {
    id: 'watch',
    name: 'Website monitoring',
    description: 'HTTP health, status, latency, and uptime for future NYVEN Watch.',
    oauthReady: false,
    iconKey: 'activity',
    permissionSummary: [
      'Probe user-configured URLs for health and latency',
      'No third-party OAuth required',
      'Targets must be explicitly configured by the user',
    ],
  },
  {
    id: 'sales',
    name: 'CRM / Sheets',
    description: 'CRM and spreadsheet access for future NYVEN Sales. Not implemented.',
    oauthReady: false,
    iconKey: 'table',
    permissionSummary: [
      'Read and search records you connect',
      'Create/update only with approval',
      'Provider-specific OAuth (Sheets, Airtable, CRM) not wired yet',
    ],
  },
]

export async function listConnections(userId: string | null): Promise<ConnectionPublicRow[]> {
  if (!userId) return []
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.from('connections_public').select('*').eq('user_id', userId)
  if (error) {
    const { data: d2 } = await sb
      .from('connections')
      .select(
        'id, user_id, provider, status, account_label, scopes, metadata, connected_at, created_at, updated_at'
      )
      .eq('user_id', userId)
    return (d2 || []) as ConnectionPublicRow[]
  }
  return (data || []) as ConnectionPublicRow[]
}

export function connectionsByProvider(
  rows: ConnectionPublicRow[]
): Record<string, ConnectionPublicRow> {
  const map: Record<string, ConnectionPublicRow> = {}
  for (const r of rows) {
    map[r.provider] = r
  }
  return map
}

export function statusViewForConnector(
  connectorId: ConnectorId,
  rows: ConnectionPublicRow[]
): ConnectorStatusView {
  const by = connectionsByProvider(rows)
  return buildConnectorStatusView(connectorId, by[connectorId] || null)
}

export function labelForConnector(
  connectorId: ConnectorId,
  rows: ConnectionPublicRow[]
): string {
  return connectionStateLabel(statusViewForConnector(connectorId, rows).state)
}
