/**
 * GET /api/connectors/github/repos
 * List repositories for the authenticated NYVEN user via their stored GitHub token.
 */
import { resolveIdentity } from '../../../_shared/auth'
import {
  getAccessTokenForUser,
  listUserRepos,
  type GitHubEnv,
} from '../../../_shared/github/service'

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok) {
    return json({ success: false, code: identity.code, error: identity.message }, 401)
  }
  if (!identity.identity.authenticated || !identity.identity.userId) {
    return json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in to list repositories.' },
      401
    )
  }

  const tokenResult = await getAccessTokenForUser(env, identity.identity.userId)
  if (!tokenResult.ok) {
    // NOT_CONNECTED is a confirmed state (client error). DB_READ and CONFIG are server-side
    // unavailability, so they are 503 rather than a misleading "not connected".
    const status =
      tokenResult.code === 'NOT_CONNECTED'
        ? 400
        : tokenResult.code === 'DB_READ' || tokenResult.code === 'CONFIG'
          ? 503
          : 500
    return json({ success: false, code: tokenResult.code, error: tokenResult.error }, status)
  }

  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') || '1') || 1
  const listed = await listUserRepos(tokenResult.token, { page, perPage: 50 })
  if ('error' in listed) {
    return json(
      { success: false, code: 'GITHUB_API', error: listed.error },
      listed.status === 401 || listed.status === 403 ? 400 : 502
    )
  }

  return json({ success: true, repos: listed.repos }, 200)
}
