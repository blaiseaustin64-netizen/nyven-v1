/**
 * Voice preference foundation.
 * Default: Sua (Fish Audio model id via OpenRouter free TTS).
 */

export type VoicePreferences = {
  enabled: boolean
  /** Fish Audio voice model id (or legacy label) */
  voiceId: string
  autoSpeak: boolean
}

const KEY = 'nyven_voice_prefs_v1'

/** Verified Sua model id: https://fish.audio/m/de77377323004b48937473a795d86f1f/ */
const SUA_VOICE_ID = 'de77377323004b48937473a795d86f1f'

const DEFAULTS: VoicePreferences = {
  enabled: true,
  voiceId: SUA_VOICE_ID,
  autoSpeak: true,
}

function migrate(prefs: VoicePreferences): VoicePreferences {
  const id = (prefs.voiceId || '').toLowerCase()
  const legacy = new Set([
    'nova',
    'eve',
    'ara',
    'rex',
    'sal',
    'leo',
    'shimmer',
    'alloy',
    'echo',
    'fable',
    'onyx',
    'sua', // label → real id
  ])
  if (legacy.has(id) || id === 'sua') {
    return { ...prefs, voiceId: SUA_VOICE_ID }
  }
  return prefs
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
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
