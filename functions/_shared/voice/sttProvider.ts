/**
 * Speech-to-text — OpenAI-compatible Whisper endpoint.
 *
 * Provider priority (server env only):
 * 1. GROQ_API_KEY  → https://api.groq.com/openai/v1/audio/transcriptions (whisper-large-v3)
 * 2. OPENAI_API_KEY → https://api.openai.com/v1/audio/transcriptions (whisper-1)
 * 3. OPENROUTER_API_KEY + OPENROUTER_STT_MODEL if set (experimental OpenAI-compatible path)
 *
 * No fake transcripts.
 */

import { VOICE_LIMITS, type STTOptions, type STTResult } from './types'

export type STTEnv = {
  GROQ_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_STT_MODEL?: string
  STT_API_BASE?: string
  STT_MODEL?: string
}

function resolveSTT(env: STTEnv): {
  url: string
  apiKey: string
  model: string
  provider: string
} | null {
  if (env.GROQ_API_KEY) {
    return {
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      apiKey: env.GROQ_API_KEY,
      model: env.STT_MODEL || 'whisper-large-v3',
      provider: 'groq',
    }
  }
  if (env.OPENAI_API_KEY) {
    return {
      url: 'https://api.openai.com/v1/audio/transcriptions',
      apiKey: env.OPENAI_API_KEY,
      model: env.STT_MODEL || 'whisper-1',
      provider: 'openai',
    }
  }
  // OpenRouter OpenAI-compatible audio path when explicitly configured
  if (env.OPENROUTER_API_KEY && (env.OPENROUTER_STT_MODEL || env.STT_API_BASE)) {
    return {
      url:
        env.STT_API_BASE ||
        'https://openrouter.ai/api/v1/audio/transcriptions',
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_STT_MODEL || env.STT_MODEL || 'openai/whisper-1',
      provider: 'openrouter',
    }
  }
  return null
}

export function sttAvailable(env: STTEnv): boolean {
  return resolveSTT(env) !== null
}

export async function transcribeAudio(
  env: STTEnv,
  audio: ArrayBuffer,
  filename: string,
  options?: STTOptions,
  signal?: AbortSignal
): Promise<{ ok: true; result: STTResult } | { ok: false; code: string; message: string }> {
  if (!audio || audio.byteLength === 0) {
    return { ok: false, code: 'EMPTY_AUDIO', message: 'No audio was captured.' }
  }
  if (audio.byteLength > VOICE_LIMITS.MAX_AUDIO_BYTES) {
    return {
      ok: false,
      code: 'AUDIO_TOO_LARGE',
      message: 'Recording is too long. Try a shorter message.',
    }
  }

  const cfg = resolveSTT(env)
  if (!cfg) {
    return {
      ok: false,
      code: 'STT_UNAVAILABLE',
      message:
        'Speech recognition is not configured. Set GROQ_API_KEY or OPENAI_API_KEY on the server.',
    }
  }

  const form = new FormData()
  const mime = options?.mimeType || 'audio/webm'
  const blob = new Blob([audio], { type: mime })
  form.append('file', blob, filename || 'recording.webm')
  form.append('model', cfg.model)
  form.append('response_format', 'json')
  if (options?.language) form.append('language', options.language)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VOICE_LIMITS.STT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('STT provider error', cfg.provider, res.status, errText.slice(0, 200))
      return {
        ok: false,
        code: res.status === 429 ? 'STT_RATE_LIMITED' : 'STT_FAILED',
        message:
          res.status === 429
            ? 'Speech recognition is temporarily rate limited. Please try again.'
            : 'Speech recognition failed. Please try again.',
      }
    }

    const data = (await res.json()) as { text?: string; language?: string }
    const text = (data.text || '').trim()
    if (!text) {
      return {
        ok: false,
        code: 'EMPTY_TRANSCRIPT',
        message: 'Could not understand the audio. Please try again.',
      }
    }
    return {
      ok: true,
      result: {
        text,
        language: data.language,
      },
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
      return { ok: false, code: 'ABORTED', message: 'Transcription cancelled.' }
    }
    return {
      ok: false,
      code: 'STT_FAILED',
      message: 'Speech recognition failed. Please try again.',
    }
  }
}
