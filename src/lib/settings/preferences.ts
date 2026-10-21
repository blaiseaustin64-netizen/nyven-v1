/**
 * User preferences — D1 via /api/preferences when signed in, localStorage otherwise.
 */

export type AIPreferences = {
  responseStyle: 'concise' | 'balanced' | 'detailed'
  memoryEnabled: boolean
  webSearchPreference: 'auto' | 'prefer_on' | 'prefer_off'
}

export type VoiceUIPreferences = {
  voiceEnabled: boolean
  autoSpeak: boolean
  voiceId: string
}

export type NyvenPreferences = {
  ai: AIPreferences
  voice: VoiceUIPreferences
  privacy: {
    shareUsageAnalytics: boolean
  }
}

export const DEFAULT_PREFERENCES: NyvenPreferences = {
  ai: {
    responseStyle: 'balanced',
    memoryEnabled: true,
    webSearchPreference: 'auto',
  },
  voice: {
    voiceEnabled: true,
    autoSpeak: true,
    voiceId: '933563129e564b19a115bedd57b7406a',
  },
  privacy: {
    shareUsageAnalytics: true,
  },
}

const LOCAL_KEY = 'nyven_preferences_v1'

function mergePrefs(partial: unknown): NyvenPreferences {
  const p = (partial && typeof partial === 'object' ? partial : {}) as Partial<NyvenPreferences>
  return {
    ai: { ...DEFAULT_PREFERENCES.ai, ...(p.ai || {}) },
    voice: { ...DEFAULT_PREFERENCES.voice, ...(p.voice || {}) },
    privacy: { ...DEFAULT_PREFERENCES.privacy, ...(p.privacy || {}) },
  }
}

export function loadLocalPreferences(): NyvenPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    return mergePrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function saveLocalPreferences(prefs: NyvenPreferences) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export async function loadPreferences(userId: string | null): Promise<NyvenPreferences> {
  if (!userId) return loadLocalPreferences()
  try {
    const res = await fetch('/api/preferences', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean
      preferences?: unknown
    }
    if (res.ok && data.success && data.preferences) {
      const merged = mergePrefs(data.preferences)
      saveLocalPreferences(merged)
      return merged
    }
  } catch {
    /* fall through */
  }
  return loadLocalPreferences()
}

export async function savePreferences(
  userId: string | null,
  prefs: NyvenPreferences
): Promise<{ ok: boolean; error?: string }> {
  saveLocalPreferences(prefs)
  if (!userId) return { ok: true }
  try {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: prefs }),
    })
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || 'Could not sync preferences to the server.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error syncing preferences.' }
  }
}
