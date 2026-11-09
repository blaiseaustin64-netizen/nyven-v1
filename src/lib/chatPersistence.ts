/**
 * Local-first conversation persistence with optional server sync for signed-in users.
 */
import type { Conversation, Message } from './types'

const LOCAL_KEY = 'nyven_chat_history_v1'
const SYNC_QUEUE_KEY = 'nyven_sync_queue_v1'
const PENDING_DELETE_KEY = 'nyven_pending_deletes_v1'
const MIGRATED_KEY = 'nyven_local_migrated_v1'

function storageKey(userId: string | null): string {
  return userId ? `${LOCAL_KEY}:user:${userId}` : LOCAL_KEY
}
function loadLocal(userId: string | null): Conversation[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as Conversation[]) : []
  } catch { return [] }
}
function saveLocal(userId: string | null, items: Conversation[]) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 80))) } catch { /* */ }
}

export function newConversationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* */ }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function toStoredMessage(message: Message): Message {
  return { ...message, isThinking: false, isStreaming: false, activityState: undefined, activityDetail: undefined }
}

type SyncOp =
  | { type: 'upsert_meta'; conversationId: string; title?: string; pinned?: boolean; project_id?: string | null }
  | { type: 'upsert_messages'; conversationId: string; messages: Message[]; title?: string }
  | { type: 'delete'; conversationId: string }

function loadQueue(userId: string): SyncOp[] {
  try { return JSON.parse(localStorage.getItem(`${SYNC_QUEUE_KEY}:${userId}`) || '[]') } catch { return [] }
}
function saveQueue(userId: string, ops: SyncOp[]) {
  try { localStorage.setItem(`${SYNC_QUEUE_KEY}:${userId}`, JSON.stringify(ops.slice(-200))) } catch { /* */ }
}
function enqueue(userId: string, op: SyncOp) {
  const q = loadQueue(userId); q.push(op); saveQueue(userId, q); void flushQueue(userId)
}
function loadPendingDeletes(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`${PENDING_DELETE_KEY}:${userId}`) || '[]') } catch { return [] }
}
function savePendingDeletes(userId: string, ids: string[]) {
  try { localStorage.setItem(`${PENDING_DELETE_KEY}:${userId}`, JSON.stringify(ids)) } catch { /* */ }
}

async function apiJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, data: {} as any }
  }
}

async function flushQueue(userId: string) {
  const q = loadQueue(userId)
  if (!q.length) return
  const remaining: SyncOp[] = []
  for (const op of q) {
    let ok = false
    if (op.type === 'upsert_meta') {
      ok = (await apiJson(`/api/conversations/${op.conversationId}`, { method: 'PUT', body: JSON.stringify({ title: op.title, pinned: op.pinned, project_id: op.project_id }) })).ok
    } else if (op.type === 'upsert_messages') {
      ok = (await apiJson(`/api/conversations/${op.conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ title: op.title, messages: op.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.timestamp })) }),
      })).ok
    } else if (op.type === 'delete') {
      const r = await apiJson(`/api/conversations/${op.conversationId}`, { method: 'DELETE' })
      ok = r.ok || r.status === 404
      if (ok) savePendingDeletes(userId, loadPendingDeletes(userId).filter((id) => id !== op.conversationId))
    }
    if (!ok) remaining.push(op)
  }
  saveQueue(userId, remaining)
}

export async function migrateLocalToCloud(userId: string): Promise<number> {
  if (!userId) return 0
  try { if (localStorage.getItem(`${MIGRATED_KEY}:${userId}`) === '1') return 0 } catch { /* */ }
  const local = loadLocal(userId)
  const guest = loadLocal(null)
  const combined = [...local]
  for (const c of guest) if (!combined.some((x) => x.id === c.id)) combined.push(c)
  let n = 0
  for (const c of combined.slice(0, 80)) {
    if (!c.messages?.length) continue
    const r = await apiJson(`/api/conversations/${c.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ title: c.title, messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.timestamp })) }),
    })
    if (r.ok) n++
  }
  try { localStorage.setItem(`${MIGRATED_KEY}:${userId}`, '1') } catch { /* */ }
  return n
}
export const migrateLocalToSupabase = migrateLocalToCloud

