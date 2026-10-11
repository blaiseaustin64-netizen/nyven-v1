/**
 * GET /api/connectors/github/callback
 * Validates OAuth, exchanges code, stores credentials:
 * - Authenticated NYVEN user → encrypted row in connections (service role)
 * - Pre-account subject → encrypted HttpOnly cookie (accounts postponed)
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
  githubDbConfigured,
  type GitHubEnv,
} from '../../../_shared/github/service'
import {
  isPreAccountSubject,
  savePreAccountGitHub,
  clearPreAccountGitHubCookie,
} from '../../../_shared/github/preAccount'

interface Env extends GitHubEnv {}

function configError(message: string) {
  return new Response(JSON.stringify({ success: false, code: 'CONFIG', error: message }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function redirect(url: string, cookies: string[] = []) {
  const headers = new Headers({ Location: url })
  headers.append(
    'Set-Cookie',
    'nyven_gh_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  )
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie') || ''
  for (const p of raw.split(';')) {
    const [k, ...rest] = p.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return rest.join('=')
      }
    }
  }
  return null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const readiness = githubOAuthReadiness(env, request.url)
  if (!readiness.ok) return configError(readiness.error)
  const origin = readiness.origin

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

  const tokenResult = await exchangeCode(env, code, vs.codeVerifier, callbackUrl(origin))
  if ('error' in tokenResult) return fail('token_exchange')

  const ghUser = await fetchGitHubUser(tokenResult.access_token)
  if (!ghUser) return fail('github_user')

  const secure = origin.startsWith('https')
  const extraCookies: string[] = []

  if (isPreAccountSubject(session.userId)) {
    // Pre-account: encrypted cookie store (no Supabase user required)
    const set = await savePreAccountGitHub(
      {
        access_token: tokenResult.access_token,
        account_label: ghUser.login,
        scopes: (tokenResult.scope || 'read:user repo').split(/[\s,]+/).filter(Boolean),
        connected_at: new Date().toISOString(),
        github_user_id: ghUser.id,
        owner_id: session.userId,
      },
      secret,
      secure
    )
    extraCookies.push(set)
  } else {
    if (!githubDbConfigured(env)) {
      return fail('config')
    }
    const saved = await upsertGitHubConnection(env, session.userId, tokenResult, ghUser)
    if (!saved.ok) return fail('save_failed')
    // Clear any leftover pre-account cookie
    extraCookies.push(clearPreAccountGitHubCookie(secure))
  }

  const safePath = resolveSafeReturnUrl(
    origin,
    session.returnTo || '/settings?section=connections'
  )
  const dest = new URL(safePath, `${origin}/`)
  if (dest.origin !== origin) return fail('bad_redirect')
  dest.searchParams.set('github', 'connected')
  return redirect(dest.href, extraCookies)
}
