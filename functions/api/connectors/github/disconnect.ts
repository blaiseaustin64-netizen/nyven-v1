/**
 * POST /api/connectors/github/disconnect
 */
import { resolveIdentity } from '../../../_shared/auth'
import { disconnectGitHub, type GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

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
  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok) {
    return json({ success: false, code: identity.code, error: identity.message }, 401)
  }
  if (!identity.identity.authenticated || !identity.identity.userId) {
    return json({ success: false, code: 'AUTH_REQUIRED', error: 'Sign in required.' }, 401)
  }

  const result = await disconnectGitHub(env, identity.identity.userId)
  if (!result.ok) {
    const status = result.code === 'CONFIG' ? 503 : 500
    return json(
      { success: false, code: result.code || 'DB_DISCONNECT', error: result.error },
      status
    )
  }
  return json({ success: true, connected: false, revoked: result.revoked === true }, 200)
}
