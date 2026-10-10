/**
 * Phase 8A — Connector catalog + capability registry.
 *
 * Adding a future connector should mean: register definition + capabilities here.
 * Do not claim Connected / OAuth ready unless a real path exists.
 */

import type {
  CapabilityDefinition,
  CapabilityId,
  ConnectorDefinition,
  ConnectorId,
  AgentCapabilityRequirement,
} from './types'
import { defaultRequiresApproval } from './permissions'

// ─── Capability definitions ─────────────────────────────────

function cap(
  id: CapabilityId,
  connectorId: ConnectorId,
  name: string,
  description: string,
  permission: CapabilityDefinition['permission'],
  scopes?: string[]
): CapabilityDefinition {
  return {
    id,
    connectorId,
    name,
    description,
    permission,
    requiresApproval: defaultRequiresApproval(permission),
    scopes,
  }
}

/** All known capabilities. Keys are CapabilityId. */
export const CAPABILITY_REGISTRY: Record<CapabilityId, CapabilityDefinition> = {
  // GitHub — future NYVEN Code
  'github.repositories.read': cap(
    'github.repositories.read',
    'github',
    'Read repositories',
    'List and inspect repositories the user can access.',
    'read',
    ['repo']
  ),
  'github.files.read': cap(
    'github.files.read',
    'github',
    'Read files',
    'Read file contents from connected repositories.',
    'read',
    ['repo']
  ),
  'github.issues.read': cap(
    'github.issues.read',
    'github',
    'Read issues',
    'List and read issues.',
    'read',
    ['repo']
  ),
  'github.pull_requests.read': cap(
    'github.pull_requests.read',
    'github',
    'Read pull requests',
    'List and read pull requests.',
    'read',
    ['repo']
  ),
  'github.commits.read': cap(
    'github.commits.read',
    'github',
    'Read commits',
    'Inspect commit history and diffs.',
    'read',
    ['repo']
  ),
  'github.issues.write': cap(
    'github.issues.write',
    'github',
    'Write issues',
    'Create or update issues.',
    'write',
    ['repo']
  ),
  'github.pull_requests.write': cap(
    'github.pull_requests.write',
    'github',
    'Write pull requests',
    'Create or update pull requests.',
    'write',
    ['repo']
  ),

  // Gmail — future NYVEN Inbox
  'gmail.messages.read': cap(
    'gmail.messages.read',
    'gmail',
    'Read messages',
    'Read email message content needed for a request.',
    'read',
    ['gmail.readonly']
  ),
  'gmail.threads.read': cap(
    'gmail.threads.read',
    'gmail',
    'Read threads',
    'Read conversation threads.',
    'read',
    ['gmail.readonly']
  ),
  'gmail.search': cap(
    'gmail.search',
    'gmail',
    'Search mail',
    'Search the mailbox with minimal retrieval.',
    'read',
    ['gmail.readonly']
  ),
  'gmail.drafts.create': cap(
    'gmail.drafts.create',
    'gmail',
    'Create drafts',
    'Create draft replies (not sent until approved).',
    'write',
    ['gmail.compose']
  ),
  'gmail.messages.send': cap(
    'gmail.messages.send',
    'gmail',
    'Send messages',
    'Send email. Requires explicit user approval.',
    'external',
    ['gmail.send']
  ),
  'gmail.messages.reply': cap(
    'gmail.messages.reply',
    'gmail',
    'Reply',
    'Reply to a message. Requires explicit user approval.',
    'external',
    ['gmail.send']
  ),
  'gmail.messages.forward': cap(
    'gmail.messages.forward',
    'gmail',
    'Forward',
    'Forward a message. Requires explicit user approval.',
    'external',
    ['gmail.send']
  ),
  'gmail.messages.archive': cap(
    'gmail.messages.archive',
    'gmail',
    'Archive',
    'Archive or move messages. Requires explicit approval.',
    'write',
    ['gmail.modify']
  ),
  'gmail.labels.manage': cap(
    'gmail.labels.manage',
    'gmail',
    'Manage labels',
    'Apply or remove labels. Requires explicit approval.',
    'write',
    ['gmail.modify']
  ),

  // Google Calendar — future NYVEN Scheduler
  'calendar.calendars.read': cap(
    'calendar.calendars.read',
    'google_calendar',
    'Read calendars',
    'List calendars the user can access.',
    'read',
    ['calendar.readonly']
  ),
  'calendar.events.read': cap(
    'calendar.events.read',
    'google_calendar',
    'Read events',
    'Read calendar events.',
    'read',
    ['calendar.readonly']
  ),
  'calendar.availability.read': cap(
    'calendar.availability.read',
    'google_calendar',
    'Read availability',
    'Check free/busy availability.',
    'read',
    ['calendar.readonly']
  ),
  'calendar.events.create': cap(
    'calendar.events.create',
    'google_calendar',
    'Create events',
    'Create calendar events. Requires approval when external.',
    'write',
    ['calendar.events']
  ),
  'calendar.events.update': cap(
    'calendar.events.update',
    'google_calendar',
    'Update events',
    'Update existing events. Requires approval.',
    'write',
    ['calendar.events']
  ),
  'calendar.events.delete': cap(
    'calendar.events.delete',
    'google_calendar',
    'Delete events',
    'Delete events. Requires approval.',
    'write',
    ['calendar.events']
  ),

  // Website / HTTP monitoring — future NYVEN Watch
  'watch.health_check': cap(
    'watch.health_check',
    'watch',
    'Health check',
    'Probe an endpoint for health status.',
    'read'
  ),
  'watch.status_check': cap(
    'watch.status_check',
    'watch',
    'Status check',
    'Check HTTP status of monitored targets.',
    'read'
  ),
  'watch.response_time': cap(
    'watch.response_time',
    'watch',
    'Response time',
    'Measure response latency for targets.',
    'analyze'
  ),
  'watch.uptime': cap(
    'watch.uptime',
    'watch',
    'Uptime',
    'Report uptime statistics for monitored targets.',
    'analyze'
  ),

  // CRM / Sheets / Airtable — future NYVEN Sales (foundation only)
  'sales.records.read': cap(
    'sales.records.read',
    'sales',
    'Read records',
    'Read CRM or sheet records the user has access to.',
    'read'
  ),
  'sales.records.search': cap(
    'sales.records.search',
    'sales',
    'Search records',
    'Search CRM / sheet data.',
    'read'
  ),
  'sales.records.create': cap(
    'sales.records.create',
    'sales',
    'Create records',
    'Create CRM records. Requires approval.',
    'write'
  ),
  'sales.records.update': cap(
    'sales.records.update',
    'sales',
    'Update records',
    'Update CRM records. Requires approval.',
    'write'
  ),

  // Website embed (existing support agent)
  'website.embed.serve': cap(
    'website.embed.serve',
    'website',
    'Serve widget',
    'Serve public chat UI on allowlisted domains.',
    'read'
  ),
  'website.messages.receive': cap(
    'website.messages.receive',
    'website',
    'Receive visitor messages',
    'Receive visitor messages through NYVEN backend.',
    'read'
  ),
}

