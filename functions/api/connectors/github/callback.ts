/**
 * GET /api/connectors/github/callback
 * GitHub OAuth redirect. Validates state, exchanges code, stores encrypted token.
 */
import {
  callbackUrl,
  githubOAuthReadiness,
  unpackOAuthSession,
  parseVerifierAndState,
  exchangeCode,
  fetchGitHubUser,
  upsertGitHubConnection,
  resolveSafeReturnUrl,
  type GitHubEnv,
} from '../../../_shared/github/service'

interface Env extends GitHubEnv {}

function configError(message: string) {
  return new Response(
    JSON.stringify({ success: false, code: 'CONFIG', error: message }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  )
}

function redirect(url: string, clearCookie = true) {
  const headers = new Headers({ Location: url })
  if (clearCookie) {
    headers.append(
      'Set-Cookie',
      'nyven_gh_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    )
  }
  return new Response(null, { status: 302, headers })
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie') || ''
  const parts = raw.split(';')
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // The app origin must be explicitly configured. Without a valid origin there is
  // nowhere safe to redirect, so fail before touching any OAuth state.
  const readiness = githubOAuthReadiness(env, request.url)
  if (!readiness.ok) return configError(readiness.error)
  const origin = readiness.origin

  // Errors return the user to the page that started the flow once the session is read
  // (validated return path). Earlier failures fall back to Settings.
  let failBase = `${origin}/settings?section=connections`
  const fail = (code: string) => {
    const dest = new URL(failBase)
    dest.searchParams.set('github', 'error')
    dest.searchParams.set('reason', code)
    return redirect(dest.href)
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (oauthError) {
    return fail(oauthError === 'access_denied' ? 'denied' : 'oauth_error')
  }
  if (!code || !state) return fail('missing_params')

  const secret = env.CONNECTOR_TOKEN_SECRET
  if (!secret) return fail('config')

  const cookieVal = readCookie(request, 'nyven_gh_oauth')
  if (!cookieVal) return fail('missing_session')

  const session = await unpackOAuthSession(cookieVal, secret)
  if (!session) return fail('invalid_session')
  failBase = new URL(
    resolveSafeReturnUrl(origin, session.returnTo || '/settings?section=connections'),
    `${origin}/`
  ).href

  const vs = parseVerifierAndState(session.codeVerifier)
  if (!vs || vs.state !== state) return fail('state_mismatch')

  // Same validated origin as the authorize step, so redirect_uri matches exactly.
  const tokenResult = await exchangeCode(env, code, vs.codeVerifier, callbackUrl(origin))
  if ('error' in tokenResult) return fail('token_exchange')

  const ghUser = await fetchGitHubUser(tokenResult.access_token)
  if (!ghUser) return fail('github_user')

  const saved = await upsertGitHubConnection(
    env,
    session.userId,
    tokenResult,
    ghUser
  )
  if (!saved.ok) return fail('save_failed')

  // Session userId is the only owner for the write — never from query params
  const safePath = resolveSafeReturnUrl(origin, session.returnTo || '/settings?section=connections')
  const dest = new URL(safePath, `${origin}/`)
  if (dest.origin !== origin) {
    return fail('bad_redirect')
  }
  dest.searchParams.set('github', 'connected')
  // Absolute, built from the validated origin, so the redirect never depends on the Host the callback arrived on.
  return redirect(dest.href)
}
