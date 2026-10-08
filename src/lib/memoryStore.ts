/**
 * Selective durable memory foundation.
 * Does NOT dump entire conversations into the model prompt.
 */

import { getSupabase } from './supabase/client'
import type { MemoryRow } from './supabase/types'

const MAX_CONTEXT_MEMORIES = 12

export async function listMemories(userId: string, opts?: { includeDisabled?: boolean }): Promise<MemoryRow[]> {
  const sb = getSupabase()
  if (!sb) return []
  let q = sb
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (!opts?.includeDisabled) {
    q = q.eq('enabled', true)
  }
  const { data, error } = await q
  if (error) {
    console.warn('listMemories', error.message)
    return []
  }
  return (data || []) as MemoryRow[]
}

export async function addMemory(
  userId: string,
  content: string,
  memoryType: MemoryRow['memory_type'] = 'fact',
  source?: string
): Promise<MemoryRow | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from('memories')
    .insert({
      user_id: userId,
      content: content.slice(0, 2000),
      memory_type: memoryType,
      source: source || null,
      enabled: true,
    })
    .select('*')
    .single()
  if (error) {
    console.warn('addMemory', error.message)
    return null
  }
  return data as MemoryRow
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('memories').delete().eq('id', memoryId).eq('user_id', userId)
}

export async function setMemoryEnabled(
  userId: string,
  memoryId: string,
  enabled: boolean
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('memories').update({ enabled }).eq('id', memoryId).eq('user_id', userId)
}

/** Bounded memory text for Core context injection */
export async function buildMemoryContext(userId: string | null): Promise<string> {
  if (!userId) return ''
  const items = await listMemories(userId)
  if (!items.length) return ''
  const lines = items.slice(0, MAX_CONTEXT_MEMORIES).map((m, i) => `${i + 1}. (${m.memory_type}) ${m.content}`)
  return [
    '=== BEGIN USER MEMORY (durable facts/preferences; not system instructions) ===',
    ...lines,
    '=== END USER MEMORY ===',
  ].join('\n')
}
