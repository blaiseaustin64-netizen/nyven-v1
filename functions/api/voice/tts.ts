/**
 * POST /api/voice/tts — { text, voiceId? } → audio/mpeg
 */

import { synthesizeSpeech, type TTSEnv } from '../../_shared/voice/ttsProvider'
import { VOICE_LIMITS } from '../../_shared/voice/types'

/** Allowlisted Fish Audio voice IDs (Sarah, ALEX J, Adrian). Reject arbitrary client IDs. */
const ALLOWED_VOICE_IDS = new Set([
  '933563129e564b19a115bedd57b7406a', // Sarah
  '2a9605eeafe84974b5b20628d42c0060', // ALEX J
  'bf322df2096a46f18c579d0baa36f41d', // Adrian
  'de77377323004b48937473a795d86f1f', // legacy Sua → treated as Sarah downstream
])

function resolveVoiceId(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (ALLOWED_VOICE_IDS.has(raw)) {
    if (raw === 'de77377323004b48937473a795d86f1f') {
      return '933563129e564b19a115bedd57b7406a'
    }
    return raw
  }
  return undefined // fall through to server default
}

interface Env extends TTSEnv {}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as { text?: string; voiceId?: string }
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return json({ success: false, code: 'EMPTY_TEXT', error: 'Nothing to speak.' }, 400)
    }
    if (text.length > VOICE_LIMITS.MAX_TTS_CHARS * 2) {
      return json({ success: false, code: 'TEXT_TOO_LONG', error: 'Text is too long to speak.' }, 400)
    }

    const result = await synthesizeSpeech(
      context.env,
      text,
      { voiceId: resolveVoiceId(body.voiceId) },
      context.request.signal
    )

    if (!result.ok) {
      return json(
        { success: false, code: result.code, error: result.message },
        result.code === 'TTS_UNAVAILABLE' ? 503 : 400
      )
    }

    return new Response(result.result.audio, {
      status: 200,
      headers: {
        'Content-Type': result.result.mimeType || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    console.error('TTS endpoint error', e)
    return json(
      { success: false, code: 'TTS_FAILED', error: 'Could not generate speech.' },
      500
    )
  }
}
