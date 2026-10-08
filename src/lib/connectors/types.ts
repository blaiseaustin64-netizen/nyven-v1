/**
 * Phase 8A — Connector & Capability foundation types.
 *
 * These types are the contract future NYVEN X / agents will consume.
 * No orchestration, no fake OAuth, no fake external data.
 */

/** Stable connector identifiers */
export type ConnectorId =
  | 'github'
  | 'gmail'
  | 'google_calendar'
  | 'watch'
  | 'sales'
  | 'website'
  | 'api'
  | 'mcp'

/** How the connector authenticates (when implemented) */
export type AuthMethod =
  | 'oauth2'
  | 'api_key'
  | 'none'
  | 'domain_allowlist'
  | 'coming_soon'

/**
 * Connection lifecycle states — UI must only show real states.
 * Never display "Connected" unless a real row / server probe confirms it.
 */
export type ConnectionState =
  | 'available' // connector exists, user can start connect when oauthReady
  | 'not_connected'
  | 'pending'
  | 'connected'
  | 'error'
  | 'expired'
  | 'revoked'
  | 'coming_soon'
  | 'unavailable'

/** Permission class for capability actions */
export type PermissionClass = 'read' | 'analyze' | 'write' | 'external'

/**
 * Capability IDs are namespaced as connector.action
 * e.g. github.repositories.read, gmail.messages.send
 */
export type CapabilityId = string

export interface CapabilityDefinition {
  id: CapabilityId
  connectorId: ConnectorId
  name: string
  description: string
  /** Permission classification — write/external typically require approval later */
  permission: PermissionClass
  /**
   * Whether future NYVEN X should treat this as needing explicit user approval.
   * Foundation only — no approval orchestration here.
   */
  requiresApproval: boolean
  /** Optional OAuth / API scopes this capability needs when implemented */
  scopes?: string[]
}

export interface ConnectorDefinition {
  id: ConnectorId
  provider: string
  name: string
  description: string
  /** Lucide icon name hint or brand key for UI mapping */
  iconKey: string
  authMethod: AuthMethod
  /**
   * True only when a real OAuth / connect path exists on the server.
   * Must stay false until secure token storage + OAuth is implemented.
   */
  oauthReady: boolean
  /** Default scopes requested when connect is eventually implemented */
  defaultScopes: string[]
  capabilities: CapabilityId[]
  /** Which future / current agents depend on this connector */
  requiredByAgents: string[]
  /** Human-readable permission summary for Settings / Connections UI */
  permissionSummary: string[]
  /** If false, connector is not offered in product UI beyond foundation docs */
  productVisible: boolean
}

/**
 * Resolved view of a connector for a specific user (or guest).
 * Built from registry + optional Supabase connection row + health.
 */
export interface ConnectorStatusView {
  connectorId: ConnectorId
  state: ConnectionState
  accountLabel?: string | null
  scopes?: string[] | null
  lastError?: string | null
  connectedAt?: string | null
  /** True when capability checks can succeed for read-class ops */
  isUsable: boolean
  /** Why not usable / connect disabled */
  reason?: string
}

/**
 * Answer set for “can we use this capability?” (foundation only).
 * NYVEN X will consume this later — no execution here.
 */
export interface CapabilityAvailability {
  capabilityId: CapabilityId
  exists: boolean
  connectorId: ConnectorId | null
  connected: boolean
  permitted: boolean
  available: boolean
  requiresApproval: boolean
  reason?: string
}

/** Agent → required capabilities mapping (foundation) */
export interface AgentCapabilityRequirement {
  agentId: string
  agentName: string
  requiredCapabilities: CapabilityId[]
  /** Soft requirements — agent can still draft without them */
  optionalCapabilities?: CapabilityId[]
}