// ─── Connector catalog ──────────────────────────────────────

export const CONNECTOR_REGISTRY: Record<ConnectorId, ConnectorDefinition> = {
  github: {
    id: 'github',
    provider: 'github',
    name: 'GitHub',
    description: 'Code context for future NYVEN Code agents. Repositories, issues, PRs.',
    iconKey: 'github',
    authMethod: 'oauth2',
    oauthReady: true,
    defaultScopes: ['repo', 'read:user'],
    capabilities: [
      'github.repositories.read',
      'github.files.read',
      'github.issues.read',
      'github.pull_requests.read',
      'github.commits.read',
      'github.issues.write',
      'github.pull_requests.write',
    ],
    requiredByAgents: ['nyven_code'],
    permissionSummary: [
      'Read repositories, files, issues, and pull requests you grant',
      'Create or update issues/PRs only with explicit approval',
      'Tokens never leave the server',
    ],
    productVisible: true,
  },
  gmail: {
    id: 'gmail',
    provider: 'gmail',
    name: 'Gmail',
    description: 'Email for NYVEN Inbox. Read, search, draft; send only with approval.',
    iconKey: 'mail',
    authMethod: 'oauth2',
    // Server may probe deployment-level tokens; per-user OAuth is not ready.
    oauthReady: false,
    defaultScopes: ['gmail.readonly', 'gmail.compose', 'gmail.send', 'gmail.modify'],
    capabilities: [
      'gmail.messages.read',
      'gmail.threads.read',
      'gmail.search',
      'gmail.drafts.create',
      'gmail.messages.send',
      'gmail.messages.reply',
      'gmail.messages.forward',
      'gmail.messages.archive',
      'gmail.labels.manage',
    ],
    requiredByAgents: ['inbox', 'nyven_inbox'],
    permissionSummary: [
      'Read email metadata and bodies required for your request',
      'Search your mailbox',
      'Create draft replies (not sent until you approve)',
      'Never send, delete, or modify mail without your confirmation',
    ],
    productVisible: true,
  },
  google_calendar: {
    id: 'google_calendar',
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Schedule awareness for future NYVEN Scheduler agents.',
    iconKey: 'calendar',
    authMethod: 'oauth2',
    oauthReady: false,
    defaultScopes: ['calendar.readonly', 'calendar.events'],
    capabilities: [
      'calendar.calendars.read',
      'calendar.events.read',
      'calendar.availability.read',
      'calendar.events.create',
      'calendar.events.update',
      'calendar.events.delete',
    ],
    requiredByAgents: ['nyven_scheduler'],
    permissionSummary: [
      'Read calendars and events you grant',
      'Check availability',
      'Create/update/delete events only with approval',
    ],
    productVisible: true,
  },
  watch: {
    id: 'watch',
    provider: 'watch',
    name: 'Website monitoring',
    description: 'HTTP health, status, latency, and uptime for future NYVEN Watch.',
    iconKey: 'activity',
    authMethod: 'none',
    oauthReady: false,
    defaultScopes: [],
    capabilities: [
      'watch.health_check',
      'watch.status_check',
      'watch.response_time',
      'watch.uptime',
    ],
    requiredByAgents: ['nyven_watch'],
    permissionSummary: [
      'Probe user-configured URLs for health and latency',
      'No third-party OAuth required',
      'Targets must be explicitly configured by the user',
    ],
    productVisible: true,
  },
  sales: {
    id: 'sales',
    provider: 'sales',
    name: 'CRM / Sheets',
    description: 'CRM and spreadsheet access for future NYVEN Sales. Not implemented.',
    iconKey: 'table',
    authMethod: 'coming_soon',
    oauthReady: false,
    defaultScopes: [],
    capabilities: [
      'sales.records.read',
      'sales.records.search',
      'sales.records.create',
      'sales.records.update',
    ],
    requiredByAgents: ['nyven_sales'],
    permissionSummary: [
      'Read and search records you connect',
      'Create/update only with approval',
      'Provider-specific OAuth (Sheets, Airtable, CRM) not wired yet',
    ],
    productVisible: true,
  },
  website: {
    id: 'website',
    provider: 'website',
    name: 'Website',
    description: 'Embed the agent on approved domains via the NYVEN widget.',
    iconKey: 'globe',
    authMethod: 'domain_allowlist',
    oauthReady: true, // domain allowlist path already exists for support agents
    defaultScopes: [],
    capabilities: ['website.embed.serve', 'website.messages.receive'],
    requiredByAgents: ['support'],
    permissionSummary: [
      'Serve public chat UI on allowlisted domains',
      'Receive visitor messages through NYVEN backend',
    ],
    productVisible: true,
  },
  api: {
    id: 'api',
    provider: 'api',
    name: 'Custom API',
    description: 'Custom HTTP APIs (foundation only).',
    iconKey: 'plug',
    authMethod: 'api_key',
    oauthReady: false,
    defaultScopes: [],
    capabilities: [],
    requiredByAgents: [],
    permissionSummary: ['Call user-configured endpoints when implemented'],
    productVisible: false,
  },
  mcp: {
    id: 'mcp',
    provider: 'mcp',
    name: 'MCP',
    description: 'Model Context Protocol tools (foundation only).',
    iconKey: 'boxes',
    authMethod: 'coming_soon',
    oauthReady: false,
    defaultScopes: [],
    capabilities: [],
    requiredByAgents: [],
    permissionSummary: ['Invoke approved MCP tools when implemented'],
    productVisible: false,
  },
}

