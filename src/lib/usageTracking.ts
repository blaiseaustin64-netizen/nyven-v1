/**
 * Durable usage tracking (authenticated). Guest usage stays local only.
 */

import { getSupabase } from './supabase/client'

export type UsageEventType =
  | 'message'
  | 'voice_stt'
  | 'voice_tts'
  | 'attachment'
  | 'web_search'
  | 'tool_call'

export async function recordUsage(
  userId: string | null,
  eventType: UsageEventType,
  quantity = 1,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!userId) return
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.from('usage_events').insert({
    user_id: userId,
    event_type: eventType,
    quantity,
    metadata,
  })
  if (error) console.warn('recordUsage', error.message)
}

export async function countUsageSince(
  userId: string,
  eventType: UsageEventType,
  sinceIso: string
): Promise<number> {
  const sb = getSupabase()
  if (!sb) return 0
  const { data, error } = await sb
    .from('usage_events')
    .select('quantity')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .gte('created_at', sinceIso)
  if (error || !data) return 0
  return data.reduce((s, r) => s + (r.quantity || 0), 0)
}
