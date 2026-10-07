import type { AgentDomain, AgentDomainInput, DomainStatus } from './domainTypes'
import { getLocalOwnerId } from './agentStore'

const STORAGE_KEY = 'nyven_agent_domains_v1'

function generateId(): string {
  return `dom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Normalize hostname for comparison */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/\/.*$/, '')
  d = d.replace(/:\d+$/, '')
  d = d.replace(/\.$/, '')
  return d
}

export function isValidDomainFormat(domain: string): boolean {
  const d = normalizeDomain(domain)
  if (!d || d.length > 253) return false
  // Allow localhost for dev
  if (d === 'localhost' || d.endsWith('.localhost')) return true
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ||
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(d)
}

function readAll(): AgentDomain[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as AgentDomain[]) : []
  } catch {
    return []
  }
}

function writeAll(items: AgentDomain[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function listDomains(agentId: string): AgentDomain[] {
  const ownerId = getLocalOwnerId()
  return readAll()
    .filter((d) => d.agentId === agentId && d.ownerId === ownerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** Domains that should be published for server-side allowlist */
export function listActiveAllowlist(agentId: string): string[] {
  return listDomains(agentId)
    .filter(
      (d) =>
        d.enabled &&
        (d.status === 'verified' || d.status === 'pending')
    )
    .map((d) => d.domain)
}

export function addDomain(input: AgentDomainInput): AgentDomain {
  const ownerId = getLocalOwnerId()
  const domain = normalizeDomain(input.domain)
  if (!isValidDomainFormat(domain)) {
    throw new Error('Invalid domain format.')
  }
  const all = readAll()
  if (all.some((d) => d.agentId === input.agentId && d.domain === domain && d.ownerId === ownerId)) {
    throw new Error('This domain is already listed.')
  }
  const now = new Date().toISOString()
  const item: AgentDomain = {
    id: generateId(),
    agentId: input.agentId,
    ownerId,
    domain,
    status: input.status || 'pending',
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
    notes: 'Verification challenge not yet completed — status remains pending until a real check exists.',
  }
  all.push(item)
  writeAll(all)
  return item
}

export function updateDomain(
  id: string,
  patch: Partial<Pick<AgentDomain, 'status' | 'enabled' | 'notes'>>
): AgentDomain {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const idx = all.findIndex((d) => d.id === id && d.ownerId === ownerId)
  if (idx === -1) throw new Error('Domain not found or access denied.')
  const updated: AgentDomain = {
    ...all[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
    verifiedAt:
      patch.status === 'verified'
        ? new Date().toISOString()
        : all[idx].verifiedAt,
  }
  // Phase 5: do not auto-set verified unless explicitly set by a real verifier later
  if (patch.status === 'verified' && !patch.notes) {
    updated.notes =
      'Marked verified manually in dashboard. DNS/meta verification can replace this later.'
  }
  all[idx] = updated
  writeAll(all)
  return updated
}

export function removeDomain(id: string): void {
  const ownerId = getLocalOwnerId()
  const all = readAll()
  const next = all.filter((d) => !(d.id === id && d.ownerId === ownerId))
  if (next.length === all.length) throw new Error('Domain not found or access denied.')
  writeAll(next)
}

export function setDomainStatus(id: string, status: DomainStatus): AgentDomain {
  return updateDomain(id, { status })
}
