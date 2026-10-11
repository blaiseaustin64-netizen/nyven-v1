/**
 * POST /api/connectors/github/start
 * GitHub OAuth start. Authenticated Supabase user OR pre-account owner cookie.
 */
import { resolveIdentity } from '../../../_shared/auth'
import { buildAuthorizeUrl, githubOAuthReadiness, type GitHubEnv } from '../../../_shared/github/service'
import { resolvePreAccountOwner } from '../../../_shared/github/preAccount'

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

  const readiness = githubOAuthReadiness(env, request.url)
  if (!readiness.ok) {
    return new Response(JSON.stringify({ success: false, code: 'CONFIG', error: readiness.error }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  if (!env.CONNECTOR_TOKEN_SECRET) {
    return new Response(
      JSON.stringify({
        success: false,
        code: 'CONFIG',
        error: 'CONNECTOR_TOKEN_SECRET is not set.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    )
  }

  let subjectId: string
  const setCookies: string[] = []

  const identity = await resolveIdentity(request, env, request.signal)
  if (identity.ok && identity.identity.authenticated && identity.identity.userId) {
    subjectId = identity.identity.userId
  } else if (!identity.ok && identity.code === 'AUTH_INVALID') {
    return new Response(
      JSON.stringify({ success: false, code: identity.code, error: identity.message }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    )
  } else {
    const owner = await resolvePreAccountOwner(request, env.CONNECTOR_TOKEN_SECRET)
    subjectId = owner.ownerId
    if (owner.setCookie) setCookies.push(owner.setCookie)
  }

  let returnTo = '/settings?section=connections'
  try {
    const body = (await request.json()) as { returnTo?: string }
    if (typeof body.returnTo === 'string') returnTo = body.returnTo
  } catch {
    /* optional */
  }

  const built = await buildAuthorizeUrl(env, request.url, subjectId, returnTo)
  if ('error' in built) {
    return new Response(JSON.stringify({ success: false, code: 'CONFIG', error: built.error }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const secure = request.url.startsWith('https')
  setCookies.push(
    [
      `nyven_gh_oauth=${encodeURIComponent(built.cookieValue)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${15 * 60}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ')
  )

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  for (const c of setCookies) headers.append('Set-Cookie', c)

  return new Response(JSON.stringify({ success: true, authorizeUrl: built.url }), {
    status: 200,
    headers,
  })
}