/** Ordered list for Settings / product UI */
export const PRODUCT_CONNECTORS: ConnectorId[] = [
  'github',
  'gmail',
  'google_calendar',
  'watch',
  'sales',
]

// ─── Agent ↔ capability requirements ────────────────────────

export const AGENT_CAPABILITY_REQUIREMENTS: AgentCapabilityRequirement[] = [
  {
    agentId: 'support',
    agentName: 'Nyven Support',
    requiredCapabilities: ['website.embed.serve', 'website.messages.receive'],
  },
  {
    agentId: 'inbox',
    agentName: 'Nyven Inbox',
    requiredCapabilities: [
      'gmail.messages.read',
      'gmail.threads.read',
      'gmail.search',
    ],
    optionalCapabilities: [
      'gmail.drafts.create',
      'gmail.messages.send',
      'gmail.messages.reply',
      'gmail.messages.archive',
      'gmail.labels.manage',
    ],
  },
  {
    agentId: 'nyven_code',
    agentName: 'NYVEN Code',
    requiredCapabilities: [
      'github.repositories.read',
      'github.files.read',
      'github.issues.read',
      'github.pull_requests.read',
      'github.commits.read',
    ],
    optionalCapabilities: ['github.issues.write', 'github.pull_requests.write'],
  },
  {
    agentId: 'nyven_scheduler',
    agentName: 'NYVEN Scheduler',
    requiredCapabilities: [
      'calendar.calendars.read',
      'calendar.events.read',
      'calendar.availability.read',
    ],
    optionalCapabilities: [
      'calendar.events.create',
      'calendar.events.update',
      'calendar.events.delete',
    ],
  },
  {
    agentId: 'nyven_watch',
    agentName: 'NYVEN Watch',
    requiredCapabilities: [
      'watch.health_check',
      'watch.status_check',
      'watch.response_time',
      'watch.uptime',
    ],
  },
  {
    agentId: 'nyven_sales',
    agentName: 'NYVEN Sales',
    requiredCapabilities: ['sales.records.read', 'sales.records.search'],
    optionalCapabilities: ['sales.records.create', 'sales.records.update'],
  },
]

