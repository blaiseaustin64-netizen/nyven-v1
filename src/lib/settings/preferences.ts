/**
 * User preferences — Supabase profile.preferences when signed in,
 * localStorage fallback for guests.
 */

import { getSupabase } from '../supabase/client'

export type AIPreferences = {
  responseStyle: 'concise' | 'balanced' | 'detailed'
  memoryEnabled: boolean
  webSearchPreference: 'auto' | 'prefer_on' | 'prefer_off'
}

export type VoiceUIPreferences = {
  voiceEnabled: boolean
  autoSpeak: boolean
  /** Fish Audio Sua model id by default */
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
  const sb = getSupabase()
  if (!sb) return loadLocalPreferences()
  const { data, error } = await sb
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return loadLocalPreferences()
  const merged = mergePrefs(data.preferences)
  saveLocalPreferences(merged)
  return merged
}

export async function savePreferences(
  userId: string | null,
  prefs: NyvenPreferences
): Promise<{ ok: boolean; error?: string }> {
  saveLocalPreferences(prefs)
  if (!userId) return { ok: true }
  const sb = getSupabase()
  if (!sb) return { ok: true }
  const { error } = await sb
    .from('profiles')
    .update({ preferences: prefs, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
