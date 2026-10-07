/**
 * Reusable Skills registry — not hardcoded per component.
 */

import type { ConnectionType } from './connections'
import type { AgentTypeId } from './agentTypes'

export type SkillPermission = 'read' | 'write' | 'external'

export interface SkillDefinition {
  id: string
  name: string
  description: string
  /** Which agent templates this skill belongs to by default */
  agentTypes: AgentTypeId[]
  requiredConnection?: ConnectionType
  permission: SkillPermission
  /** Write/external skills always need explicit user confirmation */
  requiresConfirmation: boolean
  defaultEnabled: boolean
}

export const SKILL_REGISTRY: SkillDefinition[] = [
  // Support
  {
    id: 'answer_questions',
    name: 'Answer questions',
    description: 'Respond using knowledge and brain configuration.',
    agentTypes: ['support'],
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'search_knowledge',
    name: 'Search knowledge',
    description: 'Retrieve FAQs and business information.',
    agentTypes: ['support'],
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'collect_contact',
    name: 'Collect contact information',
    description: 'Ask for name/email when escalation is needed.',
    agentTypes: ['support'],
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'escalate_human',
    name: 'Escalate to human',
    description: 'Hand off when outside knowledge or rules apply.',
    agentTypes: ['support'],
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  // Inbox
  {
    id: 'inbox_read',
    name: 'Read',
    description: 'Read email content the user asks about.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'inbox_search',
    name: 'Search',
    description: 'Find relevant emails with minimal retrieval.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'inbox_categorize',
    name: 'Categorize',
    description: 'Help organize and label message priority (suggestions only).',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'inbox_summarize',
    name: 'Summarize thread',
    description: 'Summarize long threads or recent mail.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'read',
    requiresConfirmation: false,
    defaultEnabled: true,
  },
  {
    id: 'inbox_draft',
    name: 'Draft',
    description: 'Create suggested replies. Does not send.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'write',
    requiresConfirmation: false, // drafting is local suggestion
    defaultEnabled: true,
  },
  {
    id: 'inbox_send',
    name: 'Send / Reply',
    description: 'Send or reply to email. Requires explicit approval.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'external',
    requiresConfirmation: true,
    defaultEnabled: false,
  },
  {
    id: 'inbox_archive',
    name: 'Archive / Label / Move',
    description: 'Mailbox mutations. Requires explicit approval.',
    agentTypes: ['inbox'],
    requiredConnection: 'gmail',
    permission: 'write',
    requiresConfirmation: true,
    defaultEnabled: false,
  },
]

export function skillsForAgentType(type: AgentTypeId): SkillDefinition[] {
  return SKILL_REGISTRY.filter((s) => s.agentTypes.includes(type))
}

export function defaultEnabledSkills(type: AgentTypeId) {
  return skillsForAgentType(type).map((s) => ({
    id: s.id,
    label: s.name,
    description: s.description,
    enabled: s.defaultEnabled,
    requiredConnection: s.requiredConnection,
    permission: s.permission,
    requiresConfirmation: s.requiresConfirmation,
  }))
}
