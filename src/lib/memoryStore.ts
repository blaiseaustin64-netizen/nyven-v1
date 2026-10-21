/**
 * Memory store — D1 /api/memories when signed in, localStorage for guests.
 */

const LOCAL_KEY = 'nyven_memories_v1'

export type MemoryItem = {
  id: string
  content: string
  memory_type?: string
  source?: string | null
  enabled?: boolean
  created_at?: string
  updated_at?: string
}

function loadLocal(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    return JSON.parse(raw) as MemoryItem[]
  } catch {
    return []
  }
}

function saveLocal(items: MemoryItem[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 100)))
  } catch {
    /* ignore */
  }
}

export async function listMemories(userId: string | null): Promise<MemoryItem[]> {
  if (!userId) return loadLocal()
  try {
    const res = await fetch('/api/memories', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      memories?: MemoryItem[]
    }
    if (res.ok && data.success && Array.isArray(data.memories)) return data.memories
  } catch {
    /* fall through */
  }
  return loadLocal()
}

export async function addMemory(
  userId: string | null,
  content: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const trimmed = content.trim().slice(0, 2000)
  if (!trimmed) return { ok: false, error: 'Empty memory.' }
  if (!userId) {
    const id = crypto.randomUUID()
    const items = loadLocal()
    items.unshift({ id, content: trimmed, created_at: new Date().toISOString() })
    saveLocal(items)
    return { ok: true, id }
  }
  try {
    const res = await fetch('/api/memories', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      id?: string
      error?: string
    }
    if (!res.ok || !data.success) return { ok: false, error: data.error || 'Save failed.' }
    return { ok: true, id: data.id }
  } catch {
    return { ok: false, error: 'Network error.' }
  }
}

export async function deleteMemory(
  userId: string | null,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!userId) {
    saveLocal(loadLocal().filter((m) => m.id !== id))
    return { ok: true }
  }
  try {
    const res = await fetch(`/api/memories?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (!res.ok || !data.success) return { ok: false, error: data.error || 'Delete failed.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error.' }
  }
}
