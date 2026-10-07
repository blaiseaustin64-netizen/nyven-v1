/** Domain allowlist — maps to future Supabase agent_domains table */

export type DomainStatus = 'pending' | 'verified' | 'blocked' | 'disabled'

export interface AgentDomain {
  id: string
  agentId: string
  ownerId: string
  domain: string
  status: DomainStatus
  /** When true, domain is included in allowlist checks */
  enabled: boolean
  /** Verification is Phase 5 foundation: pending until a real challenge exists */
  verifiedAt?: string
  createdAt: string
  updatedAt: string
  notes?: string
}

export type AgentDomainInput = {
  agentId: string
  domain: string
  status?: DomainStatus
  enabled?: boolean
}
