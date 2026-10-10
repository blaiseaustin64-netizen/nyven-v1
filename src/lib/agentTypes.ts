/**
 * NYVEN Agents — type system & catalog
 * Designed so Supabase tables can map 1:1 later.
 */

export type AgentStatus = 'draft' | 'active' | 'paused'

export type AgentTypeId =
  | 'support'
  | 'inbox'
  | 'code'
  | 'scheduler'
  | 'watch'
  | 'sales'

export interface AgentTypeDefinition {
  id: AgentTypeId
  name: string
  description: string
  category: string
  capabilities: string[]
  available: boolean
  comingSoon: boolean
  defaultName: string
  defaultDescription: string
  defaultColor: string
  defaultTone: string
  defaultPersonality: string
  defaultInstructions: string
  defaultGoals: string
  defaultBehaviorRules: string
  defaultRestrictions: string
  defaultEscalationRules: string
  defaultWelcomeMessage: string
}

/** Catalog of agent types — add new types here without rewriting the dashboard */
export const AGENT_CATALOG: AgentTypeDefinition[] = [
  {
    id: 'support',
    name: 'Nyven Support',
    description:
      'Customer support agent for websites. Answers questions, handles common requests, and escalates when needed.',
    category: 'Customer Experience',
    capabilities: [
      'Answer FAQs',
      'Guide visitors',
      'Collect contact details',
      'Escalate complex issues',
    ],
    available: true,
    comingSoon: false,
    defaultName: 'Nyven Support',
    defaultDescription: 'Helpful customer support agent for your website.',
    defaultColor: '#62E6FF',
    defaultTone: 'Professional',
    defaultPersonality: 'Calm, clear, and solution-oriented.',
    defaultInstructions:
      'You are a customer support agent. Answer questions accurately using the knowledge provided. Be helpful and concise. If you cannot resolve something, offer to escalate or collect contact details.',
    defaultGoals:
      'Resolve visitor questions quickly.\nMaintain a professional brand voice.\nCollect useful context when escalation is needed.',
    defaultBehaviorRules:
      'Always greet the visitor politely.\nPrefer short, actionable answers.\nAsk clarifying questions when the request is ambiguous.',
    defaultRestrictions:
      'Do not invent product details or policies.\nDo not share internal systems or credentials.\nDo not make promises about refunds or legal matters without escalation.',
    defaultEscalationRules:
      'Escalate billing disputes, legal requests, and anything outside provided knowledge.\nWhen escalating, summarize the conversation and ask for contact details.',
    defaultWelcomeMessage: "Hi! I'm Nyven Support. How can I help you today?",
  },
  {
    id: 'inbox',
    name: 'Nyven Inbox',
    description:
      'An AI assistant that helps you understand, organize, and work with your email via a secure Gmail connection.',
    category: 'Productivity',
    capabilities: [
      'Search and read mail',
      'Summarize threads',
      'Categorize priority',
      'Draft replies (send only with approval)',
    ],
    available: true,
    comingSoon: false,
    defaultName: 'Nyven Inbox',
    defaultDescription: 'AI email assistant powered by your connected Gmail account.',
    defaultColor: '#8B7CFF',
    defaultTone: 'Professional',
    defaultPersonality: 'Efficient, clear, and respectful of privacy.',
    defaultInstructions:
      'You are an email assistant. Help the user search, understand, and draft responses to their mail. Only use email content that was retrieved for this request. Never claim to have sent mail unless a confirmed send action completed. Prefer concise summaries.',
    defaultGoals:
      'Help the user stay on top of important mail.\nMinimize unnecessary mailbox access.\nNever send email without explicit approval.',
    defaultBehaviorRules:
      'Ask clarifying questions when the request is ambiguous.\nRetrieve only the minimum mail needed.\nWhen drafting, present the draft for review — do not send it.',
    defaultRestrictions:
      'Do not invent email content.\nDo not send, delete, archive, or forward without explicit user confirmation.\nDo not expose unrelated private messages.',
    defaultEscalationRules:
      'If Gmail is disconnected, say so and ask the user to connect.\nIf a write action is requested, require confirmation before proceeding.',
    defaultWelcomeMessage:
      "Hi! I'm Nyven Inbox. Connect Gmail to search, summarize, and draft — I won't send anything without your approval.",
  },
  {
    id: 'code',
    name: 'NYVEN Code',
    description:
      'Developer assistant grounded in your GitHub repositories, issues, and pull requests.',
    category: 'Development',
    capabilities: [
      'Read repositories and files',
      'Inspect issues and pull requests',
      'Summarize commits',
      'Draft issues/PRs with approval',
    ],
    available: true,
    comingSoon: false,
    defaultName: 'NYVEN Code',
    defaultDescription: 'Code-aware agent powered by a secure GitHub connection.',
    defaultColor: '#62E6FF',
    defaultTone: 'Professional',
    defaultPersonality: 'Precise, technical, and careful with changes.',
    defaultInstructions:
      'You are a code assistant. Use only repository context retrieved for this request. Never claim to have opened a PR or issue unless a confirmed write action completed.',
    defaultGoals:
      'Help the user understand and work with their codebase.\nMinimize unnecessary repository access.\nNever mutate GitHub without explicit approval.',
    defaultBehaviorRules:
      'Prefer read-only analysis.\nAsk clarifying questions when the request is ambiguous.\nWhen proposing writes, present them for review first.',
    defaultRestrictions:
      'Do not invent repository contents.\nDo not push code or merge without explicit confirmation.\nDo not expose secrets found in code.',
    defaultEscalationRules:
      'If GitHub is not connected, say so and ask the user to connect.\nIf a write action is requested, require confirmation.',
    defaultWelcomeMessage:
      "Hi! I'm NYVEN Code. Connect GitHub to explore repos, issues, and PRs — I won't change anything without your approval.",
  },
  {
    id: 'scheduler',
    name: 'NYVEN Scheduler',
    description:
      'Calendar-aware assistant for availability and event management via Google Calendar.',
    category: 'Productivity',
    capabilities: [
      'Read calendars and events',
      'Check availability',
      'Create or update events with approval',
    ],
    available: false,
    comingSoon: true,
    defaultName: 'NYVEN Scheduler',
    defaultDescription: 'Schedule assistant powered by Google Calendar.',
    defaultColor: '#8B7CFF',
    defaultTone: 'Professional',
    defaultPersonality: 'Organized, clear, and respectful of time.',
    defaultInstructions:
      'You are a scheduling assistant. Use only calendar data retrieved for this request. Never claim to have created an event unless a confirmed action completed.',
    defaultGoals:
      'Help the user manage time and meetings.\nNever create or change events without approval.',
    defaultBehaviorRules:
      'Confirm time zones and attendees when relevant.\nPresent proposed events for review before creating.',
    defaultRestrictions:
      'Do not invent calendar data.\nDo not delete events without explicit confirmation.',
    defaultEscalationRules:
      'If Calendar is not connected, ask the user to connect.',
    defaultWelcomeMessage:
      "Hi! I'm NYVEN Scheduler. Connect Google Calendar to check availability and manage events — with your approval.",
  },
  {
    id: 'watch',
    name: 'NYVEN Watch',
    description:
      'Monitors websites and HTTP endpoints for health, status, latency, and uptime.',
    category: 'Operations',
    capabilities: [
      'Health checks',
      'Status and response time',
      'Uptime reporting',
    ],
    available: false,
    comingSoon: true,
    defaultName: 'NYVEN Watch',
    defaultDescription: 'Website and endpoint monitoring agent.',
    defaultColor: '#34D399',
    defaultTone: 'Professional',
    defaultPersonality: 'Alert, factual, and concise.',
    defaultInstructions:
      'You are a monitoring assistant. Report only on targets the user has configured. Do not claim continuous monitoring unless the Watch runtime is active.',
    defaultGoals:
      'Help the user understand service health.\nAvoid noisy or invented metrics.',
    defaultBehaviorRules:
      'Only probe configured targets.\nPresent status clearly with timestamps when available.',
    defaultRestrictions:
      'Do not scan arbitrary internet hosts without user configuration.\nDo not store response bodies longer than needed.',
    defaultEscalationRules:
      'If no targets are configured, ask the user to add them.',
    defaultWelcomeMessage:
      "Hi! I'm NYVEN Watch. Configure targets to check health, status, and uptime.",
  },
  {
    id: 'sales',
    name: 'NYVEN Sales',
    description:
      'CRM and spreadsheet-aware assistant for pipeline and records (foundation only).',
    category: 'Revenue',
    capabilities: [
      'Read and search records',
      'Create or update records with approval',
    ],
    available: false,
    comingSoon: true,
    defaultName: 'NYVEN Sales',
    defaultDescription: 'Sales assistant connected to CRM or sheets when available.',
    defaultColor: '#FBBF24',
    defaultTone: 'Professional',
    defaultPersonality: 'Helpful, commercial, and careful with customer data.',
    defaultInstructions:
      'You are a sales assistant. Use only CRM/sheet data retrieved for this request. Never invent pipeline numbers or contacts.',
    defaultGoals:
      'Help the user work with CRM data accurately.\nRequire approval for record mutations.',
    defaultBehaviorRules:
      'Minimize data retrieval.\nPresent drafts before writes.',
    defaultRestrictions:
      'Do not invent CRM records.\nDo not export full customer lists without confirmation.',
    defaultEscalationRules:
      'If CRM is not connected, say so clearly.',
    defaultWelcomeMessage:
      "Hi! I'm NYVEN Sales. CRM connections are coming soon — I won't invent pipeline data.",
  },
]

