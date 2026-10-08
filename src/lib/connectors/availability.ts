/**
 * Phase 8A — Capability / connector availability helpers.
 *
 * Answers foundation questions only:
 * 1. Does this capability exist?
 * 2. Which connector provides it?
 * 3. Is the user connected?
 * 4. Does the user have permission? (scope / status based)
 * 5. Is the capability currently available?
 * 6. Does the action require approval?
 *
 * No orchestration or external API calls.
 */

import type {
  CapabilityAvailability,
  CapabilityId,
  ConnectionState,
  ConnectorId,
  ConnectorStatusView,
} from './types'
import {
  CAPABILITY_REGISTRY,
  CONNECTOR_REGISTRY,
  agentRequirements,
  getCapability,
  getConnector,
} from './registry'

/** Map a Supabase / local connection status string into ConnectionState */
export function normalizeConnectionState(
  status: string | null | undefined,
  oauthReady: boolean
): ConnectionState {
  if (!oauthReady) return 'coming_soon'
  switch (status) {
    case 'connected':
      return 'connected'
    case 'pending':
      return 'pending'
    case 'error':
      return 'error'
    case 'revoked':
      return 'revoked'
    case 'expired':
      return 'expired'
    case 'disconnected':
    case null:
    case undefined:
      return 'not_connected'
    default:
      return 'not_connected'
  }
}

/**
 * Build a status view for a connector given optional DB row fields.
 * Never marks connected unless status === 'connected'.
 */
export function buildConnectorStatusView(
  connectorId: ConnectorId,
  row?: {
    status?: string | null
    account_label?: string | null
    scopes?: string[] | null
    connected_at?: string | null
    metadata?: Record<string, unknown> | null
  } | null
): ConnectorStatusView {
  const def = getConnector(connectorId)
  if (!def) {
    return {
      connectorId,
      state: 'unavailable',
      isUsable: false,
      reason: 'Unknown connector',
    }
  }

  if (!def.oauthReady && def.authMethod !== 'domain_allowlist' && def.authMethod !== 'none') {
    return {
      connectorId,
      state: 'coming_soon',
      isUsable: false,
      reason: 'OAuth / connect path not implemented yet',
      accountLabel: row?.account_label,
      scopes: row?.scopes,
      connectedAt: row?.connected_at,
    }
  }

  // Watch uses configured targets, not OAuth — still foundation until targets UI exists
  if (connectorId === 'watch') {
    return {
      connectorId,
      state: 'coming_soon',
      isUsable: false,
      reason: 'Monitoring targets and runtime not implemented yet',
    }
  }

  if (connectorId === 'website') {
    // Domain allowlist is managed under Domains; treat as available product path
    return {
      connectorId,
      state: 'available',
      isUsable: true,
      reason: 'Configure domains under the agent Domains tab',
    }
  }

  const state = normalizeConnectionState(row?.status, def.oauthReady)
  const isUsable = state === 'connected'

  let reason: string | undefined
  if (state === 'coming_soon') reason = 'Connect flow not ready'
  else if (state === 'not_connected') reason = 'Not connected'
  else if (state === 'pending') reason = 'Connection in progress'
  else if (state === 'error') reason = 'Connection needs attention'
  else if (state === 'expired') reason = 'Connection expired — reconnect'
  else if (state === 'revoked') reason = 'Disconnected'

  return {
    connectorId,
    state,
    accountLabel: row?.account_label,
    scopes: row?.scopes,
    connectedAt: row?.connected_at,
    lastError: typeof row?.metadata?.lastError === 'string' ? row.metadata.lastError : null,
    isUsable,
    reason,
  }
}

/**
 * Resolve whether a capability can be used for a user given connection map.
 * connectionByProvider: provider id → status row (from connections_public).
 */
export function resolveCapabilityAvailability(
  capabilityId: CapabilityId,
  connectionByProvider: Record<string, { status?: string | null; scopes?: string[] | null } | null>
): CapabilityAvailability {
  const def = getCapability(capabilityId)
  if (!def) {
    return {
      capabilityId,
      exists: false,
      connectorId: null,
      connected: false,
      permitted: false,
      available: false,
      requiresApproval: false,
      reason: 'Capability does not exist',
    }
  }

  const connector = getConnector(def.connectorId)
  const row = connectionByProvider[def.connectorId] || connectionByProvider[connector?.provider || '']
  const view = buildConnectorStatusView(def.connectorId, row || null)

  const connected = view.state === 'connected'
  const scopeOk =
    !def.scopes ||
    def.scopes.length === 0 ||
    !row?.scopes ||
    def.scopes.every((s) => (row.scopes || []).some((have) => have.includes(s) || s.includes(have)))

  // Until OAuth is ready, nothing is available except pure foundation website paths
  const available =
    def.connectorId === 'website'
      ? true
      : connected && view.isUsable && (scopeOk || !row?.scopes)

  return {
    capabilityId,
    exists: true,
    connectorId: def.connectorId,
    connected,
    permitted: available,
    available,
    requiresApproval: def.requiresApproval,
    reason: available
      ? undefined
      : view.reason || (!connected ? 'Connector not connected' : 'Missing required scopes'),
  }
}

/**
 * For an agent: which required capabilities are missing / unavailable.
 * Foundation only — does not block agent creation.
 */
export function agentCapabilityGaps(
  agentId: string,
  connectionByProvider: Record<string, { status?: string | null; scopes?: string[] | null } | null>
): {
  agentId: string
  missingRequired: CapabilityAvailability[]
  missingOptional: CapabilityAvailability[]
  allRequiredAvailable: boolean
} {
  const req = agentRequirements(agentId)
  if (!req) {
    return {
      agentId,
      missingRequired: [],
      missingOptional: [],
      allRequiredAvailable: true,
    }
  }

  const missingRequired: CapabilityAvailability[] = []
  const missingOptional: CapabilityAvailability[] = []

  for (const cid of req.requiredCapabilities) {
    const av = resolveCapabilityAvailability(cid, connectionByProvider)
    if (!av.available) missingRequired.push(av)
  }
  for (const cid of req.optionalCapabilities || []) {
    const av = resolveCapabilityAvailability(cid, connectionByProvider)
    if (!av.available) missingOptional.push(av)
  }

  return {
    agentId,
    missingRequired,
    missingOptional,
    allRequiredAvailable: missingRequired.length === 0,
  }
}

/** UI label for connection state — never invent "Connected" */
export function connectionStateLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'pending':
      return 'Connecting…'
    case 'not_connected':
    case 'available':
      return 'Connect'
    case 'coming_soon':
      return 'Coming soon'
    case 'error':
    case 'expired':
      return 'Connection needs attention'
    case 'revoked':
      return 'Disconnected'
    case 'unavailable':
      return 'Unavailable'
    default:
      return 'Not connected'
  }
}

export function listCapabilities(): CapabilityId[] {
  return Object.keys(CAPABILITY_REGISTRY)
}

export function connectorExists(id: string): id is ConnectorId {
  return id in CONNECTOR_REGISTRY
}
