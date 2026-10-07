/**
 * Skills + Guardrails configuration models.
 * Integrated into agent runtime context (not cosmetic).
 */

export interface AgentSkill {
  id: string
  label: string
  description: string
  enabled: boolean
}

export const DEFAULT_SUPPORT_SKILLS: AgentSkill[] = [
  {
    id: 'answer_questions',
    label: 'Answer questions',
    description: 'Respond to visitor questions using configured knowledge and brain.',
    enabled: true,
  },
  {
    id: 'search_knowledge',
    label: 'Search knowledge',
    description: 'Retrieve FAQs and business information before answering.',
    enabled: true,
  },
  {
    id: 'collect_contact',
    label: 'Collect contact information',
    description: 'Ask for name/email when escalation or follow-up is needed.',
    enabled: true,
  },
  {
    id: 'escalate_human',
    label: 'Escalate to human',
    description: 'Hand off when outside knowledge or escalation rules apply.',
    enabled: true,
  },
]

export interface AgentGuardrails {
  topicsToAvoid: string
  mustNotInvent: string
  whenToSayUnknown: string
  whenToEscalate: string
  restrictedActions: string
  responseBoundaries: string
}

export const DEFAULT_GUARDRAILS: AgentGuardrails = {
  topicsToAvoid: '',
  mustNotInvent:
    'Do not invent prices, policies, legal claims, or product capabilities.',
  whenToSayUnknown:
    'If knowledge does not cover the question, say you do not have that information.',
  whenToEscalate:
    'Escalate billing disputes, legal requests, and anything outside provided knowledge.',
  restrictedActions: 'Do not process payments or access internal systems.',
  responseBoundaries: 'Stay concise; do not over-promise on behalf of the business.',
}

export function skillsToPrompt(skills: AgentSkill[]): string {
  const enabled = skills.filter((s) => s.enabled)
  if (enabled.length === 0) return 'Skills: none explicitly enabled.'
  return (
    'Enabled skills:\n' +
    enabled.map((s) => `- ${s.label}: ${s.description}`).join('\n')
  )
}

export function guardrailsToPrompt(g: AgentGuardrails): string {
  const lines: string[] = ['Guardrails:']
  if (g.topicsToAvoid.trim()) lines.push(`Topics to avoid: ${g.topicsToAvoid.trim()}`)
  if (g.mustNotInvent.trim()) lines.push(`Must not invent: ${g.mustNotInvent.trim()}`)
  if (g.whenToSayUnknown.trim())
    lines.push(`When to say unknown: ${g.whenToSayUnknown.trim()}`)
  if (g.whenToEscalate.trim()) lines.push(`When to escalate: ${g.whenToEscalate.trim()}`)
  if (g.restrictedActions.trim())
    lines.push(`Restricted actions: ${g.restrictedActions.trim()}`)
  if (g.responseBoundaries.trim())
    lines.push(`Response boundaries: ${g.responseBoundaries.trim()}`)
  return lines.length > 1 ? lines.join('\n') : ''
}
