/**
 * Voice preference foundation — Sarah / ALEX J / Adrian via catalog.
 */

import {
  SARAH_FISH_ID,
  resolveFishVoiceId,
  isAllowedFishVoiceId,
} from './catalog'

export type VoicePreferences = {
  enabled: boolean
  /** Fish Audio voice model id */
  voiceId: string
  autoSpeak: boolean
}

const KEY = 'nyven_voice_prefs_v1'

const DEFAULTS: VoicePreferences = {
  enabled: true,
  voiceId: SARAH_FISH_ID,
  autoSpeak: true,
}

function migrate(prefs: VoicePreferences): VoicePreferences {
  const id = (prefs.voiceId || '').trim()
  const resolved = resolveFishVoiceId(id)
  return {
    enabled: prefs.enabled !== false,
    autoSpeak: prefs.autoSpeak !== false,
    voiceId: resolved,
  }
}

export function getVoicePreferences(): VoicePreferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as VoicePreferences
    const migrated = migrate(parsed)
    if (migrated.voiceId !== parsed.voiceId) {
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated))
      } catch {
        /* ignore */
      }
    }
    return migrated
  } catch {
    return { ...DEFAULTS }
  }
}

export function setVoicePreferences(patch: Partial<VoicePreferences>) {
  const next = migrate({ ...getVoicePreferences(), ...patch })
  if (patch.voiceId && !isAllowedFishVoiceId(resolveFishVoiceId(patch.voiceId))) {
    next.voiceId = SARAH_FISH_ID
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
