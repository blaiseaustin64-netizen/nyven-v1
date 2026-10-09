/**
 * Speech-to-text — server-side only, free providers.
 *
 * 1) Cloudflare Workers AI (no API key): @cf/openai/whisper-large-v3-turbo
 *    Needs a Workers AI binding named `AI` on the Pages project.
 * 2) Groq Whisper (optional fallback): needs GROQ_API_KEY.
 *
 * Switched from OpenRouter because OpenRouter's Whisper is paid (402).
 * No fake transcripts.
 */

import { VOICE_LIMITS, type STTOptions, type STTResult } from './types'

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo'
const CF_STT_MODEL = '@cf/openai/whisper-large-v3-turbo'

type CFAi = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export type STTEnv = {
  AI?: CFAi
  GROQ_API_KEY?: string
  STT_MODEL?: string
}

export type STTFailure = {
  ok: false
  code: string
  message: string
  /** Upstream HTTP status when available (safe to expose) */
  providerStatus?: number
  /** Short sanitized upstream message — never includes API keys */
  providerDetail?: string
}

export type STTOutcome = { ok: true; result: STTResult } | STTFailure

export function sttAvailable(env: STTEnv): boolean {
  return Boolean(env.AI || env.GROQ_API_KEY?.trim())
}

export function sttCapabilityMessage(env: STTEnv): string {
  if (sttAvailable(env)) return 'Speech recognition is available.'
  return (
    'Speech recognition is not configured on the server. ' +
    'Add a Workers AI binding named AI (or set GROQ_API_KEY) for NYVEN voice.'
  )
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

/** Extract a short safe detail from provider error JSON; strip secrets. */
function sanitizeProviderDetail(raw: string): string | undefined {
  if (!raw) return undefined
  let text = raw.slice(0, 400)
  try {
    const j = JSON.parse(raw) as {
      error?: { message?: string; code?: string | number }
      message?: string
    }
    text = String(j?.error?.message || j?.message || raw).slice(0, 200)
  } catch {
    text = raw.slice(0, 200)
  }
  text = text.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
  text = text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  text = text.replace(/[a-f0-9]{32,}/gi, '[redacted]')
  return text.trim() || undefined
}

export async function transcribeAudio(
  env: STTEnv,
  audio: ArrayBuffer,
  filename: string,
  options?: STTOptions,
  signal?: AbortSignal
): Promise<STTOutcome> {
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

  // 1) Cloudflare Workers AI (free daily allowance, no key)
  if (env.AI) {
    try {
      const out = (await env.AI.run(CF_STT_MODEL, {
        audio: toBase64(audio),
        ...(options?.language ? { language: options.language } : {}),
      })) as { text?: string }
      const cfText = String(out?.text || '').trim()
      if (cfText) return { ok: true, result: { text: cfText } }
      if (!env.GROQ_API_KEY?.trim()) {
        return {
          ok: false,
          code: 'EMPTY_TRANSCRIPT',
          message: 'Could not understand the audio. Please try again.',
        }
      }
    } catch (e) {
      console.error('Cloudflare STT failed', e)
      if (!env.GROQ_API_KEY?.trim()) {
        return {
          ok: false,
          code: 'STT_FAILED',
          message: 'Speech recognition failed. Please try again or type your message.',
        }
      }
    }
  }

  // 2) Groq fallback
  const apiKey = env.GROQ_API_KEY?.trim()
  const model = env.STT_MODEL?.trim() || DEFAULT_STT_MODEL
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
  form.append('model', model)
  form.append('response_format', 'json')
  if (options?.language) form.append('language', options.language)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VOICE_LIMITS.STT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const providerDetail = sanitizeProviderDetail(errText)
      console.error('Groq STT error', model, res.status, errText.slice(0, 300))
      const code =
        res.status === 401 || res.status === 403
          ? 'STT_AUTH_ERROR'
          : res.status === 429
            ? 'STT_RATE_LIMITED'
            : 'STT_PROVIDER_ERROR'
      const message =
        res.status === 401 || res.status === 403
          ? 'Speech recognition credentials were rejected by Groq.'
          : res.status === 429
            ? 'Speech recognition is temporarily rate limited. Please try again.'
            : providerDetail
              ? `Speech recognition failed (${res.status}): ${providerDetail}`
              : `Speech recognition failed (provider HTTP ${res.status}). Please try again or type your message.`
      return {
        ok: false,
        code,
        message,
        providerStatus: res.status,
        providerDetail,
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
    console.error('Groq STT request failed', e)
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
