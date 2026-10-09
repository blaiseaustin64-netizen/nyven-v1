/**
 * Speech-to-text — server-side only.
 *
 * NYVEN uses the existing OpenRouter server key for STT.
 * No separate STT provider, endpoint, or API key is required.
 *
 * Flow:
 *   MediaRecorder audio blob → /api/voice/stt → OpenRouter transcription API
 *   → openai/whisper-large-v3 → transcript
 */

import { VOICE_LIMITS, type STTOptions, type STTResult } from './types'

const OPENROUTER_STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'
const DEFAULT_STT_MODEL = 'openai/whisper-large-v3'

export type STTEnv = {
  OPENROUTER_API_KEY?: string
}

export function sttAvailable(env: STTEnv): boolean {
  return Boolean(env.OPENROUTER_API_KEY)
}

export function sttCapabilityMessage(env: STTEnv): string {
  if (sttAvailable(env)) return 'Speech recognition is available.'
  return 'Speech recognition is not configured on the server. Set OPENROUTER_API_KEY for NYVEN voice.'
}

function normalizeMimeType(mimeType: string | undefined): string {
  return (mimeType || 'audio/webm').split(';', 1)[0].trim().toLowerCase()
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'mp4'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/ogg':
    case 'audio/opus':
      return 'ogg'
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav'
    case 'audio/flac':
      return 'flac'
    case 'audio/aac':
      return 'aac'
    case 'audio/webm':
    default:
      return 'webm'
  }
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

  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      code: 'STT_UNAVAILABLE',
      message: sttCapabilityMessage(env),
    }
  }

  const mimeType = normalizeMimeType(options?.mimeType)
  const extension = extensionForMimeType(mimeType)
  const safeFilename = filename?.trim() || `recording.${extension}`
  const form = new FormData()
  form.append(
    'file',
    new Blob([audio], { type: mimeType }),
    safeFilename.includes('.') ? safeFilename : `recording.${extension}`
  )
  form.append('model', DEFAULT_STT_MODEL)
  if (options?.language) form.append('language', options.language)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VOICE_LIMITS.STT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(OPENROUTER_STT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nyven.vexdyn.com',
        'X-Title': 'NYVEN',
      },
      body: form,
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(
        'OpenRouter STT error',
        DEFAULT_STT_MODEL,
        res.status,
        errText.slice(0, 300)
      )
      return {
        ok: false,
        code: res.status === 401 || res.status === 403 ? 'STT_AUTH_ERROR' : 'STT_PROVIDER_ERROR',
        message:
          res.status === 401 || res.status === 403
            ? 'Speech recognition credentials were rejected by OpenRouter.'
            : res.status === 429
              ? 'Speech recognition is temporarily rate limited. Please try again.'
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
    console.error('OpenRouter STT request failed', e)
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
