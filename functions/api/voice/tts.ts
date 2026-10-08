/**
 * POST /api/voice/tts — { text, voiceId? } → audio/mpeg
 */

import { synthesizeSpeech, type TTSEnv } from '../../_shared/voice/ttsProvider'
import { VOICE_LIMITS } from '../../_shared/voice/types'

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
      { voiceId: body.voiceId },
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
