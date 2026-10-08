/**
 * Aggregate usage_events for the signed-in user (real data only).
 */

import { getSupabase } from '../supabase/client'

export type UsageSummary = {
  available: boolean
  message: number
  voice_stt: number
  voice_tts: number
  attachment: number
  web_search: number
  tool_call: number
  since: string
  error?: string
}

const EMPTY: UsageSummary = {
  available: false,
  message: 0,
  voice_stt: 0,
  voice_tts: 0,
  attachment: 0,
  web_search: 0,
  tool_call: 0,
  since: '',
}

export async function fetchUsageSummary(
  userId: string | null,
  days = 30
): Promise<UsageSummary> {
  if (!userId) {
    return { ...EMPTY, error: 'Sign in to view usage.' }
  }
  const sb = getSupabase()
  if (!sb) {
    return { ...EMPTY, error: 'Usage data is unavailable.' }
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('usage_events')
    .select('event_type, quantity')
    .eq('user_id', userId)
    .gte('created_at', since)

  if (error) {
    return { ...EMPTY, since, error: error.message }
  }

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    const t = row.event_type as string
    counts[t] = (counts[t] || 0) + (row.quantity || 0)
  }

  return {
    available: true,
    message: counts.message || 0,
    voice_stt: counts.voice_stt || 0,
    voice_tts: counts.voice_tts || 0,
    attachment: counts.attachment || 0,
    web_search: counts.web_search || 0,
    tool_call: counts.tool_call || 0,
    since,
  }
}
