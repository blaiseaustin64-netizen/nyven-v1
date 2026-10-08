/** Voice provider contracts — STT / TTS */

export type STTOptions = {
  language?: string
  mimeType?: string
}

export type STTResult = {
  text: string
  language?: string
  durationMs?: number
}

export type TTSOptions = {
  voiceId?: string
  speed?: number
}

export type TTSResult = {
  audio: ArrayBuffer
  mimeType: string
  durationMs?: number
}

export const VOICE_LIMITS = {
  MAX_AUDIO_BYTES: 8 * 1024 * 1024,
  MAX_RECORDING_MS: 90_000,
  MAX_TTS_CHARS: 4_000,
  STT_TIMEOUT_MS: 45_000,
  TTS_TIMEOUT_MS: 60_000,
} as const

/**
 * NYVEN primary TTS — OpenRouter free Fish Audio S2.1 Pro Free.
 * Model: fish-audio/s2.1-pro-free:free ($0)
 * Voice: Sua — Fish Audio public model ID from
 *   https://fish.audio/m/de77377323004b48937473a795d86f1f/
 * OpenRouter maps this ID via the `voice` field (same as Fish reference_id).
 */
export const DEFAULT_TTS_VOICE = 'de77377323004b48937473a795d86f1f'

/** Display name for prefs / UI */
export const DEFAULT_TTS_VOICE_LABEL = 'sua'

export const DEFAULT_TTS_MODEL = 'fish-audio/s2.1-pro-free:free'

export const DEFAULT_TTS_API_BASE = 'https://openrouter.ai/api/v1/audio/speech'
