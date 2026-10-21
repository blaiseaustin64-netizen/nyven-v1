/**
 * POST /api/voice/stt — multipart audio → transcript (Workers AI Whisper, optional Groq).
 * Enforces daily voice allowance + provider budget when D1 is bound.
 * Optional form field: durationSeconds (server clamps; does not trust blindly).
 */

import { transcribeAudio, type STTEnv } from '../../_shared/voice/sttProvider'
import { VOICE_LIMITS } from '../../_shared/voice/types'
import { resolveIdentity } from '../../_shared/auth'
import { corsHeaders, optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../../_shared/db/guestKey'
import {
  consumeProviderRequest,
  consumeVoiceSeconds,
  getUsageSnapshot,
} from '../../_shared/db/usage'
import { limitsFor } from '../../_shared/limits'

interface Env extends STTEnv {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  PROVIDER_BUDGET_STT?: string
}

/** Rough upper bound: ~1KB/s for compressed webm is optimistic; use max(client, size heuristic) carefully */
function estimateSeconds(sizeBytes: number, clientSeconds: number | null): number {
  const fromSize = Math.ceil(sizeBytes / 2000) // conservative
  const fromClient =
    clientSeconds != null && clientSeconds > 0 && clientSeconds <= 300
      ? Math.ceil(clientSeconds)
      : fromSize
  return Math.min(300, Math.max(1, Math.min(fromClient, fromSize + 5)))
}

export const onRequestOptions: PagesFunction<Env> = async (context) =>
  optionsResponse(context.request, context.env, 'POST, OPTIONS', 'Content-Type, Authorization')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  try {
    const identityResult = await resolveIdentity(request, env, request.signal)
    if (!identityResult.ok) {
      const status = identityResult.code === 'AUTH_CONFIG' ? 503 : 401
      return jsonWithCors(
        request,
        env,
        { success: false, code: identityResult.code, error: identityResult.message },
        status
      )
    }
    const identity = identityResult.identity
    const userId = identity.authenticated ? identity.userId : undefined
    const usageSubject = await resolveUsageSubject(request, userId)
    const subject = usageSubject.subject
    const authenticated = !!identity.authenticated

    const ct = request.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: 'INVALID_REQUEST', error: 'Expected multipart audio.' },
        400
      )
    }

    const form = await request.formData()
    const file = form.get('audio')
    if (!file || typeof file === 'string') {
      return jsonWithCors(
        request,
        env,
        { success: false, code: 'INVALID_REQUEST', error: 'No audio provided.' },
        400
      )
    }

    const blob = file as File
    if (blob.size > VOICE_LIMITS.MAX_AUDIO_BYTES) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'AUDIO_TOO_LARGE',
          error: 'Recording is too long. Try a shorter message.',
        },
        400
      )
    }

    const rawDur = form.get('durationSeconds')
    const clientSeconds =
      typeof rawDur === 'string' ? parseFloat(rawDur) : null
    const estimated = estimateSeconds(
      blob.size,
      clientSeconds != null && Number.isFinite(clientSeconds) ? clientSeconds : null
    )

    const limits = limitsFor(authenticated)
    if (estimated > limits.maxVoiceSessionSeconds) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'VOICE_SESSION_CAP',
          error: `Voice sessions are limited to ${limits.maxVoiceSessionSeconds / 60} minutes.`,
        },
        400
      )
    }

    const voiceQuota = await consumeVoiceSeconds(
      env.DB,
      subject.type,
      subject.id,
      authenticated,
      estimated
    )
    if (!voiceQuota.ok) {
      const res = jsonWithCors(
        request,
        env,
        {
          success: false,
          code: voiceQuota.code,
          error: voiceQuota.message,
          usage: {
            voiceSeconds: voiceQuota.snapshot.voiceSeconds,
            voiceSecondsRemaining: voiceQuota.snapshot.voiceSecondsRemaining,
            limits: voiceQuota.snapshot.limits,
            resetsAt: voiceQuota.snapshot.resetsAt,
          },
        },
        voiceQuota.httpStatus
      )
      if (usageSubject.setCookie && usageSubject.cookieValue) {
        const h = new Headers(res.headers)
        h.append(
          'Set-Cookie',
          guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
        )
        return new Response(res.body, { status: res.status, headers: h })
      }
      return res
    }

    const providerOk = await consumeProviderRequest(env.DB, 'stt', env)
    if (!providerOk.ok) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: providerOk.code, error: providerOk.message },
        providerOk.httpStatus
      )
    }

    const buffer = await blob.arrayBuffer()
    const result = await transcribeAudio(
      env,
      buffer,
      blob.name || 'recording.webm',
      { mimeType: blob.type || 'audio/webm' },
      request.signal
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
      return jsonWithCors(
        request,
        env,
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

    const snap = await getUsageSnapshot(env.DB, subject.type, subject.id, authenticated)
    const body = {
      success: true,
      text: result.result.text,
      language: result.result.language,
      usage: {
        voiceSeconds: snap.voiceSeconds,
        voiceSecondsRemaining: snap.voiceSecondsRemaining,
        grantedSeconds: voiceQuota.grantedSeconds,
        limits: snap.limits,
        resetsAt: snap.resetsAt,
      },
    }
    const res = jsonWithCors(request, env, body, 200)
    if (usageSubject.setCookie && usageSubject.cookieValue) {
      const h = new Headers(res.headers)
      h.append(
        'Set-Cookie',
        guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
      )
      return new Response(res.body, { status: 200, headers: h })
    }
    return res
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'stt_endpoint_error' }))
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'STT_FAILED', error: 'Speech recognition failed.' },
      500
    )
  }
}
