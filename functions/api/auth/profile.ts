/**
 * PATCH /api/auth/profile — update authenticated user's display name in D1.
 * Never trusts client-provided user_id; session only.
 */
import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser, updateDisplayName } from '../../_shared/auth/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'PATCH, OPTIONS')

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, error: 'Auth storage unavailable.', code: 'AUTH_CONFIG' },
      503
    )
  }

  const sessionUser = await resolveSessionUser(env, request)
  if (!sessionUser) {
    return jsonWithCors(
      request,
      env,
      { success: false, error: 'Sign in required.', code: 'AUTH_REQUIRED' },
      401
    )
  }

  let body: { displayName?: string }
  try {
    body = (await request.json()) as { displayName?: string }
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON body.' }, 400)
  }

  const result = await updateDisplayName(env, sessionUser.id, body.displayName || '')
  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, error: result.message, code: result.code },
      result.httpStatus
    )
  }

  return jsonWithCors(
    request,
    env,
    { success: true, user: result.user },
    200
  )
}
