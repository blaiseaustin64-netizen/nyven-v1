/**
 * Conversation + message persistence.
 * Currently localStorage for all clients (Cloudflare auth migration).
 * Server-side D1 conversation tables exist for a future sync API.
 * Does not use Supabase.
 */

import type { Conversation, Message } from './types'

const LOCAL_KEY = 'nyven_chat_history_v1'

function storageKey(userId: string | null): string {
  return userId ? `${LOCAL_KEY}:user:${userId}` : LOCAL_KEY
}

function loadLocal(userId: string | null): Conversation[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as Conversation[]
  } catch {
    return []
  }
}

function saveLocal(userId: string | null, items: Conversation[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

/** Generate a new client-side conversation id. */
export function newConversationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through */
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Drop transient streaming/UI state before storing a message. */
function toStoredMessage(message: Message): Message {
  return {
    ...message,
    isThinking: false,
    isStreaming: false,
    activityState: undefined,
    activityDetail: undefined,
  }
}

/**
 * Make sure a conversation record exists (creates an empty one if needed).
 * Returns the conversation id to use for subsequent writes.
 */
export async function ensureConversation(
  userId: string | null,
  conversationId: string,
  title: string
): Promise<string> {
  const items = loadLocal(userId)
  if (!items.some((c) => c.id === conversationId)) {
    items.unshift({
      id: conversationId,
      title: title || 'Chat',
      messages: [],
      updatedAt: Date.now(),
    })
    items.sort((a, b) => b.updatedAt - a.updatedAt)
    saveLocal(userId, items.slice(0, 80))
  }
  return conversationId
}

/**
 * Insert or update a single message in a conversation (idempotent by message id).
 * Creates the conversation if it does not exist yet.
 */
export async function persistMessage(
  userId: string | null,
  conversationId: string,
  message: Message,
  title?: string
): Promise<void> {
  const items = loadLocal(userId)
  let conv = items.find((c) => c.id === conversationId)
  if (!conv) {
    conv = { id: conversationId, title: title || 'Chat', messages: [], updatedAt: Date.now() }
    items.unshift(conv)
  }
  const stored = toStoredMessage(message)
  const idx = conv.messages.findIndex((m) => m.id === stored.id)
  if (idx >= 0) conv.messages[idx] = stored
  else conv.messages.push(stored)
  if (title && (!conv.title || conv.title === 'Chat')) conv.title = title
  conv.updatedAt = Date.now()
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  saveLocal(userId, items.slice(0, 80))
}

export async function listConversations(userId: string | null): Promise<Conversation[]> {
  return loadLocal(userId)
}

export async function loadConversationMessages(
  userId: string | null,
  conversationId: string
): Promise<Message[]> {
  const local = loadLocal(userId).find((c) => c.id === conversationId)
  return local?.messages || []
}

export async function upsertConversation(
  userId: string | null,
  conversation: Conversation
): Promise<void> {
  const items = loadLocal(userId)
  const idx = items.findIndex((c) => c.id === conversation.id)
  if (idx >= 0) items[idx] = conversation
  else items.unshift(conversation)
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  saveLocal(userId, items.slice(0, 80))
}

export async function deleteConversation(
  userId: string | null,
  conversationId: string
): Promise<void> {
  const items = loadLocal(userId).filter((c) => c.id !== conversationId)
  saveLocal(userId, items)
}

/** No-op migration stub (Supabase removed). */
export async function migrateLocalToSupabase(_userId: string): Promise<number> {
  return 0
}

/** Alias kept for older imports */
export const migrateLocalToCloud = migrateLocalToSupabase
