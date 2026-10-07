/**
 * Conversation + message persistence (localStorage until Supabase).
 * Owner-scoped; visitors only hold sessionId client-side.
 */

import type {
  Conversation,
  ConversationMessage,
  ConversationStatus,
  MessageRole,
} from './conversationTypes'
import { getLocalOwnerId } from './agentStore'

const CONV_KEY = 'nyven_agent_conversations_v1'
const MSG_KEY = 'nyven_agent_messages_v1'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

function readConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as Conversation[]) : []
  } catch {
    return []
  }
}

function writeConversations(items: Conversation[]): void {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('conversationStore: conv persist failed', err)
  }
}

function readMessages(): ConversationMessage[] {
  try {
    const raw = localStorage.getItem(MSG_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? (p as ConversationMessage[]) : []
  } catch {
    return []
  }
}

function writeMessages(items: ConversationMessage[]): void {
  try {
    localStorage.setItem(MSG_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('conversationStore: msg persist failed', err)
  }
}

export function listConversations(agentId: string): Conversation[] {
  const ownerId = getLocalOwnerId()
  return readConversations()
    .filter((c) => c.agentId === agentId && c.ownerId === ownerId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getConversation(id: string): Conversation | null {
  const ownerId = getLocalOwnerId()
  return (
    readConversations().find((c) => c.id === id && c.ownerId === ownerId) ?? null
  )
}

export function getOrCreateConversation(params: {
  agentId: string
  sessionId: string
  source: 'playground' | 'widget'
  title?: string
}): Conversation {
  const ownerId = getLocalOwnerId()
  const all = readConversations()
  const existing = all.find(
    (c) =>
      c.agentId === params.agentId &&
      c.sessionId === params.sessionId &&
      c.ownerId === ownerId &&
      c.status === 'open'
  )
  if (existing) return existing

  const now = new Date().toISOString()
  const conv: Conversation = {
    id: generateId('conv'),
    agentId: params.agentId,
    ownerId,
    sessionId: params.sessionId,
    source: params.source,
    status: 'open',
    title: params.title || 'Conversation',
    messageCount: 0,
    lastMessagePreview: '',
    metadata: {},
    startedAt: now,
    updatedAt: now,
  }
  all.push(conv)
  writeConversations(all)
  return conv
}

export function appendMessage(params: {
  conversationId: string
  agentId: string
  role: MessageRole
  content: string
  metadata?: ConversationMessage['metadata']
}): ConversationMessage {
  const ownerId = getLocalOwnerId()
  const convs = readConversations()
  const idx = convs.findIndex(
    (c) => c.id === params.conversationId && c.ownerId === ownerId
  )
  if (idx === -1) throw new Error('Conversation not found or access denied.')

  const now = new Date().toISOString()
  const msg: ConversationMessage = {
    id: generateId('msg'),
    conversationId: params.conversationId,
    agentId: params.agentId,
    role: params.role,
    content: params.content,
    metadata: params.metadata || {},
    createdAt: now,
  }

  const messages = readMessages()
  messages.push(msg)
  writeMessages(messages)

  const conv = convs[idx]
  const preview =
    params.content.slice(0, 80) + (params.content.length > 80 ? '…' : '')
  const title =
    conv.messageCount === 0 && params.role === 'user'
      ? params.content.slice(0, 48) + (params.content.length > 48 ? '…' : '')
      : conv.title

  convs[idx] = {
    ...conv,
    title,
    messageCount: conv.messageCount + 1,
    lastMessagePreview: preview,
    updatedAt: now,
  }
  writeConversations(convs)
  return msg
}

export function listMessages(conversationId: string): ConversationMessage[] {
  const ownerId = getLocalOwnerId()
  const conv = readConversations().find(
    (c) => c.id === conversationId && c.ownerId === ownerId
  )
  if (!conv) return []
  return readMessages()
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

export function closeConversation(id: string): void {
  const ownerId = getLocalOwnerId()
  const all = readConversations()
  const idx = all.findIndex((c) => c.id === id && c.ownerId === ownerId)
  if (idx === -1) return
  all[idx] = {
    ...all[idx],
    status: 'closed' as ConversationStatus,
    updatedAt: new Date().toISOString(),
  }
  writeConversations(all)
}

export function deleteConversation(id: string): void {
  const ownerId = getLocalOwnerId()
  const convs = readConversations().filter(
    (c) => !(c.id === id && c.ownerId === ownerId)
  )
  writeConversations(convs)
  writeMessages(readMessages().filter((m) => m.conversationId !== id))
}
