import { optionsResponse, jsonWithCors, corsHeaders } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { loginUser } from '../../_shared/auth/service'

interface Env {
  DB?: D1Database
  APP_URL?: string
  ALLOWED_ORIGINS?: string
  AUTH_SESSION_SECRET?: string
}

export const onRequestOptions: PagesFunction<Env> = async (c) =>
  optionsResponse(c.request, c.env, 'POST, OPTIONS')

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  let body: { email?: string; password?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonWithCors(request, env, { success: false, error: 'Invalid JSON' }, 400)
  }

  const result = await loginUser(env, request, {
    email: body.email || '',
    password: body.password || '',
  })

  if (!result.ok) {
    return jsonWithCors(
      request,
      env,
      { success: false, code: result.code, error: result.message },
      result.httpStatus
    )
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
    ...corsHeaders(request, env, 'POST, OPTIONS'),
  })
  headers.append('Set-Cookie', result.setCookie)

  return new Response(
    JSON.stringify({
      success: true,
      user: result.user,
    }),
    { status: 200, headers }
  )
}
