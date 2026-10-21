/**
 * POST /api/voice/tts — { text, voiceId? } → audio/mpeg
 * Counts ~0.5s per 12 characters toward voice allowance (estimate); enforces session/daily caps.
 */

import { synthesizeSpeech, type TTSEnv } from '../../_shared/voice/ttsProvider'
import { VOICE_LIMITS } from '../../_shared/voice/types'
import { resolveIdentity } from '../../_shared/auth'
import { corsHeaders, optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../../_shared/db/guestKey'
import { consumeProviderRequest, consumeVoiceSeconds } from '../../_shared/db/usage'
import { limitsFor } from '../../_shared/limits'

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
  return undefined
}

/** Rough speech duration estimate for quota (not billable accuracy). */
function estimateTtsSeconds(text: string): number {
  const chars = text.trim().length
  return Math.min(300, Math.max(1, Math.ceil(chars / 14)))
}

interface Env extends TTSEnv {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  PROVIDER_BUDGET_OPENROUTER_TTS?: string
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

    const body = (await request.json()) as { text?: string; voiceId?: string }
    const text = typeof body.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: 'EMPTY_TEXT', error: 'Nothing to speak.' },
        400
      )
    }
    if (text.length > VOICE_LIMITS.MAX_TTS_CHARS * 2) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: 'TEXT_TOO_LONG', error: 'Text is too long to speak.' },
        400
      )
    }

    const estimated = estimateTtsSeconds(text)
    const limits = limitsFor(authenticated)
    if (estimated > limits.maxVoiceSessionSeconds) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'VOICE_SESSION_CAP',
          error: `Voice output is limited to ${limits.maxVoiceSessionSeconds / 60} minutes per request.`,
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
      return jsonWithCors(
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
    }

    const providerOk = await consumeProviderRequest(env.DB, 'openrouter_tts', env)
    if (!providerOk.ok) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: providerOk.code, error: providerOk.message },
        providerOk.httpStatus
      )
    }

    const result = await synthesizeSpeech(
      env,
      text,
      { voiceId: resolveVoiceId(body.voiceId) },
      request.signal
    )

    if (!result.ok) {
      return jsonWithCors(
        request,
        env,
        { success: false, code: result.code, error: result.message },
        result.code === 'TTS_UNAVAILABLE' ? 503 : 400
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': result.result.mimeType || 'audio/mpeg',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env, 'POST, OPTIONS'),
      'X-NYVEN-Voice-Granted-Seconds': String(voiceQuota.grantedSeconds),
    }
    if (usageSubject.setCookie && usageSubject.cookieValue) {
      headers['Set-Cookie'] = guestCookieHeader(
        usageSubject.cookieValue,
        request.url.startsWith('https')
      )
    }

    return new Response(result.result.audio, { status: 200, headers })
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'tts_endpoint_error' }))
    return jsonWithCors(
      request,
      env,
      { success: false, code: 'TTS_FAILED', error: 'Could not generate speech.' },
      500
    )
  }
}