export function getAgentType(id: AgentTypeId): AgentTypeDefinition | undefined {
  return AGENT_CATALOG.find((t) => t.id === id)
}

export const TONE_OPTIONS = [
  'Professional',
  'Friendly',
  'Concise',
  'Warm',
  'Technical',
  'Casual',
] as const

export type ToneOption = (typeof TONE_OPTIONS)[number]

export const COMMUNICATION_STYLE_OPTIONS = [
  'Direct',
  'Conversational',
  'Formal',
  'Empathetic',
] as const

export type CommunicationStyleOption = (typeof COMMUNICATION_STYLE_OPTIONS)[number]

/** Structured Brain configuration */
export interface AgentBrain {
  personality: string
  tone: string
  communicationStyle: string
  goals: string
  instructions: string
  behaviorRules: string
  restrictions: string
  escalationRules: string
}

/** Identity configuration */
export interface AgentIdentity {
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
}

/**
 * Runtime config sent to /api/agent/chat and stored when publishing.
 * Contains everything needed to drive the model — no secrets.
 */
export interface AgentRuntimeConfig {
  id: string
  agentType: AgentTypeId
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
  personality: string
  tone: string
  communicationStyle: string
  instructions: string
  goals: string
  behaviorRules: string
  restrictions: string
  escalationRules: string
  status: AgentStatus
}

