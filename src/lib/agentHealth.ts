/**
 * Agent Health score — derived only from real configuration + usage data.
 */

import type { AgentInstance } from './agentTypes'
import { listKnowledge, listKnowledgeGaps } from './knowledgeStore'
import { getAgentAnalytics } from './usageStore'
import { listDomains } from './domainStore'

export interface HealthFactor {
  id: string
  label: string
  score: number
  weight: number
  detail: string
}

export interface AgentHealthResult {
  score: number
  factors: HealthFactor[]
  suggestions: string[]
}

function safeListKnowledge(agentId: string) {
  try {
    return listKnowledge(agentId) || []
  } catch {
    return []
  }
}

function safeListGaps(agentId: string) {
  try {
    return (listKnowledgeGaps(agentId) || []).filter((g) => g && !g.resolved)
  } catch {
    return []
  }
}

function safeAnalytics(agentId: string) {
  try {
    return getAgentAnalytics(agentId)
  } catch {
    return {
      messagesTotal: 0,
      messagesThisMonth: 0,
      conversationsApprox: 0,
      knowledgeHits: 0,
      knowledgeGaps: 0,
      rateLimited: 0,
      domainBlocked: 0,
      errorsTotal: 0,
      activityByDay: [] as { date: string; messages: number }[],
      uniqueSessions: 0,
    }
  }
}

function safeDomains(agentId: string) {
  try {
    return listDomains(agentId) || []
  } catch {
    return []
  }
}

function safeGmailStatus(agentId: string): {
  score: number
  detail: string
} {
  try {
    // Dynamic import path avoided — use localStorage status if present
    const raw = localStorage.getItem('nyven_agent_connections_v1')
    if (!raw) return { score: 25, detail: 'Gmail is not connected.' }
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return { score: 25, detail: 'Gmail is not connected.' }
    const gmail = list.find(
      (c: { agentId?: string; type?: string; status?: string }) =>
        c.agentId === agentId && c.type === 'gmail'
    )
    if (gmail?.status === 'connected') {
      return { score: 90, detail: 'Gmail connection is active.' }
    }
    if (gmail?.status === 'pending') {
      return { score: 45, detail: 'Gmail connection is pending authorization.' }
    }
  } catch {
    /* ignore */
  }
  return { score: 25, detail: 'Gmail is not connected.' }
}

