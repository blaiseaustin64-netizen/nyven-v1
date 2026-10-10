/**
 * POST /api/connectors/github/start
 * Requires authenticated Supabase user. Returns GitHub authorize URL.
 */
import { resolveIdentity, extractBearerToken } from '../../../_shared/auth'
import { buildAuthorizeUrl, githubOAuthReadiness, type GitHubEnv } from '../../../_shared/github/service'

interface Env extends GitHubEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

function json(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
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

  // Configuration (including a valid explicit APP_URL) is checked before identity, as before.
  const readiness = githubOAuthReadiness(env, request.url)
  if (!readiness.ok) {
    return json({ success: false, code: 'CONFIG', error: readiness.error }, 503)
  }

  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok) {
    return json({ success: false, code: identity.code, error: identity.message }, 401)
  }
  if (!identity.identity.authenticated || !identity.identity.userId) {
    return json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in to connect GitHub.' },
      401
    )
  }

  let returnTo = '/settings?section=connections'
  try {
    const body = (await request.json()) as { returnTo?: string }
    if (typeof body.returnTo === 'string') returnTo = body.returnTo
  } catch {
    /* optional body */
  }

  const built = await buildAuthorizeUrl(
    env,
    request.url,
    identity.identity.userId,
    returnTo
  )
  if ('error' in built) {
    return json({ success: false, code: 'CONFIG', error: built.error }, 503)
  }

  const secure = request.url.startsWith('https')
  const cookie = [
    `nyven_gh_oauth=${encodeURIComponent(built.cookieValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${15 * 60}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')

  // state is inside cookie; GitHub also gets state from URL — bind them in cookie
  void extractBearerToken

  return json(
    { success: true, authorizeUrl: built.url },
    200,
    { 'Set-Cookie': cookie }
  )
}
