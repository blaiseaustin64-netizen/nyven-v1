import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { resetPasswordWithToken } from '../../_shared/auth/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { token?: string; password?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const result = await resetPasswordWithToken(env, (body.token || '').trim(), body.password || '')
  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: result.code, error: result.message },
      result.httpStatus
    )
  }
  return jsonWithCors(
    request,
    env,
    { success: true, message: 'Password updated. You can sign in with your new password.' },
    200
  )
}
