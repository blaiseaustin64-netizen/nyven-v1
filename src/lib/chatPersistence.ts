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
