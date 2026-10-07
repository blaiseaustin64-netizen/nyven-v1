/**
 * Conversation + message model — maps to future Supabase tables.
 */

export type ConversationStatus = 'open' | 'closed'
export type MessageRole = 'user' | 'assistant' | 'system'

export interface Conversation {
  id: string
  agentId: string
  ownerId: string
  /** Anonymous visitor session (widget) or playground session */
  sessionId: string
  source: 'playground' | 'widget'
  status: ConversationStatus
  title: string
  messageCount: number
  lastMessagePreview: string
  metadata: Record<string, unknown>
  startedAt: string
  updatedAt: string
}

export interface ConversationMessage {
  id: string
  conversationId: string
  agentId: string
  role: MessageRole
  content: string
  metadata: {
    knowledgeUsed?: boolean
    knowledgeIds?: string[]
    knowledgeGap?: boolean
    [key: string]: unknown
  }
  createdAt: string
}