/** Safe public fields for the website widget (no brain/secrets) */
export interface AgentPublicConfig {
  id: string
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
  status: AgentStatus
  agentType: AgentTypeId
}

/**
 * Agent instance — maps to future `agent_instances` table.
 * ownerId is a local placeholder until Supabase auth lands.
 */
export interface AgentInstance {
  id: string
  ownerId: string
  agentType: AgentTypeId
  name: string
  description: string
  avatar: string
  color: string
  welcomeMessage: string
  personality: string
  tone: string
  communicationStyle: string
  instructions: string
  goals: string
  behaviorRules: string
  restrictions: string
  escalationRules: string
  status: AgentStatus
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AgentInstanceInput = Omit<
  AgentInstance,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
> & {
  id?: string
}

export function toRuntimeConfig(a: AgentInstance): AgentRuntimeConfig {
  return {
    id: a.id,
    agentType: a.agentType,
    name: a.name,
    description: a.description,
    avatar: a.avatar,
    color: a.color,
    welcomeMessage: a.welcomeMessage,
    personality: a.personality,
    tone: a.tone,
    communicationStyle: a.communicationStyle,
    instructions: a.instructions,
    goals: a.goals,
    behaviorRules: a.behaviorRules,
    restrictions: a.restrictions,
    escalationRules: a.escalationRules,
    status: a.status,
  }
}

export function toPublicConfig(a: AgentInstance | AgentRuntimeConfig): AgentPublicConfig {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    avatar: a.avatar,
    color: a.color,
    welcomeMessage: a.welcomeMessage,
    status: a.status,
    agentType: a.agentType,
  }
}

export const AVATAR_OPTIONS = [
  'N',
  '✦',
  '◉',
  '◆',
  '◎',
  '⬡',
  '◇',
  '●',
] as const

export const COLOR_OPTIONS = [
  '#62E6FF',
  '#8B7CFF',
  '#7CFFB2',
  '#FFB86C',
  '#FF6B9D',
  '#A0AEC0',
] as const
