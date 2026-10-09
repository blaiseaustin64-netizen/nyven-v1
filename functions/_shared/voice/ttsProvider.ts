/**
 * Text-to-speech — OpenRouter primary (FREE Fish Audio S2.1 Pro Free + Sua).
 *
 * PRIMARY:
 *   Provider: OpenRouter
 *   Endpoint: https://openrouter.ai/api/v1/audio/speech
 *   Model:    fish-audio/s2.1-pro-free:free  ($0)
 *   Voice:    933563129e564b19a115bedd57b7406a  (Sarah on Fish Audio)
 *   Key:      OPENROUTER_API_KEY (server-side only)
 *
 * Optional fallback (not default): OPENAI_API_KEY → openai tts-1
 *
 * No laughter injection. No fake audio. Synthesizes response text only.
 */

import {
  DEFAULT_TTS_API_BASE,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  VOICE_LIMITS,
  type TTSOptions,
  type TTSResult,
} from './types'

export type TTSEnv = {
  OPENROUTER_API_KEY?: string
  OPENROUTER_TTS_MODEL?: string
  OPENROUTER_TTS_VOICE?: string
  TTS_API_BASE?: string
  TTS_MODEL?: string
  TTS_VOICE?: string
  OPENAI_API_KEY?: string
}

function resolveTTS(env: TTSEnv): {
  url: string
  apiKey: string
  model: string
  voice: string
  provider: string
} | null {
  const voice =
    env.OPENROUTER_TTS_VOICE ||
    env.TTS_VOICE ||
    DEFAULT_TTS_VOICE

  // Primary: OpenRouter free Fish Audio S2.1 Pro Free
  if (env.OPENROUTER_API_KEY) {
    return {
      url: env.TTS_API_BASE || DEFAULT_TTS_API_BASE,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_TTS_MODEL || env.TTS_MODEL || DEFAULT_TTS_MODEL,
      voice,
      provider: 'openrouter',
    }
  }

  // Optional fallback only
  if (env.OPENAI_API_KEY) {
    return {
      url: 'https://api.openai.com/v1/audio/speech',
      apiKey: env.OPENAI_API_KEY,
      model: env.TTS_MODEL || 'tts-1',
      voice: env.TTS_VOICE || 'nova',
      provider: 'openai',
    }
  }

  return null
}

export function ttsAvailable(env: TTSEnv): boolean {
  return resolveTTS(env) !== null
}

/**
 * Prepare text for natural conversational TTS.
 * Goal: clean speech input without destroying sentence rhythm.
 * Never inject laughter/SFX tags.
 */
export function prepareSpeakableText(raw: string): string {
  let t = (raw || '').trim()
  if (!t) return ''

  // Fenced code → short spoken placeholder (avoids reading tokens aloud)
  t = t.replace(/```[\s\S]*?```/g, ' Code omitted. ')
  // Inline code: speak the content without backticks
  t = t.replace(/`([^`]+)`/g, '$1')
  // Markdown links: speak label only
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // Bare URLs → skip (unnatural when read character-by-character)
  t = t.replace(/https?:\/\/\S+/gi, ' ')
  // Headings / bold / italic markers without eating apostrophes or hyphens
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2')
  t = t.replace(/(\*|_)(.*?)\1/g, '$2')
  // Remaining stray markdown symbols (not mid-word)
  t = t.replace(/[*#`>~]+/g, ' ')
  // Bullet/list markers → gentle pause via period
  t = t.replace(/^\s*[-*+]\s+/gm, '')
  t = t.replace(/^\s*\d+[.)]\s+/gm, '')
  // Strip Fish bracket emotion/SFX tags the model might dramatize
  t = t.replace(
    /\[(laughing|laughter|giggle|sighs?|whispers?|excited|sad|angry|nervously)[^\]]*\]/gi,
    ''
  )
  // Collapse whitespace but keep sentence-ending punctuation
  t = t.replace(/\r\n/g, '\n')
  t = t.replace(/\n{2,}/g, '. ')
  t = t.replace(/\n/g, ' ')
  t = t.replace(/\s{2,}/g, ' ')
  t = t.replace(/\s+([,.;:!?])/g, '$1')
  t = t.replace(/([.!?]){2,}/g, '$1')
  t = t.trim()

  if (t.length > VOICE_LIMITS.MAX_TTS_CHARS) {
    // Truncate on a sentence boundary when possible
    const cut = t.slice(0, VOICE_LIMITS.MAX_TTS_CHARS - 1)
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
    t = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim()
  }
  return t
}

export async function synthesizeSpeech(
  env: TTSEnv,
  text: string,
  options?: TTSOptions,
  signal?: AbortSignal
): Promise<{ ok: true; result: TTSResult } | { ok: false; code: string; message: string }> {
  const speak = prepareSpeakableText(text)
  if (!speak) {
    return { ok: false, code: 'EMPTY_TEXT', message: 'Nothing to speak.' }
  }

  const cfg = resolveTTS(env)
  if (!cfg) {
    return {
      ok: false,
      code: 'TTS_UNAVAILABLE',
      message:
        'Speech output is not configured. Set OPENROUTER_API_KEY on the server for NYVEN voice (Sua / Fish Audio free).',
    }
  }

  const voice = options?.voiceId || cfg.voice
  /**
   * OpenRouter Fish Audio synthesis body.
   * - response_format: explicit mp3 (OpenRouter defaults to pcm otherwise)
   * - temperature / top_p / repetition_penalty: Fish-supported top-level fields
   *   for more stable, less repetitive delivery (docs.fish.audio / OpenRouter)
   * - speed: only when explicitly requested; default natural rate (1.0)
   * Model + Sua voice id remain unchanged.
   */
  const body: Record<string, unknown> = {
    model: cfg.model,
    input: speak,
    voice,
    response_format: 'mp3',
  }
  if (options?.speed != null && options.speed !== 1) {
    body.speed = options.speed
  } else if (cfg.provider !== 'openrouter') {
    body.speed = 1.0
  }
  if (cfg.provider === 'openrouter') {
    // Stability-oriented defaults recommended for Fish conversational TTS
    body.temperature = 0.7
    body.top_p = 0.7
    body.repetition_penalty = 1.1
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VOICE_LIMITS.TTS_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (cfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://nyven.vexdyn.com'
      headers['X-Title'] = 'NYVEN'
    }

    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(
        'TTS provider error',
        cfg.provider,
        cfg.model,
        voice,
        res.status,
        errText.slice(0, 240)
      )
      return {
        ok: false,
        code: res.status === 429 ? 'TTS_RATE_LIMITED' : 'TTS_FAILED',
        message:
          res.status === 429
            ? 'Speech output is temporarily rate limited.'
            : 'Could not generate speech. The text response is still available.',
      }
    }

    const audio = await res.arrayBuffer()
    if (!audio.byteLength) {
      return {
        ok: false,
        code: 'TTS_FAILED',
        message: 'Could not generate speech. The text response is still available.',
      }
    }

    return {
      ok: true,
      result: {
        audio,
        mimeType: res.headers.get('content-type') || 'audio/mpeg',
      },
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      return { ok: false, code: 'ABORTED', message: 'Speech cancelled.' }
    }
    return {
      ok: false,
      code: 'TTS_FAILED',
      message: 'Could not generate speech. The text response is still available.',
    }
  }
}
