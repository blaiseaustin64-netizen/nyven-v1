/**
 * POST /api/connectors/github/disconnect
 */
import { resolveIdentity } from '../../../_shared/auth'
import { disconnectGitHub, type GitHubEnv } from '../../../_shared/github/service'
import {
  clearPreAccountGitHubCookie,
  resolvePreAccountOwner,
} from '../../../_shared/github/preAccount'

interface Env extends GitHubEnv {}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const secure = request.url.startsWith('https')
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })

  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok && identity.code === 'AUTH_INVALID') {
    return new Response(
      JSON.stringify({ success: false, code: identity.code, error: identity.message }),
      { status: 401, headers }
    )
  }

  if (identity.ok && identity.identity.authenticated && identity.identity.userId) {
    const result = await disconnectGitHub(env, identity.identity.userId)
    if (!result.ok) {
      const status = result.code === 'CONFIG' ? 503 : 500
      return new Response(
        JSON.stringify({
          success: false,
          code: result.code || 'DB_DISCONNECT',
          error: result.error,
        }),
        { status, headers }
      )
    }
    headers.append('Set-Cookie', clearPreAccountGitHubCookie(secure))
    return new Response(
      JSON.stringify({ success: true, connected: false, revoked: result.revoked === true }),
      { status: 200, headers }
    )
  }

  if (env.CONNECTOR_TOKEN_SECRET) {
    await resolvePreAccountOwner(request, env.CONNECTOR_TOKEN_SECRET)
  }
  headers.append('Set-Cookie', clearPreAccountGitHubCookie(secure))
  return new Response(JSON.stringify({ success: true, connected: false }), {
    status: 200,
    headers,
  })
}
