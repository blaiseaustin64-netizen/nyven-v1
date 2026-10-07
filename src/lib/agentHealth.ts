/**
 * Agent Health score — derived only from real configuration + usage data.
 */

import type { AgentInstance } from './agentTypes'
import { listKnowledge } from './knowledgeStore'
import { listKnowledgeGaps } from './knowledgeStore'
import { getAgentAnalytics } from './usageStore'
import { listDomains } from './domainStore'
import { getConnection } from './connections'

export interface HealthFactor {
  id: string
  label: string
  score: number // 0–100 contribution weight applied separately
  weight: number
  detail: string
}

export interface AgentHealthResult {
  score: number
  factors: HealthFactor[]
  suggestions: string[]
}

export function computeAgentHealth(agent: AgentInstance): AgentHealthResult {
  const knowledge = listKnowledge(agent.id)
  const activeKnowledge = knowledge.filter((k) => k.status === 'active')
  const gaps = listKnowledgeGaps(agent.id).filter((g) => !g.resolved)
  const analytics = getAgentAnalytics(agent.id)
  const domains = listDomains(agent.id)

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
    let connScore = 25
    let connDetail = 'Gmail is not connected.'
    try {
      const gmail = getConnection(agent.id, 'gmail')
      if (gmail?.status === 'connected') {
        connScore = 90
        connDetail = 'Gmail connection is active.'
      } else if (gmail?.status === 'pending') {
        connScore = 45
        connDetail = 'Gmail connection is pending authorization.'
      }
    } catch {
      /* ignore */
    }
    const skills = (agent.settings?.skills as { enabled?: boolean }[]) || []
    const enabledSkills = skills.filter((s) => s.enabled).length
    factors.push({
      id: 'connection',
      label: 'Gmail connection',
      score: connScore,
      weight: 0.3,
      detail: connDetail,
    })
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

  // Reliability from usage (only if there is usage)
  let relScore = 70 // neutral when no data
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

  // Production readiness (domains + status)
  let prodScore = 40
  let prodDetail = 'No domains configured yet.'
  if (domains.length > 0) {
    const enabled = domains.filter((d) => d.enabled && d.status !== 'blocked' && d.status !== 'disabled')
    prodScore = enabled.length > 0 ? 75 : 35
    prodDetail = `${enabled.length} enabled domain(s) of ${domains.length}.`
  }
  if (agent.status === 'active') prodScore = Math.min(100, prodScore + 15)
  factors.push({
    id: 'production',
    label: 'Production readiness',
    score: prodScore,
    weight: 0.2,
    detail: prodDetail,
  })

  const score = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  )

  const suggestions: string[] = []
  for (const f of factors) {
    if (f.score < 60 && f.detail) suggestions.push(f.detail)
  }
  if (gaps.length > 0) {
    suggestions.push(
      `Review ${gaps.length} knowledge gap(s) and add missing FAQs.`
    )
  }
  if (knCount === 0) {
    suggestions.push('Add information about pricing, policies, or hours to improve answers.')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
    suggestions: [...new Set(suggestions)].slice(0, 5),
  }
}
