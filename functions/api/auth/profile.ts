import { optionsResponse, jsonWithCors } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { updateDisplayName } from '../../_shared/auth/service'
interface Env { DB?: D1Database; APP_URL?: string; ALLOWED_ORIGINS?: string; AUTH_SESSION_SECRET?: string }
export const onRequestOptions: PagesFunction<Env> = async (c) => optionsResponse(c.request, c.env, 'POST, OPTIONS')
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { displayName?: string }
  try { body = await request.json() as typeof body } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }
  const result = await updateDisplayName(env, request, body.displayName || '')
  if (!result.ok) return jsonWithCors(request, env, { success: false, code: result.code, error: result.message }, result.httpStatus)
  return jsonWithCors(request, env, { success: true, user: result.user }, 200)
}
