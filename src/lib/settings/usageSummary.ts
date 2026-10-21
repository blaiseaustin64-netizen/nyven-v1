/**
 * Usage summary for Settings — server /api/usage (D1 + Cloudflare session).
 */

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
  chatLimit?: number
  chatRemaining?: number
  voiceLimitSeconds?: number
  voiceRemainingSeconds?: number
  maxSessionSeconds?: number
  resetsAt?: string
  timezone?: string
  source?: 'd1' | 'none'
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
  source: 'none',
}

export async function fetchUsageSummary(
  _userId: string | null,
  _days = 30
): Promise<UsageSummary> {
  try {
    const res = await fetch('/api/usage', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      dayKey?: string
      resetsAt?: string
      timezone?: string
      chat?: { used: number; remaining: number; limit: number }
      voice?: {
        usedSeconds: number
        remainingSeconds: number
        limitSeconds: number
        maxSessionSeconds: number
      }
      error?: string
    }
    if (!res.ok || !data.success || !data.chat || !data.voice) {
      return {
        ...EMPTY,
        error: data.error || 'Usage data is unavailable (is D1 bound?).',
      }
    }
    return {
      available: true,
      message: data.chat.used,
      voice_stt: data.voice.usedSeconds,
      voice_tts: 0,
      attachment: 0,
      web_search: 0,
      tool_call: 0,
      since: data.dayKey || '',
      chatLimit: data.chat.limit,
      chatRemaining: data.chat.remaining,
      voiceLimitSeconds: data.voice.limitSeconds,
      voiceRemainingSeconds: data.voice.remainingSeconds,
      maxSessionSeconds: data.voice.maxSessionSeconds,
      resetsAt: data.resetsAt,
      timezone: data.timezone,
      source: 'd1',
    }
  } catch {
    return { ...EMPTY, error: 'Network error loading usage.' }
  }
}
