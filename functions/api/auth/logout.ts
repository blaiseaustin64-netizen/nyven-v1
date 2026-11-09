import { optionsResponse, corsHeaders } from '../../_shared/cors'
import type { D1Database } from '../../_shared/db/types'
import { logoutSession } from '../../_shared/auth/service'
import { clearPreAccountGitHubCookie, clearCookieHeader, OWNER_COOKIE } from '../../_shared/github/preAccount'
import { requestIsHttps } from '../../_shared/auth/cookies'

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
  const { setCookie } = await logoutSession(env, request)
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
  headers.append('Set-Cookie', setCookie)
  const secure = requestIsHttps(request)
  headers.append('Set-Cookie', clearPreAccountGitHubCookie(secure))
  headers.append('Set-Cookie', clearCookieHeader(OWNER_COOKIE, secure))
  return new Response(JSON.stringify({ success: true }), { status: 200, headers })
}
