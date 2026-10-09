/**
 * Speech-to-text — server-side only.
 *
 * NYVEN voice architecture centers on OpenRouter for TTS (Fish Audio / Sua).
 * OpenRouter does not reliably expose a standard Whisper STT product API for
 * arbitrary models, so STT is configured explicitly when available:
 *
 *   STT_API_BASE + STT_API_KEY  → any OpenAI-compatible /audio/transcriptions
 *   OPENROUTER_API_KEY + OPENROUTER_STT_MODEL → optional OpenRouter-compatible path
 *     (only when you intentionally set OPENROUTER_STT_MODEL)
 *
 * Groq / OpenAI are NOT required by NYVEN and are not mentioned in user-facing
 * errors. Do not invent transcripts when STT is unavailable.
 */

import { VOICE_LIMITS, type STTOptions, type STTResult } from './types'

export type STTEnv = {
  /** Generic OpenAI-compatible transcription base (…/audio/transcriptions or host root) */
  STT_API_BASE?: string
  STT_API_KEY?: string
  STT_MODEL?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_STT_MODEL?: string
}

function resolveSTT(env: STTEnv): {
  url: string
  apiKey: string
  model: string
  provider: string
} | null {
  // 1) Explicit STT endpoint (preferred — truthful, provider-agnostic)
  const base = (env.STT_API_BASE || '').replace(/\/$/, '')
  const key = env.STT_API_KEY || env.OPENROUTER_API_KEY
  if (base && key) {
    const url = base.includes('/audio/transcriptions')
      ? base
      : `${base}/audio/transcriptions`
    return {
      url,
      apiKey: key,
      model: env.STT_MODEL || env.OPENROUTER_STT_MODEL || 'whisper-1',
      provider: 'stt_api',
    }
  }

  // 2) Optional OpenRouter path only when STT model is explicitly configured
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_STT_MODEL) {
    return {
      url: 'https://openrouter.ai/api/v1/audio/transcriptions',
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_STT_MODEL,
      provider: 'openrouter',
    }
  }

  return null
}

export function sttAvailable(env: STTEnv): boolean {
  return resolveSTT(env) !== null
}

export function sttCapabilityMessage(env: STTEnv): string {
  if (sttAvailable(env)) return 'Speech recognition is available.'
  return (
    'Speech recognition is not configured on the server. ' +
    'Set STT_API_BASE and STT_API_KEY (OpenAI-compatible transcriptions), ' +
    'or OPENROUTER_API_KEY with OPENROUTER_STT_MODEL if your OpenRouter account exposes STT. ' +
    'Text chat and OpenRouter TTS (Fish Audio / Sua) work independently.'
  )
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
      message: sttCapabilityMessage(env),
    }
  }

  const form = new FormData()
  const mime = options?.mimeType || 'audio/webm'
  form.append('file', new Blob([audio], { type: mime }), filename || 'recording.webm')
  form.append('model', cfg.model)
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
        ...(cfg.provider === 'openrouter'
          ? {
              'HTTP-Referer': 'https://nyven.app',
              'X-Title': 'NYVEN',
            }
          : {}),
      },
      body: form,
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('STT provider error', cfg.provider, res.status, errText.slice(0, 300))
      return {
        ok: false,
        code: 'STT_PROVIDER_ERROR',
        message:
          res.status === 401 || res.status === 403
            ? 'Speech recognition credentials were rejected by the provider.'
            : 'Speech recognition failed. Please try again or type your message.',
      }
    }

    const data = (await res.json().catch(() => ({}))) as {
      text?: string
      language?: string
    }
    const text = String(data.text || '').trim()
    if (!text) {
      return {
        ok: false,
        code: 'EMPTY_TRANSCRIPT',
        message: 'Could not understand the audio. Please try again.',
      }
    }
    return {
      ok: true,
      result: { text, language: data.language },
    }
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError') {
      return { ok: false, code: 'STT_TIMEOUT', message: 'Speech recognition timed out.' }
    }
    console.error('STT request failed', e)
    return {
      ok: false,
      code: 'STT_FAILED',
      message: 'Speech recognition failed. Please try again or type your message.',
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
