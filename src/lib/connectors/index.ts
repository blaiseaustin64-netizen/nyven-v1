/**
 * Phase 8A — public connector / capability API.
 */

export type {
  AuthMethod,
  CapabilityAvailability,
  CapabilityDefinition,
  CapabilityId,
  ConnectionState,
  ConnectorDefinition,
  ConnectorId,
  ConnectorStatusView,
  PermissionClass,
  AgentCapabilityRequirement,
} from './types'

export {
  CAPABILITY_REGISTRY,
  CONNECTOR_REGISTRY,
  PRODUCT_CONNECTORS,
  AGENT_CAPABILITY_REQUIREMENTS,
  getConnector,
  getCapability,
  listProductConnectors,
  capabilitiesForConnector,
  agentRequirements,
  connectorsRequiredByAgent,
} from './registry'

export {
  normalizeConnectionState,
  buildConnectorStatusView,
  resolveCapabilityAvailability,
  agentCapabilityGaps,
  connectionStateLabel,
  listCapabilities,
  connectorExists,
} from './availability'

export {
  PERMISSION_LABELS,
  isReadClass,
  isWriteClass,
  defaultRequiresApproval,
  permissionClassFromAction,
} from './permissions'