export function computeAgentHealth(agent: AgentInstance): AgentHealthResult {
  if (!agent || !agent.id) {
    return {
      score: 0,
      factors: [],
      suggestions: ['Save the agent to compute health.'],
    }
  }

  const knowledge = safeListKnowledge(agent.id)
  const activeKnowledge = knowledge.filter((k) => k.status === 'active')
  const gaps = safeListGaps(agent.id)
  const analytics = safeAnalytics(agent.id)
  const domains = safeDomains(agent.id)

  const factors: HealthFactor[] = []

  // Configuration completeness
  let configPoints = 0
  const configBits: string[] = []
  if (agent.name?.trim()) configPoints += 15
  else configBits.push('Missing name')
  if (agent.instructions?.trim()) configPoints += 25
  else configBits.push('Add main instructions')
  if (agent.personality?.trim() || agent.tone) configPoints += 15
  else configBits.push('Set personality or tone')
  if (agent.restrictions?.trim() || agent.escalationRules?.trim()) configPoints += 15
  else configBits.push('Add restrictions or escalation rules')
  if (agent.welcomeMessage?.trim()) configPoints += 10
  else configBits.push('Add a welcome message')
  if (agent.status === 'active') configPoints += 20
  else if (agent.status === 'paused') configPoints += 10
  else configBits.push('Activate the agent when ready')

  factors.push({
    id: 'config',
    label: 'Configuration',
    score: Math.min(100, configPoints),
    weight: 0.3,
    detail: configBits.length ? configBits.join('. ') : 'Core settings look complete.',
  })

  // Knowledge / connection coverage by agent type
  if (agent.agentType === 'inbox') {
    const gmail = safeGmailStatus(agent.id)
    factors.push({
      id: 'connection',
      label: 'Gmail connection',
      score: gmail.score,
      weight: 0.3,
      detail: gmail.detail,
    })

    let enabledSkills = 0
    try {
      const skills = agent.settings?.skills
      if (Array.isArray(skills)) {
        enabledSkills = skills.filter(
          (s: { enabled?: boolean }) => s && s.enabled
        ).length
      }
    } catch {
      enabledSkills = 0
    }

    factors.push({
      id: 'skills',
      label: 'Skill configuration',
      score: enabledSkills >= 3 ? 85 : enabledSkills > 0 ? 55 : 20,
      weight: 0.15,
      detail:
        enabledSkills > 0
          ? `${enabledSkills} inbox skill(s) enabled.`
          : 'Enable inbox skills under Skills.',
    })
  } else {
    const knCount = activeKnowledge.length
    let knScore = 0
    if (knCount === 0) knScore = 10
    else if (knCount < 3) knScore = 40
    else if (knCount < 8) knScore = 70
    else knScore = 90
    if (gaps.length > 0) {
      knScore = Math.max(5, knScore - Math.min(40, gaps.length * 5))
    }
    factors.push({
      id: 'knowledge',
      label: 'Knowledge coverage',
      score: knScore,
      weight: 0.3,
      detail:
        knCount === 0
          ? 'No active knowledge items. Add FAQs or business information.'
          : gaps.length > 0
            ? `${knCount} active items, ${gaps.length} unresolved gap(s).`
            : `${knCount} active knowledge items.`,
    })
  }

  // Reliability
  let relScore = 70
  let relDetail = 'Not enough usage yet to measure reliability.'
  if (analytics.messagesTotal > 0) {
    const failish =
      analytics.errorsTotal + analytics.rateLimited + analytics.domainBlocked
    const ratio = failish / Math.max(1, analytics.messagesTotal + failish)
    relScore = Math.round(Math.max(0, Math.min(100, 100 - ratio * 100)))
    relDetail = `${analytics.messagesTotal} messages, ${analytics.errorsTotal} recorded errors.`
  }
  factors.push({
    id: 'reliability',
    label: 'Reliability',
    score: relScore,
    weight: 0.2,
    detail: relDetail,
  })

  // Production readiness
  let prodScore = 40
  let prodDetail =
    agent.agentType === 'inbox'
      ? 'Inbox readiness based on connection and status.'
      : 'No domains configured yet.'
  if (agent.agentType !== 'inbox' && domains.length > 0) {
    const enabled = domains.filter(
      (d) => d.enabled && d.status !== 'blocked' && d.status !== 'disabled'
    )
    prodScore = enabled.length > 0 ? 75 : 35
    prodDetail = `${enabled.length} enabled domain(s) of ${domains.length}.`
  }
  if (agent.agentType === 'inbox') {
    prodScore = agent.status === 'active' ? 70 : 40
  }
  if (agent.status === 'active') prodScore = Math.min(100, prodScore + 15)
  factors.push({
    id: 'production',
    label: 'Production readiness',
    score: prodScore,
    weight: 0.2,
    detail: prodDetail,
  })

  const weightSum = factors.reduce((s, f) => s + f.weight, 0) || 1
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) / weightSum
  )

  const suggestions: string[] = []
  for (const f of factors) {
    if (f.score < 60 && f.detail) suggestions.push(f.detail)
  }
  if (agent.agentType !== 'inbox' && gaps.length > 0) {
    suggestions.push(
      `Review ${gaps.length} knowledge gap(s) and add missing FAQs.`
    )
  }
  if (agent.agentType !== 'inbox' && activeKnowledge.length === 0) {
    suggestions.push(
      'Add information about pricing, policies, or hours to improve answers.'
    )
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
    suggestions: [...new Set(suggestions)].slice(0, 5),
  }
}