async function pullFromServer(userId: string): Promise<Conversation[]> {
  const r = await apiJson('/api/conversations?limit=80')
  if (!r.ok || !Array.isArray(r.data?.conversations)) return loadLocal(userId)
  const pendingDel = new Set(loadPendingDeletes(userId))
  const local = loadLocal(userId)
  const localMap = new Map(local.map((c) => [c.id, c]))
  const merged: Conversation[] = []
  for (const row of r.data.conversations as any[]) {
    if (pendingDel.has(row.id)) continue
    const existing = localMap.get(row.id)
    const serverUpdated = row.updated_at ? new Date(row.updated_at).getTime() : 0
    if (existing && (existing.updatedAt || 0) > serverUpdated && existing.messages?.length) {
      merged.push(existing)
    } else {
      merged.push({
        id: row.id, title: row.title || existing?.title || 'Chat',
        messages: existing?.messages || [],
        updatedAt: serverUpdated || existing?.updatedAt || Date.now(),
        pinned: !!row.pinned, project_id: row.project_id || null,
      } as Conversation)
    }
    localMap.delete(row.id)
  }
  for (const c of localMap.values()) if (!pendingDel.has(c.id)) merged.push(c)
  merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  saveLocal(userId, merged)
  return merged
}

export async function ensureConversation(userId: string | null, conversationId: string, title: string): Promise<string> {
  const items = loadLocal(userId)
  if (!items.some((c) => c.id === conversationId)) {
    items.unshift({ id: conversationId, title: title || 'Chat', messages: [], updatedAt: Date.now() })
    saveLocal(userId, items)
  }
  if (userId) enqueue(userId, { type: 'upsert_meta', conversationId, title: title || 'Chat' })
  return conversationId
}

export async function persistMessage(userId: string | null, conversationId: string, message: Message, title?: string): Promise<void> {
  const items = loadLocal(userId)
  let conv = items.find((c) => c.id === conversationId)
  if (!conv) { conv = { id: conversationId, title: title || 'Chat', messages: [], updatedAt: Date.now() }; items.unshift(conv) }
  const stored = toStoredMessage(message)
  const idx = conv.messages.findIndex((m) => m.id === stored.id)
  if (idx >= 0) conv.messages[idx] = stored
  else conv.messages.push(stored)
  if (title && (!conv.title || conv.title === 'Chat')) conv.title = title
  conv.updatedAt = Date.now()
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  saveLocal(userId, items)
  if (userId) enqueue(userId, { type: 'upsert_messages', conversationId, messages: [stored], title: conv.title })
}

export async function listConversations(userId: string | null): Promise<Conversation[]> {
  if (!userId) return loadLocal(null)
  const local = loadLocal(userId)
  void (async () => { await migrateLocalToCloud(userId); await flushQueue(userId); await pullFromServer(userId) })()
  if (local.length === 0) {
    try { return await pullFromServer(userId) } catch { return local }
  }
  return local
}

export async function loadConversationMessages(userId: string | null, conversationId: string): Promise<Message[]> {
  const local = loadLocal(userId).find((c) => c.id === conversationId)
  if (local?.messages?.length) return local.messages
  if (!userId) return []
  const r = await apiJson(`/api/conversations/${conversationId}`)
  if (r.ok && Array.isArray(r.data?.messages)) {
    const msgs = r.data.messages as Message[]
    const items = loadLocal(userId)
    const conv = items.find((c) => c.id === conversationId)
    if (conv) { conv.messages = msgs; saveLocal(userId, items) }
    return msgs
  }
  return local?.messages || []
}

export async function upsertConversation(userId: string | null, conversation: Conversation): Promise<void> {
  const items = loadLocal(userId)
  const idx = items.findIndex((c) => c.id === conversation.id)
  if (idx >= 0) items[idx] = conversation
  else items.unshift(conversation)
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  saveLocal(userId, items)
  if (userId) {
    enqueue(userId, { type: 'upsert_meta', conversationId: conversation.id, title: conversation.title, pinned: !!(conversation as any).pinned, project_id: (conversation as any).project_id ?? null })
    if (conversation.messages?.length) {
      enqueue(userId, { type: 'upsert_messages', conversationId: conversation.id, messages: conversation.messages.map(toStoredMessage), title: conversation.title })
    }
  }
}

export async function deleteConversation(userId: string | null, conversationId: string): Promise<void> {
  saveLocal(userId, loadLocal(userId).filter((c) => c.id !== conversationId))
  if (userId) {
    const pd = loadPendingDeletes(userId)
    if (!pd.includes(conversationId)) { pd.push(conversationId); savePendingDeletes(userId, pd) }
    enqueue(userId, { type: 'delete', conversationId })
  }
}

export function startSyncLoop(userId: string | null) {
  if (!userId || typeof window === 'undefined') return
  const run = () => { void migrateLocalToCloud(userId); void flushQueue(userId) }
  run()
  window.addEventListener('online', run)
  return () => window.removeEventListener('online', run)
}
