/**
 * VEXDYN+ entitlement / limits layer — configuration-driven.
 * No payment system yet. Default plan is "free" for all owners.
 */

export type PlanId = 'free' | 'pro' | 'business' | 'enterprise'

export interface PlanEntitlements {
  planId: PlanId
  label: string
  maxAgents: number
  maxMessagesPerMonth: number
  maxKnowledgeItems: number
  maxDomainsPerAgent: number
  rateLimitPerMinute: number
  rateLimitPerSessionPerMinute: number
  allowCustomModels: boolean
  connectedTools: number
}

/** Configuration-driven plans — not a live billing product */
export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    planId: 'free',
    label: 'Free',
    maxAgents: 3,
    maxMessagesPerMonth: 500,
    maxKnowledgeItems: 50,
    maxDomainsPerAgent: 3,
    rateLimitPerMinute: 30,
    rateLimitPerSessionPerMinute: 20,
    allowCustomModels: false,
    connectedTools: 0,
  },
  pro: {
    planId: 'pro',
    label: 'Pro',
    maxAgents: 15,
    maxMessagesPerMonth: 10000,
    maxKnowledgeItems: 500,
    maxDomainsPerAgent: 20,
    rateLimitPerMinute: 60,
    rateLimitPerSessionPerMinute: 40,
    allowCustomModels: false,
    connectedTools: 3,
  },
  business: {
    planId: 'business',
    label: 'Business',
    maxAgents: 50,
    maxMessagesPerMonth: 50000,
    maxKnowledgeItems: 2000,
    maxDomainsPerAgent: 100,
    rateLimitPerMinute: 120,
    rateLimitPerSessionPerMinute: 60,
    allowCustomModels: true,
    connectedTools: 20,
  },
  enterprise: {
    planId: 'enterprise',
    label: 'Enterprise',
    maxAgents: 1000,
    maxMessagesPerMonth: 1000000,
    maxKnowledgeItems: 50000,
    maxDomainsPerAgent: 1000,
    rateLimitPerMinute: 300,
    rateLimitPerSessionPerMinute: 120,
    allowCustomModels: true,
    connectedTools: 1000,
  },
}

const PLAN_STORAGE = 'nyven_owner_plan_v1'

/** Current plan for local owner — defaults to free until billing exists */
export function getOwnerPlanId(): PlanId {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE)
    if (raw && raw in PLAN_ENTITLEMENTS) return raw as PlanId
  } catch {
    /* ignore */
  }
  return 'free'
}

export function getEntitlements(): PlanEntitlements {
  return PLAN_ENTITLEMENTS[getOwnerPlanId()]
}

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: string }

export function checkMessageQuota(usedThisMonth: number): LimitCheckResult {
  const e = getEntitlements()
  if (usedThisMonth >= e.maxMessagesPerMonth) {
    return {
      allowed: false,
      code: 'monthly_message_limit',
      reason: `Monthly message limit reached (${e.maxMessagesPerMonth} on ${e.label}).`,
    }
  }
  return { allowed: true }
}

export function checkAgentCount(currentCount: number): LimitCheckResult {
  const e = getEntitlements()
  if (currentCount >= e.maxAgents) {
    return {
      allowed: false,
      code: 'agent_limit',
      reason: `Agent limit reached (${e.maxAgents} on ${e.label}).`,
    }
  }
  return { allowed: true }
}

export function checkKnowledgeCount(currentCount: number): LimitCheckResult {
  const e = getEntitlements()
  if (currentCount >= e.maxKnowledgeItems) {
    return {
      allowed: false,
      code: 'knowledge_limit',
      reason: `Knowledge item limit reached (${e.maxKnowledgeItems} on ${e.label}).`,
    }
  }
  return { allowed: true }
}

export function checkDomainCount(currentCount: number): LimitCheckResult {
  const e = getEntitlements()
  if (currentCount >= e.maxDomainsPerAgent) {
    return {
      allowed: false,
      code: 'domain_limit',
      reason: `Domain limit reached (${e.maxDomainsPerAgent} on ${e.label}).`,
    }
  }
  return { allowed: true }
}
