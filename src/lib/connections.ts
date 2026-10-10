/**
 * Reusable Connections architecture.
 * Agent → Connections → (Website | Gmail | API | MCP | VEXDYN)
 * Credentials never stored in frontend.
 */

import { getLocalOwnerId } from './agentStore'

export type ConnectionType = 'website' | 'gmail' | 'github' | 'api' | 'mcp' | 'vexdyn'

export type ConnectionStatus =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'error'
  | 'revoked'

export interface ConnectionDefinition {
  type: ConnectionType
  label: string
  description: string
  permissionSummary: string[]
  requiredForAgentTypes: Array<'support' | 'inbox' | 'code'>
}

export const CONNECTION_CATALOG: ConnectionDefinition[] = [
  {
    type: 'website',
    label: 'Website',
    description: 'Embed the agent on approved domains via the NYVEN widget.',
    permissionSummary: [
      'Serve public chat UI on allowlisted domains',
      'Receive visitor messages through NYVEN backend',
    ],
    requiredForAgentTypes: ['support'],
  },
  {
    type: 'gmail',
    label: 'Gmail',
    description:
      'Read and organize mail; draft replies. Sending requires explicit approval.',
    permissionSummary: [
      'Read email metadata and bodies required for your request',
      'Search your mailbox',
      'Create draft replies (not sent until you approve)',
      'Never send, delete, or modify mail without your confirmation',
    ],
    requiredForAgentTypes: ['inbox'],
  },
  {
    type: 'github',
    label: 'GitHub',
    description:
      'Access your repositories for NYVEN Code. Read-only listing in this phase; writes require future approval.',
    permissionSummary: [
      'List repositories you can access',
      'Read repository metadata (name, default branch, visibility)',
      'Tokens stay on the NYVEN server — never in the browser',
    ],
    requiredForAgentTypes: ['code'],
  },
  {
    type: 'api',
    label: 'API',
    description: 'Custom HTTP APIs (foundation only).',
    permissionSummary: ['Call user-configured endpoints'],
    requiredForAgentTypes: [],
  },
  {
    type: 'mcp',
    label: 'MCP',
    description: 'Model Context Protocol tools (foundation only).',
    permissionSummary: ['Invoke approved MCP tools'],
    requiredForAgentTypes: [],
  },
  {
    type: 'vexdyn',
    label: 'VEXDYN services',
    description: 'Future VEXDYN product connections (foundation only).',
    permissionSummary: ['Access enabled VEXDYN services'],
    requiredForAgentTypes: [],
  },
]

export interface AgentConnection {
  id: string
  agentId: string
  ownerId: string
  type: ConnectionType
  status: ConnectionStatus
  accountLabel?: string
  scopes: string[]
  lastError?: string
  connectedAt?: string
  updatedAt: string
  createdAt: string
}

const STORAGE_KEY = 'nyven_agent_connections_v1'

function genId() {
  return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function readAll(): AgentConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as AgentConnection[]) : []
  } catch {
    return []
  }
}

function writeAll(items: AgentConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function listConnections(agentId: string): AgentConnection[] {
  const ownerId = getLocalOwnerId()
  return readAll().filter((c) => c.agentId === agentId && c.ownerId === ownerId)
}

export function getConnection(
  agentId: string,
  type: ConnectionType
): AgentConnection | null {
  return listConnections(agentId).find((c) => c.type === type) ?? null
}

export function upsertConnection(
  agentId: string,
  type: ConnectionType,
  patch: Partial<
    Pick<
      AgentConnection,
      'status' | 'accountLabel' | 'scopes' | 'lastError' | 'connectedAt'
    >
  >
): AgentConnection {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const idx = all.findIndex(
    (c) => c.agentId === agentId && c.type === type && c.ownerId === ownerId
  )
  const now = new Date().toISOString()
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch, updatedAt: now }
    writeAll(all)
    return all[idx]
  }
  const created: AgentConnection = {
    id: genId(),
    agentId,
    ownerId,
    type,
    status: patch.status || 'disconnected',
    accountLabel: patch.accountLabel,
    scopes: patch.scopes || [],
    lastError: patch.lastError,
    connectedAt: patch.connectedAt,
    createdAt: now,
    updatedAt: now,
  }
  all.push(created)
  writeAll(all)
  return created
}

export function disconnectConnection(agentId: string, type: ConnectionType): void {
  upsertConnection(agentId, type, {
    status: 'revoked',
    accountLabel: undefined,
    scopes: [],
    connectedAt: undefined,
    lastError: undefined,
  })
}

export function beginGmailConnect(agentId: string): AgentConnection {
  return upsertConnection(agentId, 'gmail', {
    status: 'pending',
    scopes: ['gmail.readonly', 'gmail.compose (drafts until approved)'],
  })
}
