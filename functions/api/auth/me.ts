import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resolveSessionUser } from '../../_shared/auth/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'GET, OPTIONS')

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  if (!env.DB) {
    return jsonWithCors(
      request,
      env,
      { success: false, configured: false, error: 'Auth storage unavailable.' },
      503
    )
  }
  const user = await resolveSessionUser(env, request)
  if (!user) {
    return jsonWithCors(request, env, { success: true, authenticated: false, user: null }, 200)
  }
  return jsonWithCors(
    request,
    env,
    { success: true, authenticated: true, user, configured: true },
    200
  )
}
