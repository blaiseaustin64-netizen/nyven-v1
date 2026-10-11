/**
 * GET /api/connectors/github/status
 * Signed-in user (DB) or pre-account cookie. Never returns tokens.
 */
import { resolveIdentity } from '../../../_shared/auth'
import {
  getGitHubConnectionRow,
  githubConfigured,
  githubDbConfigured,
  githubOAuthReadiness,
  type GitHubEnv,
} from '../../../_shared/github/service'
import { toPublicConnection } from '../../../_shared/connectors'
import {
  loadPreAccountGitHub,
  resolvePreAccountOwner,
} from '../../../_shared/github/preAccount'

interface Env extends GitHubEnv {}

function json(body: unknown, status: number, cookies?: string[]) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })
  if (cookies) for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
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
  const configured = githubConfigured(env)
  const readiness = githubOAuthReadiness(env, request.url)

  if (!readiness.ok) {
    return json(
      {
        success: false,
        code: 'CONFIG',
        configured: false,
        connected: false,
        connection: null,
        error: readiness.error,
      },
      503
    )
  }

  const identity = await resolveIdentity(request, env, request.signal)
  if (!identity.ok && identity.code === 'AUTH_INVALID') {
    return json({ success: false, code: identity.code, error: identity.message }, 401)
  }

  if (identity.ok && identity.identity.authenticated && identity.identity.userId) {
    if (githubDbConfigured(env)) {
      const row = await getGitHubConnectionRow(env, identity.identity.userId)
      const connected = !!(row && row.status === 'connected')
      return json({
        success: true,
        configured: true,
        connected,
        mode: 'account',
        connection: row && connected ? toPublicConnection(row) : null,
      })
    }
  }

  if (!env.CONNECTOR_TOKEN_SECRET) {
    return json({
      success: true,
      configured: true,
      connected: false,
      mode: 'preaccount',
      connection: null,
    })
  }

  const owner = await resolvePreAccountOwner(request, env.CONNECTOR_TOKEN_SECRET)
  const cookies = owner.setCookie ? [owner.setCookie] : undefined
  const store = await loadPreAccountGitHub(request, env.CONNECTOR_TOKEN_SECRET, owner.ownerId)
  if (store) {
    return json(
      {
        success: true,
        configured: true,
        connected: true,
        mode: 'preaccount',
        connection: {
          id: 'preaccount',
          user_id: owner.ownerId,
          provider: 'github',
          status: 'connected',
          account_label: store.account_label,
          scopes: store.scopes,
          metadata: { github_user_id: store.github_user_id },
          connected_at: store.connected_at,
          created_at: store.connected_at,
          updated_at: store.connected_at,
        },
      },
      200,
      cookies
    )
  }

  return json(
    {
      success: true,
      configured: true,
      connected: false,
      mode: 'preaccount',
      connection: null,
    },
    200,
    cookies
  )
}
