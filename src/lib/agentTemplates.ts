/**
 * Agent templates — produce configurations, not duplicate apps.
 */

import type { AgentTypeId } from './agentTypes'
import { getAgentType } from './agentTypes'
import { defaultEnabledSkills } from './skillsRegistry'
import { DEFAULT_GUARDRAILS } from './skillsGuardrails'

export interface AgentTemplate {
  id: string
  agentType: AgentTypeId
  name: string
  description: string
  defaultSettings: {
    skills: ReturnType<typeof defaultEnabledSkills>
    guardrails: typeof DEFAULT_GUARDRAILS
    connections: Array<'website' | 'gmail'>
  }
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'customer_support',
    agentType: 'support',
    name: 'Customer Support',
    description: 'Website support with knowledge, FAQs, and visitor conversations.',
    defaultSettings: {
      skills: defaultEnabledSkills('support'),
      guardrails: {
        ...DEFAULT_GUARDRAILS,
        mustNotInvent:
          'Do not invent prices, policies, legal claims, or product capabilities.',
        whenToEscalate:
          'Escalate billing disputes, legal requests, and anything outside knowledge.',
      },
      connections: ['website'],
    },
  },
  {
    id: 'inbox_assistant',
    agentType: 'inbox',
    name: 'Inbox Assistant',
    description: 'Gmail search, summaries, drafting, and organization with human approval.',
    defaultSettings: {
      skills: defaultEnabledSkills('inbox'),
      guardrails: {
        topicsToAvoid: 'Do not access or discuss unrelated private emails.',
        mustNotInvent: 'Do not invent email content that was not retrieved.',
        whenToSayUnknown:
          'If Gmail is disconnected or data was not retrieved, say so clearly.',
        whenToEscalate:
          'Never send mail without explicit user approval in this session.',
        restrictedActions:
          'Do not send, delete, archive, or forward without confirmation.',
        responseBoundaries:
          'Minimize data retrieved; only process what the user asked for.',
      },
      connections: ['gmail'],
    },
  },
]

export function templateForType(type: AgentTypeId): AgentTemplate {
  return (
    AGENT_TEMPLATES.find((t) => t.agentType === type) || AGENT_TEMPLATES[0]
  )
}

export function applyTemplateDefaults(type: AgentTypeId) {
  const t = templateForType(type)
  const catalog = getAgentType(type)
  return {
    templateId: t.id,
    name: catalog?.defaultName || t.name,
    description: catalog?.defaultDescription || t.description,
    settings: {
      skills: t.defaultSettings.skills,
      guardrails: t.defaultSettings.guardrails,
      templateId: t.id,
    },
  }
}
