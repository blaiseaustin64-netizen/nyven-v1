import { optionsResponse, corsHeaders, jsonWithCors } from '../../_shared/cors'
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
  try {
    if (!env.DB) {
      return jsonWithCors(
        request,
        env,
        {
          success: false,
          code: 'QUOTA_STORE_UNAVAILABLE',
          error: 'D1 binding DB is missing. Bind nyven-db as DB and redeploy.',
        },
        503
      )
    }

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

    const ch = corsHeaders(request, env, 'POST, OPTIONS')
    if (ch['Access-Control-Allow-Origin'] === '*') {
      const reqOrigin = request.headers.get('Origin')
      if (reqOrigin) {
        ch['Access-Control-Allow-Origin'] = reqOrigin
        ch['Access-Control-Allow-Credentials'] = 'true'
      }
    } else if (ch['Access-Control-Allow-Origin']) {
      ch['Access-Control-Allow-Credentials'] = 'true'
    }

    const headers = new Headers({
      'Content-Type': 'application/json',
      ...ch,
    })
    headers.append('Set-Cookie', result.setCookie)

    return new Response(
      JSON.stringify({
        success: true,
        user: result.user,
      }),
      { status: 200, headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('login route error', msg.slice(0, 200))
    return jsonWithCors(
      request,
      env,
      {
        success: false,
        code: 'LOGIN_EXCEPTION',
        error: `Sign in failed: ${msg.slice(0, 160)}`,
      },
      500
    )
  }
}
