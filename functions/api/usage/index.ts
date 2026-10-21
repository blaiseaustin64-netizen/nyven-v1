/**
 * GET /api/usage — current period usage + limits for Settings UI.
 * Auth optional: guests see guest quotas via server-derived guest key.
 */

import { resolveIdentity } from '../../_shared/auth'
import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveUsageSubject, guestCookieHeader } from '../../_shared/db/guestKey'
import { getUsageSnapshot } from '../../_shared/db/usage'
import { USAGE_DAY_TIMEZONE } from '../../_shared/limits'

interface Env {
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  DB?: D1Database
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export const onRequestOptions: PagesFunction<Env> = async (context) =>
  optionsResponse(context.request, context.env, 'GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const identityResult = await resolveIdentity(request, env)
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

  const snapshot = await getUsageSnapshot(
    env.DB,
    subject.type,
    subject.id,
    !!identity.authenticated
  )

  const res = jsonWithCors(
    request,
    env,
    {
      success: true,
      authenticated: identity.authenticated,
      timezone: USAGE_DAY_TIMEZONE,
      dayKey: snapshot.dayKey,
      resetsAt: snapshot.resetsAt,
      chat: {
        used: snapshot.chatCount,
        remaining: snapshot.chatRemaining,
        limit: snapshot.limits.chatPerDay,
      },
      voice: {
        usedSeconds: snapshot.voiceSeconds,
        remainingSeconds: snapshot.voiceSecondsRemaining,
        limitSeconds: snapshot.limits.voiceSecondsPerDay,
        maxSessionSeconds: snapshot.limits.maxVoiceSessionSeconds,
      },
      d1Bound: !!env.DB,
    },
    200
  )

  if (usageSubject.setCookie && usageSubject.cookieValue) {
    const h = new Headers(res.headers)
    h.append(
      'Set-Cookie',
      guestCookieHeader(usageSubject.cookieValue, request.url.startsWith('https'))
    )
    return new Response(res.body, { status: 200, headers: h })
  }
  return res
}
