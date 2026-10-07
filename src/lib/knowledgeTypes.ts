/**
 * Agent knowledge model — maps to future Supabase `knowledge` table.
 * Phase 4 uses localStorage; schema is migration-ready.
 */

export type KnowledgeType = 'faq' | 'text'
export type KnowledgeStatus = 'active' | 'disabled'

export interface KnowledgeItem {
  id: string
  agentId: string
  ownerId: string
  type: KnowledgeType
  title: string
  /** FAQ question or text title */
  content: string
  /** FAQ answer (when type === 'faq'); optional for text */
  answer?: string
  category?: string
  status: KnowledgeStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type KnowledgeItemInput = Omit<
  KnowledgeItem,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
> & { id?: string }

/** Payload published with the agent for server-side retrieval */
export interface PublishedKnowledgeItem {
  id: string
  type: KnowledgeType
  title: string
  content: string
  answer?: string
  category?: string
  status: KnowledgeStatus
}

export interface KnowledgeGap {
  id: string
  agentId: string
  ownerId: string
  question: string
  conversationId?: string
  sessionId?: string
  createdAt: string
  resolved: boolean
}
