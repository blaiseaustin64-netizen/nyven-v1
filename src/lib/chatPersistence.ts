/**
 * Conversation + message persistence.
 * Authenticated → Supabase (RLS).
 * Guest → localStorage fallback (existing behavior).
 */

import type { Conversation, Message } from './types'
import { getSupabase } from './supabase/client'
import type { ConversationRow, MessageRow } from './supabase/types'

const LOCAL_KEY = 'nyven_chat_history_v1'
const PAGE_SIZE = 40
const MSG_PAGE = 100

function loadLocal(): Conversation[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Conversation[]
  } catch {
    return []
  }
}

function saveLocal(items: Conversation[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

function rowToConversation(row: ConversationRow, messages: Message[] = []): Conversation {
  return {
    id: row.id,
    title: row.title,
    messages,
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function messageFromRow(row: MessageRow): Message {
  const meta = (row.metadata || {}) as Record<string, unknown>
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'nyven' : 'user',
    content: row.content,
    timestamp: new Date(row.created_at).getTime(),
    attachments: meta.attachments as Message['attachments'],
    citations: meta.citations as Message['citations'],
  }
}

export async function listConversations(userId: string | null): Promise<Conversation[]> {
  if (!userId) return loadLocal()
  const sb = getSupabase()
  if (!sb) return loadLocal()

  const { data, error } = await sb
    .from('conversations')
    .select('id, user_id, title, metadata, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) {
    console.warn('listConversations', error.message)
    return loadLocal()
  }
  return (data as ConversationRow[]).map((r) => rowToConversation(r))
}

export async function loadConversationMessages(
  userId: string | null,
  conversationId: string
): Promise<Message[]> {
  if (!userId) {
    const local = loadLocal().find((c) => c.id === conversationId)
    return local?.messages || []
  }
  const sb = getSupabase()
  if (!sb) return []

  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MSG_PAGE)

  if (error) {
    console.warn('loadMessages', error.message)
    return []
  }
  return (data as MessageRow[]).map(messageFromRow)
}

export async function ensureConversation(
  userId: string | null,
  conversationId: string,
  title: string
): Promise<string> {
  if (!userId) {
    const items = loadLocal()
    if (!items.find((c) => c.id === conversationId)) {
      items.unshift({
        id: conversationId,
        title,
        messages: [],
        updatedAt: Date.now(),
      })
      saveLocal(items)
    }
    return conversationId
  }

  const sb = getSupabase()
  if (!sb) return conversationId

  const { data: existing } = await sb
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await sb
    .from('conversations')
    .insert({
      id: conversationId,
      user_id: userId,
      title: title.slice(0, 120) || 'New chat',
    })
    .select('id')
    .single()

  if (error) {
    // ID may not be valid uuid from legacy local ids — create new
    const { data: created, error: err2 } = await sb
      .from('conversations')
      .insert({
        user_id: userId,
        title: title.slice(0, 120) || 'New chat',
      })
      .select('id')
      .single()
    if (err2) {
      console.warn('ensureConversation', error.message, err2.message)
      return conversationId
    }
    return created.id as string
  }
  return data.id as string
}

export async function persistMessage(
  userId: string | null,
  conversationId: string,
  message: Message,
  titleHint?: string
): Promise<void> {
  if (!userId) {
    const items = loadLocal()
    const idx = items.findIndex((c) => c.id === conversationId)
    if (idx >= 0) {
      const msgs = [...items[idx].messages]
      const midx = msgs.findIndex((m) => m.id === message.id)
      if (midx >= 0) msgs[midx] = message
      else msgs.push(message)
      items[idx] = {
        ...items[idx],
        messages: msgs,
        title: titleHint || items[idx].title,
        updatedAt: Date.now(),
      }
      saveLocal(items)
    } else {
      items.unshift({
        id: conversationId,
        title: titleHint || message.content.slice(0, 40) || 'Chat',
        messages: [message],
        updatedAt: Date.now(),
      })
      saveLocal(items)
    }
    return
  }

  const sb = getSupabase()
  if (!sb) return

  const role = message.role === 'nyven' ? 'assistant' : 'user'
  const metadata: Record<string, unknown> = {}
  if (message.attachments?.length) metadata.attachments = message.attachments
  if (message.citations?.length) metadata.citations = message.citations

  const { error } = await sb.from('messages').upsert(
    {
      id: isUuid(message.id) ? message.id : undefined,
      conversation_id: conversationId,
      user_id: userId,
      role,
      content: message.content,
      metadata,
    },
    { onConflict: 'id' }
  )

  if (error) {
    // Fallback insert without id if client id is not uuid
    const { error: err2 } = await sb.from('messages').insert({
      conversation_id: conversationId,
      user_id: userId,
      role,
      content: message.content,
      metadata,
    })
    if (err2) console.warn('persistMessage', error.message, err2.message)
  }

  await sb
    .from('conversations')
    .update({
      updated_at: new Date().toISOString(),
      ...(titleHint ? { title: titleHint.slice(0, 120) } : {}),
    })
    .eq('id', conversationId)
    .eq('user_id', userId)
}

export async function deleteConversation(
  userId: string | null,
  conversationId: string
): Promise<void> {
  if (!userId) {
    saveLocal(loadLocal().filter((c) => c.id !== conversationId))
    return
  }
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId)
  if (error) console.warn('deleteConversation', error.message)
}

export async function migrateLocalToSupabase(userId: string): Promise<number> {
  const local = loadLocal()
  if (!local.length) return 0
  let moved = 0
  for (const c of local) {
    try {
      const id = await ensureConversation(userId, c.id, c.title)
      for (const m of c.messages) {
        if (m.isThinking || m.isStreaming) continue
        await persistMessage(userId, id, m, c.title)
      }
      moved += 1
    } catch (e) {
      console.warn('migrate conversation failed', e)
    }
  }
  // Keep local copy as backup; mark migrated
  try {
    localStorage.setItem('nyven_local_migrated_v1', '1')
  } catch {
    /* ignore */
  }
  return moved
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export function newConversationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c-${Date.now()}`
}
