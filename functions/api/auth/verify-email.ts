import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { verifyEmailToken, verifyEmailCode } from '../../_shared/auth/service'
import { checkBurst } from '../../_shared/db/usage'
import { clientIp } from '../../_shared/db/guestKey'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { token?: string; email?: string; code?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const burst = await checkBurst(env.DB, `auth-verify:${clientIp(request)}`, 20, 10 * 60_000)
  if (!burst.ok) return jsonWithCors(request, env, { success: false, code: burst.code, error: burst.message }, burst.httpStatus)
  const token = (body.token || '').trim()
  const result = token
    ? await verifyEmailToken(env, token)
    : await verifyEmailCode(env, body.email || '', body.code || '')
  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: result.code, error: result.message },
      400
    )
  }
  return jsonWithCors(request, env, { success: true, user: result.user }, 200)
}