// ─── Lookup helpers ─────────────────────────────────────────

export function getConnector(id: ConnectorId): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY[id]
}

export function getCapability(id: CapabilityId): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY[id]
}

export function listProductConnectors(): ConnectorDefinition[] {
  return PRODUCT_CONNECTORS.map((id) => CONNECTOR_REGISTRY[id]).filter(Boolean)
}

export function capabilitiesForConnector(id: ConnectorId): CapabilityDefinition[] {
  const def = CONNECTOR_REGISTRY[id]
  if (!def) return []
  return def.capabilities
    .map((cid) => CAPABILITY_REGISTRY[cid])
    .filter(Boolean)
}

export function agentRequirements(agentId: string): AgentCapabilityRequirement | undefined {
  return AGENT_CAPABILITY_REQUIREMENTS.find((a) => a.agentId === agentId)
}

export function connectorsRequiredByAgent(agentId: string): ConnectorId[] {
  const req = agentRequirements(agentId)
  if (!req) return []
  const ids = new Set<ConnectorId>()
  for (const cid of [
    ...req.requiredCapabilities,
    ...(req.optionalCapabilities || []),
  ]) {
    const cap = CAPABILITY_REGISTRY[cid]
    if (cap) ids.add(cap.connectorId)
  }
  return [...ids]
}
