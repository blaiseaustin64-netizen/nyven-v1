/**
 * POST /api/voice/stt — multipart audio → transcript (Workers AI Whisper, optional Groq).
 */

import { transcribeAudio, type STTEnv } from '../../_shared/voice/sttProvider'
import { VOICE_LIMITS } from '../../_shared/voice/types'

interface Env extends STTEnv {}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestOptions: PagesFunction<Env> = async () => json({}, 204)

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const ct = context.request.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return json(
        { success: false, code: 'INVALID_REQUEST', error: 'Expected multipart audio.' },
        400
      )
    }

    const form = await context.request.formData()
    const file = form.get('audio')
    if (!file || typeof file === 'string') {
      return json(
        { success: false, code: 'INVALID_REQUEST', error: 'No audio provided.' },
        400
      )
    }

    const blob = file as File
    if (blob.size > VOICE_LIMITS.MAX_AUDIO_BYTES) {
      return json(
        {
          success: false,
          code: 'AUDIO_TOO_LARGE',
          error: 'Recording is too long. Try a shorter message.',
        },
        400
      )
    }

    const buffer = await blob.arrayBuffer()
    const result = await transcribeAudio(
      context.env,
      buffer,
      blob.name || 'recording.webm',
      { mimeType: blob.type || 'audio/webm' },
      context.request.signal
    )

    if (!result.ok) {
      const status =
        result.code === 'STT_UNAVAILABLE'
          ? 503
          : result.code === 'STT_AUTH_ERROR'
            ? 401
            : result.code === 'STT_RATE_LIMITED'
              ? 429
              : 400
      return json(
        {
          success: false,
          code: result.code,
          error: result.message,
          providerStatus: result.providerStatus,
          providerDetail: result.providerDetail,
        },
        status
      )
    }

    return json(
      { success: true, text: result.result.text, language: result.result.language },
      200
    )
  } catch (e) {
    console.error('STT endpoint error', e)
    return json(
      { success: false, code: 'STT_FAILED', error: 'Speech recognition failed.' },
      500
    )
  }
}
